"""
Steps 4-5: train the DQN on real-demand traffic.

Each training EPISODE = one real hour (random hour from the TRAINING weeks) simulated for 3600 s in SUMO.
Inside an episode the agent repeatedly: observes the state -> picks (phase, green time) with epsilon-greedy ->
SUMO runs that green -> the environment returns the REWARD (Step 5: penalise queues and waiting, reward
throughput) -> the transition goes into the replay buffer -> the network learns from a random mini-batch.
Over many episodes the reward feedback teaches the DQN better signal-timing decisions.

Usage:
    python train.py --episodes 300            # train (saves a checkpoint every 10 episodes)
    python train.py --episodes 300 --resume   # continue an interrupted run
Outputs (in ./results): training_log.csv, models/dqn_last.pt, models/dqn_ep<N>.pt every 50 episodes.
Note: the test weeks are never used here, so the final comparison (Step 6) is on unseen data.
"""
import argparse
import csv
import os
import random
import time

import numpy as np
import torch

from dqn_agent import DQNAgent
from generate_routes import generate
from real_demand import RealDemand
from sumo_env import SumoEnv, HERE

parser = argparse.ArgumentParser()
parser.add_argument("--episodes", type=int, default=300)
parser.add_argument("--seed", type=int, default=0)
parser.add_argument("--eps-start", type=float, default=1.0)
parser.add_argument("--eps-end", type=float, default=0.05)
parser.add_argument("--decay-frac", type=float, default=0.6, help="fraction of episodes over which epsilon decays")
parser.add_argument("--save-every", type=int, default=10)
parser.add_argument("--resume", action="store_true")
parser.add_argument("--budget", type=float, default=1e9, help="stop after this many seconds (checkpoint is saved)")
args = parser.parse_args()

OUT = os.path.join(HERE, "results"); MODELS = os.path.join(OUT, "models")
os.makedirs(MODELS, exist_ok=True)
LOG = os.path.join(OUT, "training_log.csv")
LAST = os.path.join(MODELS, "dqn_last.pt")
FIELDS = ["episode", "hour", "vehicles", "epsilon", "decisions", "total_reward", "reward_queue", "reward_wait",
          "reward_throughput", "avg_queue", "avg_total_wait", "mean_loss", "seconds"]

random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed)
demand = RealDemand()
agent = DQNAgent(SumoEnv.state_size, SumoEnv.action_size)

start_ep = 0
if args.resume and os.path.exists(LAST):
    start_ep = agent.load(LAST)
    print(f"resumed from episode {start_ep}")
elif os.path.exists(LOG):
    os.remove(LOG)                                           # fresh run -> fresh log
new_log = not os.path.exists(LOG)


def epsilon_for(ep):
    """Linear decay from eps-start to eps-end over the first decay-frac of training, then constant."""
    decay_eps = max(1, int(args.decay_frac * args.episodes))
    return max(args.eps_end, args.eps_start - (args.eps_start - args.eps_end) * ep / decay_eps)


t_run = time.time()
last_ep = start_ep
for ep in range(start_ep, args.episodes):
    if time.time() - t_run > args.budget:
        print("time budget reached - stopping (checkpoint saved)"); break
    t0 = time.time()
    rng = np.random.default_rng([args.seed, ep])
    ts = demand.sample_train_hour(rng)                       # a random hour from the training weeks
    rou = os.path.join(OUT, "tmp_train.rou.xml")
    n_veh = generate(rou, duration=3600, demand_fn=demand.demand_fn(ts), seed=args.seed * 100_000 + ep)

    env = SumoEnv(routes=rou, seed=ep)
    state = env.reset()
    eps = epsilon_for(ep)
    done, decisions, total, losses = False, 0, 0.0, []
    parts = {"reward_queue": 0.0, "reward_wait": 0.0, "reward_throughput": 0.0}
    while not done:
        action = agent.select_action(state, eps)             # epsilon-greedy
        next_state, reward, done, info = env.step(action)    # reward feedback from the environment
        agent.remember(state, action, reward, next_state, done)
        loss = agent.learn()
        if loss is not None:
            losses.append(loss)
        for k in parts:
            parts[k] += info[k]
        state, total, decisions = next_state, total + reward, decisions + 1
    env.close()
    last_ep = ep + 1

    row = {"episode": ep + 1, "hour": str(ts), "vehicles": n_veh, "epsilon": round(eps, 3), "decisions": decisions,
           "total_reward": round(total, 1), **{k: round(v, 1) for k, v in parts.items()},
           "avg_queue": round(float(np.mean([m["total_queue"] for m in env.log])), 1),
           "avg_total_wait": round(float(np.mean([m["total_wait"] for m in env.log])), 1),
           "mean_loss": round(float(np.mean(losses)), 4) if losses else "", "seconds": round(time.time() - t0, 1)}
    with open(LOG, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        if new_log:
            w.writeheader(); new_log = False
        w.writerow(row)
    print(f"ep {ep+1:4d}/{args.episodes} | {ts:%a %H:%M} {n_veh:5d} veh | eps {eps:.2f} | decisions {decisions:3d} | "
          f"reward {total:8.1f} | avg queue {row['avg_queue']:5.1f} | loss {row['mean_loss']} | {row['seconds']}s", flush=True)

    if (ep + 1) % args.save_every == 0:
        agent.save(LAST, episode=ep + 1)
    if (ep + 1) % 50 == 0:
        agent.save(os.path.join(MODELS, f"dqn_ep{ep+1}.pt"), episode=ep + 1, save_memory=False)

agent.save(LAST, episode=last_ep)
if os.path.exists(os.path.join(OUT, "tmp_train.rou.xml")):
    os.remove(os.path.join(OUT, "tmp_train.rou.xml"))
