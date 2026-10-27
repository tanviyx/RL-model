#!/usr/bin/env python3
"""
Build server/config/demand.json from the Pune junction-camera CSVs.

Dataset: "Heterogeneous Traffic Count Dataset, Pune (Jan 2023)", Mendeley Data,
DOI 10.17632/xnf2k6n288.1.

What the files look like (verified on the real data):
  data/traffic/<Junction>/<camera>/<camera>_<day>.csv and <camera>_<day>_one.csv
  columns: Time, Direction, car, motorbike, bus, truck
  one row per video frame per direction (about 25 frames/s x 4 directions); the class
  columns are RUNNING TOTALS that only go up. "_one" is the second part of the same
  day's recording (its counters start again at 0).

So: vehicles in a time slot = sum of the increases of the running TOTAL (all classes added).
The tracker sometimes moves a vehicle from one class to another (one class counter goes down,
another goes up, the total stays the same). That must never create a vehicle, so only a drop of
the total counts as a counter reset.

    python tools/prepare_pune_demand.py data/traffic --junction alankar --out server/config/demand.json

Check the dataset README for what UP / DOWN / LEFT / RIGHT mean for each camera, then set
--axis-map if the default (UP,DOWN = north-south; LEFT,RIGHT = east-west) is wrong.
Standard library only; streams the files, so memory use stays small.
"""
import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime

CLASSES = ["car", "motorbike", "bus", "truck"]
DEFAULT_AXIS = {"UP": "NS", "DOWN": "NS", "LEFT": "EW", "RIGHT": "EW"}
FILE_RE = re.compile(r"^([A-Za-z]+)(\d+)_(\d+)(?:_([A-Za-z0-9]+))?\.csv$")
MIN_COVER = 0.9  # a time slot counts only if >= 90% of its seconds were recorded


def collect_files(root):
    """CSVs under root. Junction = first sub-folder name (AlankarChowk), or the file-name letter if flat."""
    found, unmatched = [], []
    for dirpath, _, names in os.walk(root):
        for n in sorted(names):
            if not n.lower().endswith(".csv"):
                continue
            full = os.path.join(dirpath, n)
            rel_parent = os.path.relpath(dirpath, root)
            folder = None if rel_parent == "." else rel_parent.split(os.sep)[0]
            m = FILE_RE.match(n)
            if not m:
                unmatched.append(os.path.relpath(full, root))
                continue
            letters, num, dom = m.group(1).lower(), m.group(2), int(m.group(3))
            found.append({
                "path": full,
                "junction": (folder or letters).lower(),
                "prefix": letters,
                "camera": f"{letters}{num}",
                "dom": dom,
                "part": m.group(4) or "",
            })
    return found, unmatched


def matches_junction(f, wanted):
    """--junction accepts the folder name, part of it (alankar) or the file-name letter (a)."""
    if not wanted:
        return True
    return any(t == f["junction"] or t == f["prefix"] or t in f["junction"] for t in wanted)


def parse_time(s):
    try:
        return int(s[0:2]) * 3600 + int(s[3:5]) * 60 + int(s[6:8])
    except ValueError:
        return None


def process_file(path, axis_of, weights, bin_seconds, counts, secs, stats):
    """
    Stream one file. Adds the increases of the running total (weighted by vehicle class) to
    counts[axis][bin] and counts every distinct recorded second in secs[bin].
    stats collects how often reclassifications and counter resets were seen.
    """
    prev = {}       # direction -> previous cumulative values
    last_vals = {}  # direction -> previous raw strings (fast skip: ~99.9% of rows are unchanged)
    last_t = None
    last_bin = None
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.reader(f)
        header = [h.strip() for h in next(reader, [])]
        try:
            ti, di = header.index("Time"), header.index("Direction")
            ci = [header.index(c) for c in CLASSES]
        except ValueError:
            sys.exit(f"{path}: expected columns Time, Direction, {CLASSES}; found {header}")
        need = max([ti, di] + ci)
        for row in reader:
            if len(row) <= need:
                continue
            d = row[di]
            if not d:
                continue
            t = row[ti]
            if t != last_t:
                sec = parse_time(t)
                if sec is None:
                    continue
                last_t = t
                last_bin = sec // bin_seconds
                secs[last_bin] += 1
            vals = [row[i] for i in ci]
            if "" in vals:
                continue
            if vals == last_vals.get(d):
                continue
            last_vals[d] = vals
            try:
                cur = [int(float(v)) for v in vals]
            except ValueError:
                continue
            p = prev.get(d)
            tot = sum(cur)
            wtot = sum(c * wt for c, wt in zip(cur, weights))
            prev[d] = (cur, tot, wtot)
            if p is None:
                continue
            p_cur, p_tot, p_wtot = p
            if tot < p_tot:
                inc = wtot  # the whole counter was reset
                stats["resets"] += 1
            else:
                if any(c < pc for c, pc in zip(cur, p_cur)):
                    stats["reclassified"] += 1  # a vehicle moved between classes: total unchanged
                inc = max(0.0, wtot - p_wtot)
            axis = axis_of(d.upper())
            if axis is None:
                continue
            if inc:
                counts[axis][last_bin] += inc


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--junction", help="junction folder name or part of it (alankar), or the file-name letter (a)")
    ap.add_argument("--cameras", help="only these cameras, e.g. a2 or a2,a3 (default: all cameras of the junction)")
    ap.add_argument("--year", type=int, default=2023)
    ap.add_argument("--month", type=int, default=1)
    ap.add_argument("--bin-seconds", type=int, default=300)
    ap.add_argument("--axis-map", help='JSON file, e.g. {"default":{"UP":"NS","DOWN":"NS","LEFT":"EW","RIGHT":"EW"},"a3":{"UP":"EW"}}')
    ap.add_argument("--weights", default="", help="vehicle weights, e.g. car=1,motorbike=0.5,bus=3,truck=3 (default: every vehicle counts 1)")
    ap.add_argument("--allow-partial", action="store_true", help="accept slots where only some cameras were recording (biases counts low)")
    ap.add_argument("--min-bins", type=int, default=12, help="drop days with fewer valid slots than this")
    ap.add_argument("--min-day-ratio", type=float, default=0.5,
                    help="drop days whose traffic per recorded hour is below this fraction of the median day (0 = keep all)")
    ap.add_argument("--exclude-days", default="", help="comma-separated days to drop, e.g. 2023-01-13,2023-01-18")
    ap.add_argument("--out", default="server/config/demand.json")
    args = ap.parse_args()

    w = dict.fromkeys(CLASSES, 1.0)
    for part in filter(None, args.weights.split(",")):
        k, v = part.split("=")
        if k.strip() not in w:
            sys.exit(f"Unknown vehicle class {k!r}; use {CLASSES}")
        w[k.strip()] = float(v)
    weights = [w[c] for c in CLASSES]

    axis_map = {"default": dict(DEFAULT_AXIS)}
    if args.axis_map:
        with open(args.axis_map) as f:
            user = json.load(f)
        axis_map["default"].update(user.get("default", {}))
        axis_map.update({k: v for k, v in user.items() if k != "default"})

    found, unmatched = collect_files(args.folder)
    if unmatched:
        print(f"Note: skipping {len(unmatched)} CSV files whose names don't look like a2_11.csv / a2_11_one.csv, e.g. {unmatched[:3]}")
    if not found:
        sys.exit("No usable CSV files found.")
    all_juncs = sorted({f["junction"] for f in found})
    wanted_tokens = [t.strip().lower() for t in args.junction.split(",")] if args.junction else []
    if not wanted_tokens and len(all_juncs) > 1:
        sys.exit(f"Several junctions found {all_juncs}. Pick one with --junction (mixing junctions makes no sense for one intersection).")
    selected = [f for f in found if matches_junction(f, wanted_tokens)]
    if args.cameras:
        cams_wanted = {c.strip().lower() for c in args.cameras.split(",")}
        selected = [f for f in selected if f["camera"] in cams_wanted]
    if not selected:
        sys.exit(f"Nothing matched. Junctions found: {all_juncs}")
    junctions = sorted({f["junction"] for f in selected})
    if len(junctions) > 1:
        sys.exit(f"--junction matched several junctions {junctions}; be more specific.")
    junction = junctions[0]
    all_cams = sorted({f["camera"] for f in selected})
    bin_s = args.bin_seconds
    nbins = 86400 // bin_s

    # ---- stream every file ----
    rec = {}  # day -> camera -> (counts{axis: {bin: n}}, secs{bin: n})
    stats = {"reclassified": 0, "resets": 0}
    selected.sort(key=lambda f: (f["dom"], f["camera"], f["part"]))
    for i, f in enumerate(selected, 1):
        date = datetime(args.year, args.month, f["dom"]).strftime("%Y-%m-%d")
        counts, secs = rec.setdefault(date, {}).setdefault(
            f["camera"], ({"NS": defaultdict(float), "EW": defaultdict(float)}, defaultdict(int)))
        cam_map = axis_map.get(f["camera"], {})
        axis_of = lambda d, cm=cam_map: cm.get(d, axis_map["default"].get(d))
        print(f"[{i}/{len(selected)}] {os.path.relpath(f['path'], args.folder)}", file=sys.stderr, flush=True)
        process_file(f["path"], axis_of, weights, bin_s, counts, secs, stats)

    # ---- per camera: valid slots and gap-corrected counts; then combine cameras ----
    days = {}
    dropped = []
    per_day_totals = {}
    for date in sorted(rec):
        valid = {}
        value = {}
        for cam, (counts, secs) in rec[date].items():
            valid[cam] = {b for b, s in secs.items() if s >= MIN_COVER * bin_s}
            value[cam] = {
                ax: {b: counts[ax].get(b, 0.0) * bin_s / secs[b] for b in valid[cam]}
                for ax in ("NS", "EW")
            }
        ns = [None] * nbins
        ew = [None] * nbins
        for b in range(nbins):
            reporting = [c for c in rec[date] if b in valid[c]]
            if not reporting:
                continue
            if not args.allow_partial and len(reporting) < len(all_cams):
                continue
            ns[b] = sum(value[c]["NS"][b] for c in reporting)
            ew[b] = sum(value[c]["EW"][b] for c in reporting)
        n_valid = sum(1 for x in ns if x is not None)
        if n_valid < args.min_bins:
            dropped.append((date, n_valid, sorted(rec[date])))
            continue
        days[date] = {"NS": ns, "EW": ew}
        per_day_totals[date] = (sum(x for x in ns if x is not None), sum(x for x in ew if x is not None))

    # ---- drop days that are clearly not comparable with the others ----
    excluded = {d.strip() for d in args.exclude_days.split(",") if d.strip()}
    outliers = []
    if days:
        per_slot = {d: (per_day_totals[d][0] + per_day_totals[d][1]) / sum(1 for x in days[d]["NS"] if x is not None)
                    for d in days}
        ordered = sorted(per_slot.values())
        mid = len(ordered) // 2
        median = ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2
        for d in sorted(days):
            if d in excluded:
                reason = "excluded with --exclude-days"
            elif args.min_day_ratio > 0 and per_slot[d] < args.min_day_ratio * median:
                reason = f"only {per_slot[d] / median:.0%} of the median day's traffic"
            else:
                continue
            outliers.append((d, reason))
            del days[d]
            del per_day_totals[d]

    if not days:
        sys.exit(f"No usable days. Cameras expected: {all_cams}. Dropped: {dropped}. "
                 "If a camera is missing on most days try --cameras with one camera, or --allow-partial.")

    # ---- average day over the slots that were really recorded (no filling of unrecorded hours) ----
    profile = {}
    for ax in ("NS", "EW"):
        prof = []
        for b in range(nbins):
            vals = [d[ax][b] for d in days.values() if d[ax][b] is not None]
            prof.append(round(sum(vals) / len(vals), 3) if vals else None)
        profile[ax] = prof
    known = [b for b in range(nbins) if profile["NS"][b] is not None]
    start_sec, end_sec = known[0] * bin_s, (known[-1] + 1) * bin_s

    def rnd(v):
        return None if v is None else round(v, 3)

    out = {
        "meta": {
            "source": "Heterogeneous Traffic Count Dataset, Pune (Jan 2023), Mendeley Data, DOI 10.17632/xnf2k6n288.1",
            "junction": junction,
            "cameras": all_cams,
            "binSeconds": bin_s,
            "unit": "weighted vehicles per bin (gap-corrected)",
            "weights": w,
            "axisMap": axis_map,
            "requireAllCameras": not args.allow_partial,
            "recordedRange": {"startSec": start_sec, "endSec": end_sec},
            "note": "Only recorded slots are filled; unrecorded hours are null and are never invented.",
        },
        "days": {d: {"NS": [rnd(v) for v in v_["NS"]], "EW": [rnd(v) for v in v_["EW"]]} for d, v_ in days.items()},
        "profile": profile,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))

    hhmm = lambda s: f"{s // 3600:02d}:{s % 3600 // 60:02d}"
    print(f"\nWrote {args.out}")
    print(f"Junction '{junction}', cameras {all_cams}, recorded window {hhmm(start_sec)}-{hhmm(end_sec)}")
    print(f"Counter events seen: {stats['reclassified']} class reclassifications (ignored), {stats['resets']} counter resets")
    if dropped:
        print("Dropped days (too little data / missing camera):", dropped)
    for d, reason in outliers:
        hint = " Use --min-day-ratio 0 to keep it." if reason.startswith("only") else ""
        print(f"Dropped day {d}: {reason}.{hint}")
    print("Day         valid hours   NS vehicles   EW vehicles")
    for d, v_ in days.items():
        n_valid = sum(1 for x in v_["NS"] if x is not None)
        print(f"{d}   {n_valid * bin_s / 3600:>8.1f}   {per_day_totals[d][0]:>11.0f}   {per_day_totals[d][1]:>11.0f}")
    peaks = {}
    for ax in ("NS", "EW"):
        rates = [v / bin_s for v in profile[ax] if v is not None]
        peaks[ax] = max(rates)
        print(f"{ax}: mean {sum(rates) / len(rates):.3f} veh/s, peak {peaks[ax]:.3f} veh/s (average day)")
    peak = max(peaks.values())
    print("\nThe simulated signal can serve about 1 veh/s per axis on average (2 veh/s while green, half the time).")
    if peak > 0:
        if peak < 0.5:
            print("Real flow is far below that, so with no scaling the queues stay near zero and every policy looks the same.")
        print(f"A starting point is --scale {0.7 / peak:.1f} (peak load ~70% of capacity). That is an ASSUMPTION about")
        print("how busy the junction is: the data supplies the shape (when and which direction), you choose the level.")
        print("Re-run tools/evaluate.mjs at several scales and report all of them.")


if __name__ == "__main__":
    main()