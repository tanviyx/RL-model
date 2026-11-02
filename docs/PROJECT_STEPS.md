# Adaptive Traffic Signal Control with a Deep Q-Network (DQN)

## Step 1: Problem Identification and Requirement Analysis
- Traditional traffic signals use fixed timing, regardless of actual traffic density.
- Objective: adjust signal timings dynamically from real-time traffic conditions.
- Key objectives: reduce vehicle waiting time, minimize queue length, improve traffic throughput.
- Scope: one 4-way intersection (N, S, E, W), 2 lanes per approach, two signal phases (North/South green, East/West green).

## Step 2: Traffic Simulation and Data Collection
- Simulator: SUMO, controlled from Python through TraCI.
- Demand: real hourly vehicle counts from Junction 1 of the Kaggle *Traffic Prediction Dataset*
  (fedesoriano, 2021), https://www.kaggle.com/datasets/fedesoriano/traffic-prediction-dataset.
- Assumptions to state in the report:
  - Counts are multiplied by one constant (33.4) so the 95th-percentile training hour equals 3,000 vehicles/hour.
  - Counts are split across approaches as N 34%, S 29%, E 20%, W 17%.
  - Turning split: 70% straight, 15% right, 15% left.
- Train/test split: every 4th week is held out for testing (raw volumes grow ~3.5x over the 20 months).
- Data collected per lane: vehicle count, queue length, waiting time, density.
- Fixed-time baseline (SUMO program: 42 s green, 3 s yellow) on 48 test hours:
  - 84,477 of 87,817 vehicles completed (96.2%)
  - Average wait 30.1 s per vehicle (95th percentile 72 s, maximum 1,917 s); average time loss 43.3 s
  - Average queue 17.2, worst queue 125 vehicles; busiest 6 hours: 61.9 s average wait

## Step 3: Define the Reinforcement Learning Environment
- State (35 values): queue length, vehicle count, waiting time and occupancy for each of the 8 incoming lanes,
  plus the current phase (one-hot) and the time spent in it.
- Action (8 choices): which phase turns green (N/S or E/W) and for how long (10, 20, 30 or 40 s).
  Switching phase inserts a 3 s yellow; choosing the phase already green extends it.
- Reward: feedback computed over each chosen green interval (details in Step 5).
- Interface: `state = env.reset()`, `state, reward, done, info = env.step(action)`.

## Step 4: Develop the DQN Model using PyTorch (`dqn_agent.py`)
- Deep Q-Network: 35 -> 128 -> 128 -> 8 fully connected network; it learns the relationship between traffic
  conditions (states) and the value of each signal-control action.
- Experience replay: transitions (state, action, reward, next state, done) are stored (capacity 50,000) and the
  network learns from random mini-batches of 64.
- Target network: a copy of the Q-network, synchronised every 500 learning steps, used to compute the learning targets.
- Epsilon-greedy: epsilon decays linearly from 1.0 to 0.05 over the first 60% of training episodes, then stays at 0.05.
- Other settings: Adam optimiser (lr 1e-3), discount 0.95, Huber loss, gradient clipping.

## Step 5: Design the Reward-Based Optimization System (`sumo_env.py`, `train.py`)
- Reward for each decision = - queue cost - 0.5 x wait cost + 0.05 x vehicles through:
  - queue cost = stopped vehicle-seconds / 200 (penalises growing queues)
  - wait cost = average accumulated waiting time / 500 (penalises long individual waits, so no road is starved)
  - throughput bonus: +0.05 per vehicle that completes its trip (rewards flow)
- Sanity check on the busiest test hour (3,124 vehicles), total return per policy (higher is better):

| Policy | Return | Average queue |
|---|---|---|
| Alternate phases, 40 s green each | -955 | 56.4 |
| Random actions | -1,600 | 75.3 |
| Longest-queue rule, 20 s green | -534 | 33.5 |

- Training loop: each episode is one random real hour from the training weeks (3,600 s of SUMO). The agent picks an
  action, receives the reward, stores the experience and learns, repeated over many episodes.
- Each episode is logged to `results/training_log.csv` (reward parts, queue, wait, loss, epsilon).

## How to run
1. `pip install -r requirements.txt` and put the Kaggle file `traffic.csv` in this folder.
2. `python run_baseline_real.py` — final fixed-time baseline on the 48 test hours (resumable; run again if interrupted).
3. `python test_rl_definition.py` — sanity check of the state, actions and reward.
4. `python train.py --episodes 300` — train the DQN (add `--resume` to continue an interrupted run).

## Next
- Step 6: evaluate the trained DQN on the same 48 held-out test hours and compare it with the fixed-time baseline
  (average wait, 95th percentile, queue length, throughput).
