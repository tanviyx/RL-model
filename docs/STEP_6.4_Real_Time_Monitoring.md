# Step 6.4 – Real-Time Traffic Monitoring

Status: built and tested in the build environment (model checks in Node.js, page checks in headless Chromium). Section 10 lists what you still need to check on your own machine.

## 1. Goal (from the project plan)

- Display the current number of vehicles in each lane.
- Visualize traffic density and queue lengths.
- Display waiting times and vehicle throughput.
- Show the current signal status and the remaining green-light duration.

## 2. What was built, in one paragraph

A "Real-time traffic monitoring" section on the simulation page (`/simulation`, also reachable from the new **Monitoring** link in the header, which jumps to `/simulation#monitoring`). It refreshes about five times a second while the simulation runs and shows: a signal status card per approach with a countdown, throughput and waiting-time summary cards, a table with one row per lane (vehicles, density, density level, queue count, queue length, average and longest wait), and two trend charts. The road drawing itself also gains a density and queue overlay.

## 3. Important: what the numbers describe

The monitoring reads the **browser simulation from Step 6.3**, not SUMO and not the DQN. It is a live view of that model. The numbers must not be compared with the SUMO baseline (30.1 s average wait) or future DQN results. Showing real SUMO or DQN data is a later step.

## 4. Files in this step

| File | Status | What changed |
|---|---|---|
| `frontend/public/js/simulation.js` | replaced | Model: new `monitor()` function, history, throughput logs. Interface: monitoring panels, overlay, charts |
| `frontend/private/simulation.html` | replaced | New "Real-time traffic monitoring" section, "Monitoring" header link, overlay checkbox and legend |
| `frontend/public/css/simulation.css` | replaced | Styles for the new section |
| `docs/STEP_6.4_Real_Time_Monitoring.md` | new | This document |
| `docs/PROJECT_LOG.md` | updated | Step 6.4 entry |

`backend/server.js` and `frontend/private/dashboard.html` are **unchanged** from Step 6.3. No new npm packages. The Step 6.3 behaviour (traffic, signals, Start / Pause / Reset) is unchanged; the model test results from 6.3 give identical numbers after this step.

## 5. Each requirement: what you see and how it is calculated

### 5.1 Vehicles in each lane
- **Lanes:** 8 incoming lanes. Each approach (North, South, East, West) has a **kerb lane** (straight and right turns) and an **inner lane** (straight and left turns).
- **Vehicles:** the number of vehicles currently in that lane between the map edge and the intersection box (a 55 m stretch). Vehicles already inside the box are not counted in any lane, so the lane counts can be lower than "Vehicles on road".
- Shown in the **Lanes** table (column "Vehicles") with a total row.

### 5.2 Traffic density
- **Density** = vehicles in the lane divided by the lane length in kilometres (55 m = 0.055 km), so it is in **vehicles per km**. One vehicle equals about 18 veh/km, so values step in jumps of about 18.
- **Level**, shown as a word and not only a colour:

| Level | Density | About |
|---|---|---|
| Low | under 30 veh/km | 0 or 1 vehicle in the lane |
| Moderate | 30 to under 80 veh/km | 2 to 4 vehicles |
| High | 80 veh/km or more | 5 or more vehicles |

- A small bar beside the number in the table is coloured green, amber or red by level.
- **On the road drawing:** each approach lane is shaded green, amber or red by its level (darker with higher density). The overlay can be turned off with the "Show density and queue overlay" checkbox. A legend sits under the canvas.
- The "All lanes" row shows the **average** density across the 8 lanes.

### 5.3 Queue lengths
- **Queued vehicle:** a vehicle moving slower than 0.5 m/s that is before the stop line (or within 2 m past it).
- **Queued** column: number of queued vehicles in the lane.
- **Queue length** column (metres): distance from the stop line back to the rear bumper of the furthest queued vehicle. A queue of 0 vehicles is 0 m.
- **On the road drawing:** a white bar across the lane marks the end of its queue. The pill labels on the arms (for example "N 3") show queued vehicles per approach.
- The total row shows total queued vehicles and the longest queue in any lane.
- Because the map is only 55 m per lane, the longest possible queue is about 55 m.

### 5.4 Waiting times
- **Waiting time** of a vehicle: seconds spent with speed below 0.1 m/s since it entered (the same idea as SUMO's accumulated waiting time).
- **Avg wait** (table): average of that value over the vehicles currently in the lane. **Longest wait**: the largest value in the lane.
- **Average wait now** card: the same, across all lanes. This is about vehicles currently on the approaches. The existing "Avg wait (completed)" in the Live statistics card (Step 6.3) is about vehicles that have finished their trip; both are kept because they answer different questions.

### 5.5 Throughput
- **Throughput** card: vehicles that completed their trip (left the map) in the last 5 simulated minutes, converted to vehicles per hour. At the start the window is shorter than 5 minutes, so it says "collecting data..." for the first 10 seconds and then uses the time elapsed so far; the card shows the window length in minutes.
- **Completed trips** card: total vehicles that left the map, "of N entered" (vehicles that entered the map) and the percentage. This matches the "vehicles completed" idea in your SUMO baseline (84,477 of 87,817).
- **Passed stop line** (inside each signal card): vehicles per hour that crossed that approach's stop line in the last 5 simulated minutes. This is throughput per approach.
- Throughput trend chart: see 5.7.

### 5.6 Signal status and remaining green
Each approach has a card with a coloured pill (word plus colour), a large number, a bar and the stop-line throughput.

| Signal is | Large number means | Bar |
|---|---|---|
| Green | seconds of green left | fills in proportion to the 42 s green |
| Yellow | seconds of yellow left | fills in proportion to the 3 s yellow |
| Red | seconds until this approach next turns green (includes the yellow and the 1 s all-red that come first) | empty |

The numbers are counted from the signal controller itself (42 s green, 3 s yellow, 1 s all-red, 92 s cycle), so they always match the lights drawn on the road.

### 5.7 Trend charts
- Two line charts: **vehicles queued** and **throughput (veh/h, 5-minute window)**, covering the last 10 simulated minutes.
- A sample is recorded every 5 simulated seconds; the last 180 samples are kept in memory.
- Axes are scaled automatically. Reset clears them.
- The charts show nothing meaningful until the simulation has run for a short time.

### 5.8 Live indicator and refresh rate
- A badge next to the section title shows **Live** (running), **Paused** or **Ready**.
- The road drawing is redrawn on every animation frame. The monitoring numbers and charts refresh every 0.2 real seconds, which is smooth to read without wasting effort.
- At 8x speed the numbers keep up in real time; the throughput window is measured in simulated time, not real time.

## 6. What was changed in the code (for your report)

`simulation.js`
- Model: counters for vehicles entered, a log of stop-line crossings per approach and of completions (pruned to 5 minutes), a vehicle flag `crossed`, a history sampler (every 5 s), `signalInfo()` (time left or time until green), `monitor()` (all lane, approach, total and throughput numbers), and a `history` getter.
- Constants added: lane length 55 m, density thresholds 30 and 80, throughput window 300 s.
- Interface: `drawOverlay()` (lane shading and queue bar), table and card builders, `updateMonitor()`, `drawChart()`, live badge, overlay checkbox handling.

`simulation.html` / `simulation.css`: the new section and its styles; responsive layout (4 columns, 2 columns under 900 px, 1 column under 480 px; the table scrolls sideways inside its own box on narrow screens).

## 7. Testing that was done

**Model (Node.js):**
- Time left on green was 32.0 s at t = 10 s, and time until green for East-West was 36.0 s (32 + 3 yellow + 1 all-red). Both are correct.
- Lane counts added up exactly to the vehicles located before the box, checked after 20 simulated minutes.
- At 1,200 veh/h demand over 20 minutes: throughput read 1,260 veh/h (5-minute window; normal random variation around 1,200), 405 completed of 412 entered (98.3%). Per-approach stop-line rates were 384 / 396 / 276 / 252 for N / S / E / W against expected values near 408 / 348 / 240 / 204. These differences are short-window randomness.
- At 3,000 veh/h over one hour, 720 monitor readings gave no invalid values (no negative density, no queue larger than the lane count, no queue longer than 56 m). The longest queue was 52.5 m and the most vehicles in one lane was 9.
- The Step 6.3 model results are unchanged.

**Page (headless Chromium):**
- 8 lane rows and 4 signal cards are created, the Live badge changes to Paused on pause and Ready after reset, the throughput and completed-trips cards fill in (for example "198 of 215 entered (92%)" after 4 simulated minutes at 3,000 veh/h), Reset zeroes everything, and there are no script errors.
- Looked at a full-page screenshot: overlay shading, queue bars, the signal cards, the table and the charts all render.
- At 390 px width the page does not scroll sideways.

Not tested here: your real server and login, other browsers (Safari, Firefox), and long runs of more than a few simulated hours.

## 8. Known limitations

- The monitoring describes the Step 6.3 browser model, not SUMO or the DQN.
- Lane counts only cover the 55 m approach; vehicles inside the box and on exit lanes are not in any lane.
- Density jumps in steps of about 18 veh/km because there are so few vehicles per lane.
- The throughput trend chart is noisy at low demand.
- The first few minutes of throughput are estimates from a short window.
- Like the 6.3 model, a small share of vehicles briefly overlap inside the intersection box (see the 6.3 document).

## 9. Installing it

1. Copy the three changed front-end files and the docs into your project in the same folders as before (see section 4).
2. Restart nothing on the backend; just refresh the browser (hard refresh with Ctrl+F5 so the old script is not cached).
3. Log in, open `/simulation`, press Start, and scroll down to "Real-time traffic monitoring".

## 10. Checklist: what to check now

Display
- [ ] The Monitoring link in the header jumps to the monitoring section
- [ ] The section has: Signal status, Throughput and waiting, Lanes table, Trends
- [ ] The Lanes table has 8 rows (North, South, East, West, each kerb and inner) plus an "All lanes" row

Vehicles per lane
- [ ] Counts change as vehicles arrive and leave
- [ ] Count a lane by eye on the road (use Pause) and compare with the table; vehicles inside the box are the only ones not counted

Density and queues
- [ ] Set demand to about 3,000 and 4x speed: lanes turn amber or red, and the table's Level changes to Moderate or High
- [ ] A white bar appears at the end of queues on the road, and the queue length in metres is plausible (about 6 m per queued car)
- [ ] The overlay checkbox hides and shows the shading and bars
- [ ] Set demand to 300: density stays Low and queues are short

Waiting and throughput
- [ ] During a red light, waiting times of queued cars rise second by second, then fall back to 0 after they leave
- [ ] Throughput says "collecting data" for the first seconds, then shows a figure near your demand setting after a few simulated minutes
- [ ] "Completed trips" always stays at or below "entered"
- [ ] The "Passed stop line" figures are highest for North and lowest for West (matches 34% vs 17%)

Signals
- [ ] The countdown matches the road lights: green counts down from 42, yellow from 3
- [ ] For a red approach, "until green" equals the remaining time of the other direction's green plus 3 s yellow plus 1 s all-red
- [ ] The pill words (Green / Yellow / Red) match the lights drawn on the road
- [ ] Pausing freezes the countdowns

Charts and controls
- [ ] Both charts begin to draw lines after the simulation has run for about 10 seconds of simulated time
- [ ] The badge shows Live, Paused or Ready correctly
- [ ] Reset empties the table, cards and charts
- [ ] On a narrow window the cards stack and the table scrolls inside its box

## 11. Troubleshooting

| Symptom | Likely cause |
|---|---|
| No monitoring section | Old `simulation.html` still in use; copy the new file and hard refresh |
| Section appears but all numbers stay at 0 | Old cached `simulation.js`; hard refresh (Ctrl+F5) |
| Charts empty | Simulation has not run long enough; start it and wait a few seconds, or use 4x speed |
| Overlay colours cannot be seen | The checkbox is off, or demand is very low (lanes stay a faint green) |
| Throughput looks too high at the start | The first minutes use a short window; it settles after a few simulated minutes |

## 12. Next

Step 6.5 (suggested): show real project results next to the live view: the DQN training log and fixed-time baseline as charts, then the DQN versus fixed-time comparison on the 48 held-out test hours, and eventually drive this monitoring panel from a SUMO or DQN run.
