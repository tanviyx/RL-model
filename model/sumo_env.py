"""
Steps 2-3: SUMO traffic environment, data collection, and the Reinforcement Learning definition.

Intersection: 4 approaches (N, S, E, W), 2 lanes each = 8 incoming lanes.
Signal phases: 0 = North/South green, 1 = East/West green (3 s yellow when switching).

RL definition (Step 3)
  STATE  (35 values, normalised): per incoming lane [queue length, vehicle count, waiting time,
         occupancy] x 8 lanes, + current phase (one-hot, 2) + time spent in the current phase (1).
  ACTION (8 choices): which phase to turn green AND how long to hold it.
         action = phase * 4 + duration_index,  durations = 10, 20, 30, 40 seconds.
         Choosing the phase that is already green simply extends it (no yellow).
  REWARD (Steps 3 and 5), computed over the interval the chosen green lasted:
         - queue cost  : stopped vehicle-seconds / 200                (penalises long queues)
         - wait cost   : average accumulated waiting time / 500, x0.5 (penalises long individual waits,
                         so a quiet road is not starved)
         - throughput  : +0.05 per vehicle that completed its trip    (rewards flow)
         reward = -queue cost - 0.5 * wait cost + 0.05 * vehicles through.
         Yellow time is penalised automatically because cars keep waiting during it.

The Gym-style interface:  state = env.reset();  state, reward, done, info = env.step(action)
controller="sumo_default" leaves SUMO's own fixed-time program untouched (our baseline).
"""
import csv
import os
import numpy as np
import traci

HERE = os.path.dirname(os.path.abspath(__file__))
NET = os.path.join(HERE, "intersection.net.xml")
ROUTES = os.path.join(HERE, "routes.rou.xml")
TLS_ID = "C"
IN_LANES = [f"{a}_in_{i}" for a in "NSEW" for i in (0, 1)]
GREEN_STATE = {0: 0, 1: 2}      # our phase -> SUMO program phase index
YELLOW_STATE = {0: 1, 1: 3}     # yellow shown when leaving that phase
LANE_CAPACITY = 250 / 7.5       # vehicles that fit in a 250 m lane

DURATIONS = [10, 20, 30, 40]    # green durations the agent can choose (s)
NUM_PHASES = 2

# Step 5 reward weights (reward = -W_QUEUE*queue_cost - W_WAIT*wait_cost + W_THROUGHPUT*vehicles_through)
QUEUE_SCALE = 200.0             # stopped vehicle-seconds per unit of queue cost
WAIT_SCALE = 500.0              # accumulated waiting seconds (average over the interval) per unit of wait cost
W_QUEUE, W_WAIT, W_THROUGHPUT = 1.0, 0.5, 0.05


def decode_action(action):
    """action (0..7) -> (phase, green_seconds)."""
    return int(action) // len(DURATIONS), DURATIONS[int(action) % len(DURATIONS)]


class SumoEnv:
    state_size = len(IN_LANES) * 4 + 3          # 35
    action_size = NUM_PHASES * len(DURATIONS)   # 8

    def __init__(self, routes=ROUTES, duration=3600, delta_time=5, yellow=3,
                 controller="agent", tripinfo=None, seed=0, gui=False):
        self.routes, self.duration = routes, duration
        self.delta_time, self.yellow = delta_time, yellow     # delta_time: step size in sumo_default mode
        self.controller, self.tripinfo, self.seed, self.gui = controller, tripinfo, seed, gui
        self.log, self.running = [], False

    # ---- lifecycle ------------------------------------------------------
    def reset(self):
        self.close()
        cmd = ["sumo-gui" if self.gui else "sumo", "-n", NET, "-r", self.routes,
               "--no-step-log", "--no-warnings", "--seed", str(self.seed),
               "--waiting-time-memory", "1000", "--time-to-teleport", "-1"]
        if self.tripinfo:
            cmd += ["--tripinfo-output", self.tripinfo]
        traci.start(cmd)
        self.running = True
        self.phase, self.time_in_phase, self.log = 0, 0, []
        if self.controller == "agent":
            traci.trafficlight.setPhase(TLS_ID, GREEN_STATE[0])
            traci.trafficlight.setPhaseDuration(TLS_ID, 1e6)   # we control switching
        return self.get_state()

    def close(self):
        if self.running:
            traci.close()
            self.running = False

    # ---- state & metrics --------------------------------------------------
    def get_state(self):
        f = []
        for lane in IN_LANES:
            f += [min(traci.lane.getLastStepHaltingNumber(lane) / LANE_CAPACITY, 1.0),
                  min(traci.lane.getLastStepVehicleNumber(lane) / LANE_CAPACITY, 1.0),
                  min(traci.lane.getWaitingTime(lane) / 500.0, 1.0),
                  traci.lane.getLastStepOccupancy(lane) / 100.0]
        f += [1.0, 0.0] if self.phase == 0 else [0.0, 1.0]
        f += [min(self.time_in_phase / 60.0, 1.0)]
        return np.array(f, dtype=np.float32)

    def get_metrics(self):
        m = {"t": int(traci.simulation.getTime()), "phase": self.phase}
        for a in "NSEW":
            lanes = [f"{a}_in_0", f"{a}_in_1"]
            m[f"queue_{a}"] = sum(traci.lane.getLastStepHaltingNumber(l) for l in lanes)
            m[f"count_{a}"] = sum(traci.lane.getLastStepVehicleNumber(l) for l in lanes)
            m[f"wait_{a}"] = round(sum(traci.lane.getWaitingTime(l) for l in lanes), 1)
            m[f"density_{a}"] = round(np.mean([traci.lane.getLastStepOccupancy(l) for l in lanes]) / 100, 3)
        m["total_queue"] = sum(m[f"queue_{a}"] for a in "NSEW")
        m["total_wait"] = round(sum(m[f"wait_{a}"] for a in "NSEW"), 1)
        m["arrived"] = traci.simulation.getArrivedNumber()
        return m

    # ---- dynamics -----------------------------------------------------------
    def _sim_step(self):
        traci.simulationStep()
        self.log.append(self.get_metrics())

    def _finished(self):
        return traci.simulation.getTime() >= self.duration or traci.simulation.getMinExpectedNumber() == 0

    def step(self, action=None):
        """Advance the simulation. Returns (state, reward, done, info)."""
        start = len(self.log)
        if self.controller == "agent":
            phase, green = decode_action(action)
            if phase != self.phase:                              # switch: yellow, then new green
                traci.trafficlight.setPhase(TLS_ID, YELLOW_STATE[self.phase])
                for _ in range(self.yellow):
                    if self._finished(): break
                    self._sim_step()
                traci.trafficlight.setPhase(TLS_ID, GREEN_STATE[phase])
                traci.trafficlight.setPhaseDuration(TLS_ID, 1e6)
                self.phase, self.time_in_phase = phase, 0
            steps = green
        else:
            steps = self.delta_time
        for _ in range(steps):
            if self._finished(): break
            self._sim_step()
            self.time_in_phase += 1
            if self.controller != "agent":                       # follow SUMO's own program
                self.phase = 0 if traci.trafficlight.getPhase(TLS_ID) in (0, 1) else 1
        interval = self.log[start:]
        queue_cost = sum(m["total_queue"] for m in interval) / QUEUE_SCALE
        wait_cost = float(np.mean([m["total_wait"] for m in interval])) / WAIT_SCALE if interval else 0.0
        through = sum(m["arrived"] for m in interval)
        reward = -W_QUEUE * queue_cost - W_WAIT * wait_cost + W_THROUGHPUT * through
        done = self._finished()
        info = dict(interval[-1] if interval else self.get_metrics())
        info.update(reward_queue=-W_QUEUE * queue_cost, reward_wait=-W_WAIT * wait_cost,
                    reward_throughput=W_THROUGHPUT * through, green_seconds=len(interval))
        next_state = np.zeros(self.state_size, np.float32) if done else self.get_state()
        return next_state, reward, done, info

    # ---- data collection ------------------------------------------------------
    def save_log(self, path):
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(self.log[0].keys()))
            w.writeheader()
            w.writerows(self.log)
