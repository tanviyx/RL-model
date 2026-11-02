# Step 6.3 – Traffic Simulation Page Development

Status: built and tested on the model side and in a headless browser; see section 9 for what you still need to check on your own machine.

## 1. Goal (from the project plan)

- Create the main simulation interface.
- Show a visual representation of the road network and traffic intersection.
- Display vehicles moving across different lanes.
- Visualize traffic signals (red, yellow, green).
- Add controls to start, pause and reset the simulation.

## 2. What was built, in one paragraph

A protected page at `/simulation` (login required) that draws a top-down four-way intersection with 2 lanes per approach on an HTML canvas. Vehicles are generated at random, follow lanes, stop at red lights, queue, turn left, right or go straight, and leave the map. A fixed-time signal controller (42 s green, 3 s yellow) switches the lights. A side panel holds Start / Pause / Reset, a demand slider, a speed selector, live signal states and live statistics.

## 3. Important: what this simulation is and is not

| It is | It is not |
|---|---|
| A browser-side visual model written in JavaScript, built for the web interface | SUMO. SUMO still runs only in Python (`model/`) |
| Using the project's assumptions: 2 lanes per approach, N/S and E/W phases, 42 s green + 3 s yellow, approach split N 34% / S 29% / E 20% / W 17%, turning split 70% straight / 15% right / 15% left | Driven by the trained DQN. The DQN is not connected yet |
| Driven by a demand slider you set by hand | Replaying the Kaggle hourly counts yet |

Because of this, the numbers on this page (for example its average wait) must not be compared with the SUMO baseline (30.1 s) or with DQN results. They come from a different, simplified model. Connecting the page to real DQN and SUMO results is a later step.

One small difference from the SUMO baseline: the page adds **1 second of all-red** after each yellow so the intersection box clears and cars do not visibly overlap. The signal cycle is therefore 92 s instead of 90 s.

## 4. Files

Copy them into the project exactly as laid out (this matches the structure from the reorganisation step).

| File | Status | Purpose |
|---|---|---|
| `frontend/private/simulation.html` | new | The page structure: header, canvas, control panel, signals panel, statistics panel. Private, so only served after login |
| `frontend/public/css/simulation.css` | new | Page styling (same colours and font as the login pages) |
| `frontend/public/js/simulation.js` | new | The traffic model (SimCore) and the browser interface (canvas drawing, controls, statistics) |
| `frontend/private/dashboard.html` | replaced | Same as before, plus an "Open traffic simulation" button |
| `backend/server.js` | replaced | Same as before, plus one new route: `GET /simulation` (login required) |
| `docs/STEP_6.3_Simulation_Page.md` | new | This document |
| `docs/PROJECT_LOG.md` | updated | Step 6.3 entry and checklist added |

Nothing else changes. No new npm packages are needed. The page loads one Google font (Bricolage Grotesque) from the internet; if it cannot load, the browser falls back to a system font.

Why `simulation.js` and the CSS are in `public/` while `simulation.html` is in `private/`: the web server only sends files from `private/` after checking the login cookie, and the page needs its script and styles from a normal static folder. The script contains no secrets.

## 5. How the page works

### 5.1 Page layout
- **Header:** SmartSignal name, links to Dashboard and Simulation, the signed-in email (fetched from `/api/auth/me`), and a Log out button. If you are not logged in the page sends you to `/login`.
- **Left:** the canvas with the intersection, and a caption.
- **Right panel**, three cards: Controls, Signals, Live statistics.
- On screens narrower than 900 px the panel moves below the canvas. Tested at 390 px wide with no sideways scrolling.

### 5.2 The road network drawing
- World units are metres, drawn at 6.4 pixels per metre on an 800 x 800 logical canvas (about 125 m across). The canvas is scaled for sharp rendering on high-density screens.
- Four arms meet in a 14 m x 14 m box. Each arm has two lanes per direction, 3.5 m wide.
- Drawn details: asphalt, double yellow centre lines, dashed white lane dividers, zebra crossings, stop lines, and a ground colour around the roads.
- Traffic drives on the **right**, which is the SUMO default.
- Lane roles: the kerb lane carries straight and right-turning vehicles, the inner lane carries straight and left-turning vehicles.

### 5.3 Vehicles
- Each vehicle is a 4.5 m x 1.8 m rounded rectangle in one of 8 colours, rotated to its heading so it turns visibly through the box.
- Brake lights light up when a vehicle slows down or is stopped.
- Arrivals: random (Poisson process). The rate for each approach is: total demand per hour x approach share / 3600.
- Turn choice: 70% straight, 15% right, 15% left. Straight vehicles pick the lane with fewer vehicles waiting.
- A vehicle that cannot enter because the entry is occupied waits in a hidden backlog and enters as soon as there is room.
- Each vehicle follows a fixed path: approach lane, through the box (a straight line, or a curve for turns), then an exit lane. Right turns end in the kerb exit lane, left turns in the inner exit lane.

### 5.4 Driving rules
Every 0.1 s of simulated time each vehicle chooses its speed as the smallest of:
1. Speed limit 50 km/h (13.9 m/s).
2. Acceleration limit 2.6 m/s².
3. A safe speed that lets it stop before the nearest obstacle, where the obstacle can be:
   - a red light (it stops 0.5 m before the stop line),
   - a yellow light, only if it can stop comfortably (decelerating at 3 m/s²); otherwise it continues,
   - the vehicle in front in the same lane (minimum gap 1.5 m),
   - a vehicle it must give way to inside the intersection.

Right-of-way rules inside the intersection:
- A vehicle already in the box has priority over one that has not entered.
- Otherwise straight and right-turning vehicles have priority over left-turning ones.
- A left-turning vehicle waits at the line for a gap in oncoming traffic, and waits less strictly the longer it has been waiting. It is held only while its own light is green and the oncoming vehicle is actually able to move.
- A left-turner that has already waited more than 5 s may complete its turn on yellow.
- If a vehicle has been blocked inside the box for more than 6 s it ignores priority to break a possible deadlock.

### 5.5 Traffic signals
- Cycle: North-South green 42 s, North-South yellow 3 s, all red 1 s, East-West green 42 s, East-West yellow 3 s, all red 1 s.
- Shown in three places: the colour of each stop line, a three-lamp signal head beside each approach (the lit lamp glows), and the Signals card (a colour dot plus the word Green / Yellow / Red, so it does not rely on colour alone). The Signals card also shows the current phase and seconds left.

### 5.6 Controls
| Control | Behaviour |
|---|---|
| Start | Starts the simulation. After a pause the label changes to Resume |
| Pause | Freezes time. Vehicles and signals stay where they are |
| Reset | Clears all vehicles and statistics and restarts the signal cycle at North-South green. The random seed is fixed, so the same traffic appears every time you reset (useful for comparing settings) |
| Traffic demand slider | 300 to 3,500 vehicles per hour in steps of 100, default 1,200. Takes effect immediately, without a reset. For reference, your training data scales so that the 95th-percentile hour is 3,000 |
| Simulation speed | 1x, 2x, 4x or 8x |
| Signal control | "Fixed-time (42 s green, 3 s yellow)". A second option, "AI agent (DQN) - coming soon", is shown greyed out and cannot be selected |
| Space bar | Starts or pauses (when no text field or button is focused) |
| Status badge | Ready / Running / Paused / Reset |

### 5.7 Live statistics (how each number is calculated)
| Name | Meaning |
|---|---|
| Simulated time | Simulated clock in mm:ss (not real time; at 8x it runs faster) |
| Vehicles on road | Vehicles currently inside the map |
| Completed trips | Vehicles that have left the map |
| Avg wait (completed) | Average waiting time of completed trips. A vehicle accumulates waiting time whenever its speed is below 0.1 m/s, the same idea as SUMO's accumulated waiting time |
| Longest current wait | The largest accumulated waiting time among vehicles still on the road |
| Vehicles queued | Vehicles slower than 0.5 m/s that are before or at a stop line, summed over the four approaches |
| Per-approach rows | Signal state, queue bar and queue count for North, South, East and West. The same queue count also appears in the pill label on each arm of the canvas |

## 6. Testing that was done

All of this was run in the build environment, not on your machine.

**Traffic model (Node.js, 1 simulated hour each, same seed):**

| Demand (veh/h) | Completed | Avg wait | Longest queue | Close-contact events* |
|---|---|---|---|---|
| 300 | 306 | 10.9 s | 7 | 1 |
| 1,200 | 1,192 | 11.4 s | 15 | 9 |
| 2,400 | 2,352 | 12.8 s | 27 | 23 |
| 3,000 | 2,982 | 15.2 s | 33 | 76 |
| 3,500 | 3,525 | 20.7 s | 40 | 152 |

*A close-contact event means two vehicle centres came closer than 2.2 m at some moment, which on screen can look like two cars briefly overlapping inside the intersection. It happens in about 1% of vehicles at 1,200 per hour and up to about 4% at 3,500 per hour. See limitations.

Other model checks:
- The same seed gives identical results every time (deterministic).
- The signal order and timing are correct: 42 s, 3 s, 1 s, 42 s, 3 s, 1 s.
- No gridlock: the longest time any vehicle sat blocked inside the box was about 15 s at the highest demand.
- Vehicles now stop at red lights. (A first version let them roll through at about 3 m/s; this was found by testing and fixed by stopping them 0.5 m before the line.)

**Page (headless Chromium):**
- Page loads, vehicles move, signals change, statistics update.
- Start sets the status to Running, Pause freezes the clock and shows Resume, Reset returns to 00:00 and Start.
- Space bar starts and pauses.
- The demand slider label updates (for example "3,000 vehicles/hour").
- At 390 px width the canvas fills the screen and the page does not scroll sideways.
- The only browser console error was the Google font failing to download in the build environment, which does not occur with internet access.

Not tested here: login redirects and the `/simulation` route on your real server, and Safari or Firefox.

## 7. Installing it

1. Copy the files from section 4 into your project, replacing `dashboard.html` and `server.js`.
2. From `backend/`: `npm run dev`.
3. Log in, then click "Open traffic simulation" on the dashboard, or go to http://localhost:3000/simulation.

## 8. Known limitations (be upfront about these in the report)

- It is a simplified visual model, not SUMO, and it is not connected to the DQN.
- Demand is set by hand, not taken from the Kaggle hourly data.
- Vehicles are all the same size, there are no pedestrians, buses, or lane changes, and the road is a single isolated intersection.
- Right-hand traffic is assumed.
- Occasional brief overlaps of two vehicles inside the box, rising with demand.
- Waits and queues from this page are not comparable with the SUMO baseline or DQN evaluation numbers.
- The 1 s all-red differs from the SUMO baseline plan.

## 9. Checklist: what to check now

Server and access
- [ ] `/simulation` while logged out redirects to `/login`
- [ ] After login, the dashboard shows the "Open traffic simulation" button and it opens the page
- [ ] The page header shows your email; Log out returns you to `/login`

Road network
- [ ] An intersection with 2 lanes per direction, centre lines, lane dashes, zebra crossings and stop lines is visible
- [ ] Labels N, S, E, W appear at the ends of the arms

Signals
- [ ] North and South are green at the start while East and West are red
- [ ] Phase order: N/S green (42 s), N/S yellow (3 s), all red (1 s), E/W green, E/W yellow, all red
- [ ] Signal heads, stop-line colours and the Signals card all agree at every moment
- [ ] The countdown ("... s left") decreases and resets at each phase change

Vehicles
- [ ] Vehicles arrive on all four arms, more from North than West (34% vs 17%)
- [ ] Vehicles stop at red, queue behind each other, and move off on green
- [ ] Some vehicles turn right and some turn left through the box
- [ ] Brake lights show when vehicles slow or stop

Controls
- [ ] Start begins, Pause freezes everything, the button then reads Resume
- [ ] Reset returns to 00:00 with an empty road; starting again shows the same traffic as before
- [ ] Demand slider: moving it to 3,000 visibly increases traffic and queues, moving it to 300 thins it out
- [ ] Speed 8x makes everything run faster; 1x returns to normal
- [ ] The greyed "AI agent (DQN)" option cannot be selected
- [ ] Space starts and pauses

Statistics
- [ ] Time, vehicles on road, completed trips and queue counts change as expected
- [ ] "Avg wait" shows a dash until the first vehicle completes
- [ ] Queue numbers on the road labels match the numbers in the Signals card

Appearance
- [ ] Narrow your browser window (or use a phone): the layout stacks and nothing is cut off

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Cannot GET /simulation` | The new `server.js` was not copied into `backend/`, or the server was not restarted |
| Page is blank or unstyled | `simulation.css` or `simulation.js` is not inside `frontend/public/css/` or `frontend/public/js/` |
| Redirected to login on every visit | Cookie missing; open the site at `localhost:3000` and log in again |
| Canvas shows but nothing moves | Press Start (or Space); the hint "Press Start to begin" is shown until you do |
| Very slow or choppy at 8x with high demand | Lower the speed to 4x; a very old computer may struggle |

## 11. Next

Step 6.4 (suggested): connect this page to real results, in this order of effort:
1. Show the DQN training log (`model/results/training_log.csv`) and the fixed-time baseline as charts.
2. Run the trained DQN and the fixed-time controller in SUMO on the 48 test hours and display the comparison.
3. Drive this live view from SUMO or from a saved DQN run, so the "AI agent" option becomes real.
