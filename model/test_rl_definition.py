"""Sanity check of the Step 3 RL definition: do rewards behave sensibly for simple policies?"""
import os, numpy as np
from generate_routes import generate
from real_demand import RealDemand
from sumo_env import SumoEnv, HERE, decode_action, DURATIONS, IN_LANES

d = RealDemand()
ts = max(d.eval_hours(), key=lambda t: d.counts[t])            # busiest evaluation hour
os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
rou = os.path.join(HERE, "results", "tmp_test.rou.xml")
n = generate(rou, duration=3600, demand_fn=d.demand_fn(ts), seed=7)
print(f"busiest test hour {ts}: {n} vehicles | state size {SumoEnv.state_size}, actions {SumoEnv.action_size}")
print("actions:", {a: decode_action(a) for a in range(SumoEnv.action_size)})

def run(policy, name):
    env = SumoEnv(routes=rou, seed=7); s = env.reset()
    total, steps, done = 0.0, 0, False
    parts = {'reward_queue': 0.0, 'reward_wait': 0.0, 'reward_throughput': 0.0}
    while not done:
        s, r, done, info = env.step(policy(s, steps)); total += r; steps += 1
        for k in parts: parts[k] += info[k]
    env.close()
    q = np.mean([m["total_queue"] for m in env.log])
    print(f"{name:34s} decisions {steps:3d} | return {total:8.1f} (queue {parts['reward_queue']:7.1f}, "
          f"wait {parts['reward_wait']:6.1f}, throughput {parts['reward_throughput']:+6.1f}) | avg queue {q:5.1f}")

rng = np.random.default_rng(0)
run(lambda s, i: (i % 2) * 4 + 3, "alternate phases, 40 s green each")      # crude fixed-time
run(lambda s, i: int(rng.integers(8)), "random actions")
def longest_queue(s, i):                                                      # simple adaptive rule
    q = s[0:32:4]                                                             # queue feature of the 8 lanes (N,N,S,S,E,E,W,W)
    ns, ew = q[0:4].sum(), q[4:8].sum()
    return (0 if ns >= ew else 1) * 4 + 1                                     # busiest road, 20 s green
run(longest_queue, "longest-queue rule, 20 s green")
os.remove(rou)
