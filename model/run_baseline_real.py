"""
Fixed-time baseline on REAL demand: one 3600 s SUMO run per evaluation hour.
Resumable: each hour is cached in results/_cache, so re-running continues where it stopped.
"""
import os, sys, time
import xml.etree.ElementTree as ET
import numpy as np, pandas as pd
from generate_routes import generate
from real_demand import RealDemand
from sumo_env import SumoEnv, HERE

def trip_stats(path):
    trips = ET.parse(path).getroot().findall("tripinfo")
    w = np.array([float(t.get("waitingTime")) for t in trips]); l = np.array([float(t.get("timeLoss")) for t in trips])
    return len(trips), w, l

def run_hour(i, ts, demand, cache):
    f = os.path.join(cache, f"hour_{i:02d}.npz")
    if os.path.exists(f):
        return
    rou, trip = os.path.join(cache, "tmp.rou.xml"), os.path.join(cache, "tmp_trip.xml")
    n = generate(rou, duration=3600, demand_fn=demand.demand_fn(ts), seed=i)
    env = SumoEnv(routes=rou, controller="sumo_default", tripinfo=trip, duration=3600, seed=i)
    env.reset(); done = False
    while not done: _, _, done, _ = env.step()
    env.close()
    done_n, w, l = trip_stats(trip)
    q = [m["total_queue"] for m in env.log]
    np.savez(f, hour=str(ts), generated=n, completed=done_n, wait=w, loss=l, avg_q=np.mean(q), max_q=max(q))

if __name__ == "__main__":
    out = os.path.join(HERE, "results"); cache = os.path.join(out, "_cache"); os.makedirs(cache, exist_ok=True)
    demand = RealDemand(); hours = demand.eval_hours()
    budget = float(sys.argv[1]) if len(sys.argv) > 1 else 1e9      # seconds of work allowed in this call
    t0 = time.time()
    print(f"Fixed-time baseline: {len(hours)} real hours, each a 3600 s SUMO run (roughly 5-15 s each)...", flush=True)
    for i, ts in enumerate(hours):
        if time.time() - t0 > budget: break
        cached = os.path.exists(os.path.join(cache, f"hour_{i:02d}.npz"))
        t1 = time.time()
        run_hour(i, ts, demand, cache)
        status = "already done" if cached else f"done in {time.time()-t1:.0f}s"
        print(f"[{i+1:2d}/{len(hours)}] {ts:%a %Y-%m-%d %H:%M}  {status}", flush=True)
    files = [os.path.join(cache, f"hour_{i:02d}.npz") for i in range(len(hours))]
    have = [f for f in files if os.path.exists(f)]
    if len(have) < len(hours):
        print(f"{len(have)}/{len(hours)} hours done - run again to continue"); sys.exit(0)
    rows, W, L = [], [], []
    for ts, f in zip(hours, files):
        z = np.load(f); W.append(z["wait"]); L.append(z["loss"])
        rows.append({"hour": ts, "real_count": int(demand.counts[ts]), "veh_generated": int(z["generated"]),
                     "veh_completed": int(z["completed"]), "avg_wait_s": z["wait"].mean(), "max_wait_s": z["wait"].max(),
                     "avg_time_loss_s": z["loss"].mean(), "avg_queue": float(z["avg_q"]), "max_queue": int(z["max_q"])})
    df = pd.DataFrame(rows); df.to_csv(os.path.join(out, "baseline_real_eval.csv"), index=False)
    Wc, Lc = np.concatenate(W), np.concatenate(L)
    top = df.nlargest(6, "veh_generated")
    print(f"ALL {len(hours)} hours done (peak target {__import__('real_demand').SCALE_TARGET_PEAK} veh/h)")
    print(f"Vehicles completed        : {int(df.veh_completed.sum())} of {int(df.veh_generated.sum())} ({df.veh_completed.sum()/df.veh_generated.sum()*100:.1f}%)")
    print(f"Avg waiting time / veh    : {Wc.mean():.1f} s   (95th pct {np.percentile(Wc,95):.0f} s, max {Wc.max():.0f} s)")
    print(f"Avg time loss / veh       : {Lc.mean():.1f} s")
    print(f"Avg queue (mean of hours) : {df.avg_queue.mean():.1f}   worst max queue: {df.max_queue.max()}")
    print(f"Busiest 6 hours           : avg wait {top.avg_wait_s.mean():.1f} s at ~{top.veh_generated.mean():.0f} veh/h")
