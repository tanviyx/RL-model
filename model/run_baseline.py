"""Run the fixed-time baseline (SUMO's built-in 42 s / 3 s yellow program) and report results."""
import os
import xml.etree.ElementTree as ET
import numpy as np
from generate_routes import generate
from sumo_env import SumoEnv, HERE, ROUTES

def summarize_tripinfo(path):
    trips = ET.parse(path).getroot().findall("tripinfo")
    wait = np.array([float(t.get("waitingTime")) for t in trips])
    loss = np.array([float(t.get("timeLoss")) for t in trips])
    return {"vehicles_completed": len(trips), "avg_waiting_time_s": wait.mean(),
            "max_waiting_time_s": wait.max(), "avg_time_loss_s": loss.mean()}

if __name__ == "__main__":
    out = os.path.join(HERE, "results"); os.makedirs(out, exist_ok=True)
    n = generate(ROUTES, duration=3600, seed=1)
    env = SumoEnv(controller="sumo_default", tripinfo=os.path.join(out, "tripinfo_fixed.xml"), duration=3600)
    env.reset()
    done = False
    while not done:
        _, _, done, _ = env.step()
    env.close()
    env.save_log(os.path.join(out, "log_fixed_time.csv"))
    s = summarize_tripinfo(os.path.join(out, "tripinfo_fixed.xml"))
    q = [m["total_queue"] for m in env.log]
    print(f"Vehicles generated      : {n}")
    print(f"State vector size       : {SumoEnv.state_size}")
    print(f"Vehicles completed      : {s['vehicles_completed']}")
    print(f"Avg waiting time / veh  : {s['avg_waiting_time_s']:.1f} s")
    print(f"Max waiting time        : {s['max_waiting_time_s']:.1f} s")
    print(f"Avg time loss / veh     : {s['avg_time_loss_s']:.1f} s")
    print(f"Avg / max total queue   : {np.mean(q):.1f} / {max(q)} vehicles")
