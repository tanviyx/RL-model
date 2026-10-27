#!/usr/bin/env python3
"""
Work out what the numbers in one Pune CSV mean. Streams the file (low memory).

    python tools/analyze_file.py data/traffic/AlankarChowk/a2/a2_11.csv
"""
import csv
import sys
from collections import defaultdict

CLASSES = ["car", "motorbike", "bus", "truck"]
BIN = 300


def to_sec(t):
    try:
        h, m, s = t.strip().split(":")
        return int(h) * 3600 + int(m) * 60 + int(float(s))
    except ValueError:
        return None


def hms(sec):
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    rows = 0
    blank = 0
    first = last = None
    per_second = defaultdict(int)          # second -> rows
    dirs = defaultdict(lambda: {
        "rows": 0, "sum": 0, "nonzero": 0, "max": 0,
        "inc": 0, "dec": 0, "same": 0, "prev": None,
        "run": 0, "runs": 0, "runlen": 0, "first": None, "last": None,
    })
    # bins[(bin, dir)] -> [rows, sum_total, sum_pos_increments, sum_total_for_mean]
    bins = defaultdict(lambda: [0, 0, 0, 0])
    prev_sec = None
    gaps = []

    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        cols = [c.strip() for c in (reader.fieldnames or [])]
        if "Direction" not in cols or "Time" not in cols:
            sys.exit(f"Unexpected columns: {cols}")
        for r in reader:
            sec = to_sec(r.get("Time", ""))
            d = (r.get("Direction") or "").strip().upper()
            if sec is None or not d:
                blank += 1
                continue
            try:
                vals = [int(float(r[c])) for c in CLASSES if c in r]
            except (ValueError, KeyError):
                blank += 1
                continue
            total = sum(vals)
            rows += 1
            first = sec if first is None else first
            last = sec
            per_second[sec] += 1
            if prev_sec is not None and sec - prev_sec > 5:
                gaps.append((hms(prev_sec), hms(sec), sec - prev_sec))
            prev_sec = sec

            st = dirs[d]
            st["rows"] += 1
            st["sum"] += total
            st["max"] = max(st["max"], total)
            if total:
                st["nonzero"] += 1
                st["run"] += 1
            else:
                if st["run"]:
                    st["runs"] += 1
                    st["runlen"] += st["run"]
                st["run"] = 0
            p = st["prev"]
            inc = 0
            if p is not None:
                if total > p:
                    st["inc"] += 1
                    inc = total - p
                elif total < p:
                    st["dec"] += 1
                else:
                    st["same"] += 1
            st["prev"] = total
            if st["first"] is None:
                st["first"] = total
            st["last"] = total

            b = bins[(sec // BIN, d)]
            b[0] += 1
            b[1] += total
            b[2] += inc
            b[3] += total

    print(f"file: {path}")
    print(f"usable rows: {rows:,}   blank/invalid rows skipped: {blank:,}")
    if not rows:
        return
    print(f"time span: {hms(first)} -> {hms(last)}  ({(last - first) / 60:.1f} min)")
    secs = len(per_second)
    print(f"distinct seconds: {secs:,}   rows per second: avg {rows / secs:.1f}, max {max(per_second.values())}")
    print(f"directions: {sorted(dirs)}   (rows each: {[dirs[d]['rows'] for d in sorted(dirs)]})")
    print(f"gaps > 5 s in the recording: {len(gaps)}  {gaps[:5]}")
    print("\nPer direction (all vehicle classes added together):")
    print("dir    | rows      | nonzero% | max | sum        | up/down/same moves vs previous row | avg length of non-zero stretches | first->last value")
    for d in sorted(dirs):
        s = dirs[d]
        if s["run"]:
            s["runs"] += 1
            s["runlen"] += s["run"]
        avg_run = s["runlen"] / s["runs"] if s["runs"] else 0
        moves = f"{s['inc']}/{s['dec']}/{s['same']}"
        print(f"{d:<6} | {s['rows']:<9} | {100 * s['nonzero'] / s['rows']:<8.2f} | {s['max']:<3} | {s['sum']:<10} | {moves:<34} | {avg_run:<32.1f} | {s['first']}->{s['last']}")

    print("\nFirst 6 five-minute bins, three possible readings of the numbers")
    print("  A = sum of all rows (right if each row is a crossing event)")
    print("  B = sum of increases (right if the numbers are running totals)")
    print("  C = average value per row (right if the numbers are vehicles currently present)")
    keys = sorted({k[0] for k in bins})[:6]
    for k in keys:
        line = [f"{hms(k * BIN)[:5]}"]
        for d in sorted(dirs):
            n, a, bsum, c = bins[(k, d)]
            line.append(f"{d}: A={a} B={bsum} C={c / n:.2f}" if n else f"{d}: -")
        print("  " + " | ".join(line))


if __name__ == "__main__":
    main()