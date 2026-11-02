"""
Generate SUMO vehicle demand (routes) for the intersection.

Demand is given as vehicles/hour per approach for each time bin. Right now it comes from
a synthetic profile; later we replace `synthetic_demand()` with demand built from a
real-life dataset (hourly counts), and nothing else in the project changes.
"""
import random
import sys

APPROACHES = ["N", "S", "E", "W"]
# turning split: straight / right / left   (SUMO drives on the right)
OPPOSITE = {"N": "S", "S": "N", "E": "W", "W": "E"}
RIGHT = {"N": "W", "S": "E", "E": "N", "W": "S"}
LEFT = {"N": "E", "S": "W", "E": "S", "W": "N"}
TURN_PROBS = {"straight": 0.70, "right": 0.15, "left": 0.15}


def synthetic_demand(t, duration):
    """vehicles/hour per approach at time t (s). N/S road busier, with a mid-run peak."""
    base = {"N": 600, "S": 500, "E": 350, "W": 300}
    peak = 1.0 + 0.6 * max(0.0, 1 - abs(t - duration / 2) / (duration / 4))  # up to +60%
    return {a: base[a] * peak for a in APPROACHES}


def generate(path, duration=3600, bin_s=60, demand_fn=synthetic_demand, seed=0):
    rng = random.Random(seed)
    vehicles = []
    for start in range(0, duration, bin_s):
        rates = demand_fn(start, duration)
        for a in APPROACHES:
            n = poisson(rng, rates[a] * bin_s / 3600.0)
            for _ in range(n):
                r = rng.random()
                if r < TURN_PROBS["straight"]:
                    dest = OPPOSITE[a]
                elif r < TURN_PROBS["straight"] + TURN_PROBS["right"]:
                    dest = RIGHT[a]
                else:
                    dest = LEFT[a]
                vehicles.append((start + rng.random() * bin_s, a, dest))
    vehicles.sort()
    with open(path, "w") as f:
        f.write('<routes>\n')
        f.write('  <vType id="car" accel="2.6" decel="4.5" length="5" minGap="2.5" maxSpeed="13.89"/>\n')
        for i, (t, a, d) in enumerate(vehicles):
            f.write(f'  <vehicle id="veh{i}" type="car" depart="{t:.2f}" departLane="best">'
                    f'<route edges="{a}_in {d}_out"/></vehicle>\n')
        f.write('</routes>\n')
    return len(vehicles)


def poisson(rng, lam):
    import math
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "routes.rou.xml"
    print(f"generated {generate(out)} vehicles -> {out}")
