"""
Real-life demand for the SUMO intersection.

Data: fedesoriano. (2021). Traffic Prediction Dataset [Data set]. Kaggle.
      https://www.kaggle.com/datasets/fedesoriano/traffic-prediction-dataset
      (hourly vehicle counts at four junctions; we use Junction 1, the busiest and most complete)

What is REAL: the hourly pattern (rush hours, nights, weekday/weekend) of Junction 1.
What is OUR ASSUMPTION (state these in the report):
  1. SCALE_TARGET_PEAK: the dataset's counts are small (Junction 1 averages ~45 veh/h), far
     below the load of a 2-lane-per-approach, 4-way intersection. We scale all counts by one
     constant so that the 95th percentile hour of the TRAINING period equals
     SCALE_TARGET_PEAK vehicles/hour for the whole intersection. Relative patterns are untouched.
  2. APPROACH_SPLIT: the dataset has one number per junction, so we divide it across N/S/E/W.
  3. Turning split (70% straight / 15% right / 15% left) lives in generate_routes.py.
Train/test split: the raw counts grow ~3.5x over the 20 months (Nov 2015 mean ~20 veh/h, Jun 2017 mean ~73),
so a chronological split would test on much heavier traffic than the DQN trained on. Instead every 4th
full week is held out as TEST (about 25% of the data) and the rest is TRAIN, so both cover the same
range of volumes. The test weeks are never used for training or for choosing the scale factor.
"""
import os
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, "traffic.csv")
JUNCTION = 1
TEST_WEEK_EVERY = 4                        # weeks 3, 7, 11, ... (counted from the first day) are test weeks
SCALE_TARGET_PEAK = 3000                   # veh/h for the whole intersection at the 95th-percentile hour
APPROACH_SPLIT = {"N": 0.34, "S": 0.29, "E": 0.20, "W": 0.17}   # sums to 1.0


class RealDemand:
    def __init__(self, csv=CSV, junction=JUNCTION):
        df = pd.read_csv(csv, parse_dates=["DateTime"])
        s = df[df.Junction == junction].set_index("DateTime")["Vehicles"].sort_index()
        self.counts = s
        week = ((s.index - s.index.min()).days // 7)
        is_test = (week % TEST_WEEK_EVERY) == (TEST_WEEK_EVERY - 1)
        self.train, self.test = s[~is_test], s[is_test]
        self.scale = SCALE_TARGET_PEAK / float(np.percentile(self.train.values, 95))

    def rates_for_hour(self, ts):
        """Scaled veh/h for each approach during the real hour starting at `ts`."""
        total = float(self.counts[pd.Timestamp(ts)]) * self.scale
        return {a: total * APPROACH_SPLIT[a] for a in "NSEW"}

    def demand_fn(self, ts):
        """A demand function in the format generate_routes.generate() expects."""
        rates = self.rates_for_hour(ts)
        return lambda t, duration: rates

    def sample_train_hour(self, rng):
        return self.train.index[rng.integers(len(self.train))]

    def eval_hours(self, seed=0):
        """Fixed evaluation set: all 24 hours of one random test weekday and one random test weekend day."""
        rng = np.random.default_rng(seed)
        days = pd.Series(self.test.index.normalize().unique())
        weekday = days[days.dt.dayofweek < 5].iloc[rng.integers((days.dt.dayofweek < 5).sum())]
        weekend = days[days.dt.dayofweek >= 5].iloc[rng.integers((days.dt.dayofweek >= 5).sum())]
        return [d + pd.Timedelta(hours=h) for d in (weekday, weekend) for h in range(24)]


if __name__ == "__main__":
    d = RealDemand()
    print(f"Junction {JUNCTION}: train {len(d.train)} h, test {len(d.test)} h (every {TEST_WEEK_EVERY}th week held out)")
    print(f"raw mean train {d.train.mean():.1f} vs test {d.test.mean():.1f} veh/h")
    print(f"scale factor = {d.scale:.2f}  (raw p95 = {np.percentile(d.train.values, 95):.0f} veh/h -> {SCALE_TARGET_PEAK} veh/h)")
    print(f"scaled demand: mean {d.counts.mean()*d.scale:.0f}, max {d.counts.max()*d.scale:.0f} veh/h")
    print("eval hours:", d.eval_hours()[0], "and", d.eval_hours()[24])
