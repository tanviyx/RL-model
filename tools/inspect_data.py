#!/usr/bin/env python3
"""
Look at the Pune dataset WITHOUT loading whole files into memory.

    python tools/inspect_data.py data/traffic

Prints, per folder: how many files, how big, and the file-name shapes; then for a few
sample files: size, estimated row count, header, first rows and last row (time span).
"""
import csv
import os
import re
import sys
from collections import defaultdict
from itertools import islice


def mb(n):
    return f"{n / 1_048_576:.1f} MB"


def shape(name):
    return re.sub(r"\d+", "#", name)


def head_rows(path, n=3):
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        first = f.readline()
        f.seek(0)
        delim = max(",;\t|", key=first.count)
        reader = csv.reader(f, delimiter=delim)
        header = next(reader, [])
        rows = list(islice(reader, n))
        # average bytes per row from the first 200 rows -> estimate total rows
        f.seek(0)
        f.readline()
        start = f.tell()
        sample = list(islice(f, 200))
        sample_bytes = sum(len(x.encode("utf-8", errors="replace")) for x in sample)
    return delim, header, rows, (sample_bytes / len(sample) if sample else 0), start


def last_line(path):
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        f.seek(max(0, size - 4096))
        tail = f.read().decode("utf-8", errors="replace").splitlines()
    tail = [t for t in tail if t.strip()]
    return tail[-1] if tail else ""


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    root = sys.argv[1]
    dirs = defaultdict(lambda: {"n": 0, "bytes": 0, "shapes": defaultdict(int)})
    samples = {}  # (dir, shape) -> path
    total = 0
    non_csv = defaultdict(int)
    for dirpath, _, names in os.walk(root):
        rel = os.path.relpath(dirpath, root)
        for n in sorted(names):
            full = os.path.join(dirpath, n)
            if not n.lower().endswith(".csv"):
                non_csv[os.path.splitext(n)[1].lower() or "(no extension)"] += 1
                continue
            total += 1
            d = dirs[rel]
            d["n"] += 1
            d["bytes"] += os.path.getsize(full)
            d["shapes"][shape(n)] += 1
            samples.setdefault((rel, shape(n)), full)

    print(f"{total} CSV files under {root}")
    if non_csv:
        print("other files:", dict(non_csv))
    print()
    for rel, d in sorted(dirs.items()):
        print(f"{rel}: {d['n']} files, {mb(d['bytes'])}  shapes: {dict(d['shapes'])}")

    # a handful of samples: one per distinct file-name shape (prefer different shapes first)
    seen, picks = set(), []
    for (rel, shp), path in sorted(samples.items()):
        if shp not in seen:
            seen.add(shp)
            picks.append(path)
    for (rel, shp), path in sorted(samples.items()):
        if len(picks) >= 6:
            break
        if path not in picks:
            picks.append(path)

    for path in picks[:6]:
        size = os.path.getsize(path)
        print("\n" + "=" * 70)
        print(os.path.relpath(path, root), "-", mb(size))
        try:
            delim, header, rows, avg, start = head_rows(path)
        except Exception as e:  # keep going whatever a file looks like
            print("  could not read:", e)
            continue
        est = int((size - start) / avg) if avg else 0
        print(f"delimiter {delim!r}, about {est:,} rows (estimate)")
        print("columns:", header)
        for r in rows:
            print("  ", r)
        print("last line:", last_line(path))


if __name__ == "__main__":
    main()