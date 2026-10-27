#!/usr/bin/env python3
"""
Per camera and day: how many vehicles each camera counted in each direction.

    python tools/camera_breakdown.py data/traffic alankar

The class columns are running totals, so for one file the vehicles counted in a direction are
(last total - first total); a drop of the total counts as a counter reset. Streams the files.
Use it together with the dataset README to decide which directions are approaching traffic and
which road (north-south or east-west) each camera belongs to.
"""
import csv
import os
import re
import sys
from collections import defaultdict

CLASSES = ["car", "motorbike", "bus", "truck"]
FILE_RE = re.compile(r"^([A-Za-z]+)(\d+)_(\d+)(?:_([A-Za-z0-9]+))?\.csv$")
DIRS = ["UP", "DOWN", "LEFT", "RIGHT"]


def scan(path):
    """-> ({direction: vehicles}, {class: vehicles})"""
    first, last, carry = {}, {}, defaultdict(int)
    last_raw = {}
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.reader(f)
        header = [h.strip() for h in next(reader, [])]
        try:
            di = header.index("Direction")
            ci = [header.index(c) for c in CLASSES]
        except ValueError:
            sys.exit(f"{path}: unexpected columns {header}")
        need = max([di] + ci)
        for row in reader:
            if len(row) <= need:
                continue
            d = row[di].upper()
            if not d:
                continue
            raw = [row[i] for i in ci]
            if "" in raw or raw == last_raw.get(d):
                continue
            last_raw[d] = raw
            try:
                cur = [int(float(v)) for v in raw]
            except ValueError:
                continue
            if d not in first:
                first[d] = cur
            elif sum(cur) < sum(last[d]):  # counter reset
                carry[d] += sum(last[d]) - sum(first[d])
                first[d] = [0] * 4
            last[d] = cur
    per_dir, per_class = {}, [0] * 4
    for d in last:
        per_dir[d] = carry[d] + sum(last[d]) - sum(first[d])
        for k in range(4):
            per_class[k] += last[d][k] - first[d][k]
    return per_dir, dict(zip(CLASSES, per_class))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    root = sys.argv[1]
    token = sys.argv[2].lower() if len(sys.argv) > 2 else ""
    files = []
    for dirpath, _, names in os.walk(root):
        for n in sorted(names):
            m = FILE_RE.match(n)
            if not m:
                continue
            rel = os.path.relpath(dirpath, root)
            folder = "" if rel == "." else rel.split(os.sep)[0]
            junction = (folder or m.group(1)).lower()
            if token and token not in junction and token != m.group(1).lower():
                continue
            files.append((junction, f"{m.group(1).lower()}{m.group(2)}", int(m.group(3)), os.path.join(dirpath, n)))
    if not files:
        sys.exit("No matching files.")
    files.sort()
    table = defaultdict(lambda: defaultdict(int))   # (junction, camera, day) -> direction -> n
    classes = defaultdict(lambda: defaultdict(int))  # (junction, camera) -> class -> n
    for i, (j, cam, day, path) in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {os.path.relpath(path, root)}", file=sys.stderr, flush=True)
        per_dir, per_class = scan(path)
        for d, v in per_dir.items():
            table[(j, cam, day)][d] += v
        for c, v in per_class.items():
            classes[(j, cam)][c] += v

    print("\nVehicles counted per direction (both recording parts of the day added)")
    print(f"{'junction':<16}{'camera':<7}{'day':<5}" + "".join(f"{d:>8}" for d in DIRS) + f"{'total':>9}")
    for (j, cam, day) in sorted(table):
        row = table[(j, cam, day)]
        print(f"{j:<16}{cam:<7}{day:<5}" + "".join(f"{row.get(d, 0):>8}" for d in DIRS) + f"{sum(row.values()):>9}")
    print("\nVehicle class mix per camera (all days)")
    for (j, cam), c in sorted(classes.items()):
        tot = sum(c.values()) or 1
        print(f"{cam:<5}" + "  ".join(f"{k} {100 * c[k] / tot:.0f}%" for k in CLASSES) + f"   (total {tot})")


if __name__ == "__main__":
    main()