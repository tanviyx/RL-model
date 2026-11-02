# Step 6.5 – AI Model Integration

Status: built and tested in the build environment (model service, backend route, simulation logic and page, all against your real trained checkpoint `dqn_last.pt`). Section 11 lists what you still need to check on your own machine.

## 1. Goal (from the project plan)

- Connect the PyTorch DQN model with the backend.
- Send the current traffic state to the model.
- Receive the model's recommended traffic signal action.
- Update the simulation based on the selected action.
- Display dynamically changing signal timings on the dashboard.

## 2. How it fits together

```
Browser (/simulation)                Express backend (port 3000)             Python model service (port 5001)
-------------------------            ---------------------------             --------------------------------
simulation builds the       POST     checks the login cookie,       POST     loads dqn_last.pt once,
35-value traffic state  ----------> /api/ai/decide             ---> /predict  runs the network,
                                     checks the state is 35 numbers          picks the action with the highest Q-value
simulation obeys the    <---------- returns the answer          <---------  {action, phase, green_seconds, q_values}
phase and green time
```

One decision cycle, exactly as in training (`sumo_env.py`):
1. The current green period ends (or the run has just started), so a decision is due. Simulated time is held still.
2. The browser builds the 35-value state and sends it to the backend.
3. The backend forwards it to the Python service. The network returns one Q-value per action; the best one is the recommended action.
4. The answer goes back to the browser, which applies it, and simulated time resumes.
5. The chosen green runs for 10, 20, 30 or 40 seconds, and then step 1 repeats.

Three small programs now run when you use the AI: the Python model service, the Express backend, and your browser.

## 3. Important: what this does and does not show

- The real trained model (300 training episodes, `dqn_last.pt`) makes every decision. Nothing is faked.
- The traffic it controls is the **browser simulation** from Step 6.3, which is a simplified model and not SUMO. The state the model sees is built to match what SUMO would report for the same vehicles (section 6.3), but the browser traffic is not identical to the SUMO traffic the model trained on.
- So the results on this page show that the integration works and that the model reacts sensibly. They are **not** evidence of how good the DQN is. That evidence is the evaluation on the 48 held-out test hours in SUMO (Step 6 in `PROJECT_STEPS.md`, still to do).

## 4. Files

| File | Status | Purpose |
|---|---|---|
| `model/serve.py` | new | HTTP service that loads the trained DQN and returns the recommended action |
| `backend/routes/ai.js` | new | Login-protected API: `GET /api/ai/status`, `POST /api/ai/decide` |
| `backend/server.js` | replaced | Adds one line to register the `/api/ai` routes |
| `frontend/public/js/simulation.js` | replaced | AI controller inside the model, state builder, decision loop, AI display |
| `frontend/private/simulation.html` | replaced | AI option enabled, new "AI signal control" section, "AI control" header link |
| `frontend/public/css/simulation.css` | replaced | Styles for the new section |
| `frontend/private/dashboard.html` | replaced | Adds an "Open with AI signal control" button |
| `docs/STEP_6.5_AI_Model_Integration.md` | new | This document |
| `docs/PROJECT_LOG.md` | updated | Step 6.5 entry and new run instructions |

No new npm packages and no new Python packages. The backend uses Node's built-in `fetch`, so you need **Node 18 or newer** (check with `node --version`). `model/serve.py` uses the standard library, numpy and, when available, PyTorch (already in your `requirements.txt`). The checkpoint is not part of this download; the service reads `model/results/models/dqn_last.pt` from your project.

Optional: add `AI_SERVICE_URL=http://127.0.0.1:5001` to `backend/.env` and `.env.example` if you ever move the model service to another port or machine. It defaults to that value.

## 5. How to run it

Two terminals:

```
# terminal 1: the model service
cd model
python serve.py
#   DQN service ready: dqn_last.pt (trained 300 episodes, pytorch) at http://127.0.0.1:5001

# terminal 2: the web app
cd backend
npm run dev
```

Then open http://localhost:3000, log in, and either click **Open with AI signal control** on the dashboard or open `/simulation` and choose **AI agent (DQN, trained model)** under Signal control. Press Start.

If you want to use a different checkpoint, for example the saved one at episode 300: `python serve.py --model results/models/dqn_ep300.pt`.

## 6. Each requirement in detail

### 6.1 Connecting the PyTorch DQN to the backend
- `model/serve.py` loads the checkpoint once at start-up, using the same `QNetwork` class and the same `torch.load` call as `DQNAgent.load()` in `dqn_agent.py`, and serves it on `127.0.0.1:5001`. It listens on the local machine only.
- Endpoints: `GET /health` (status, episode, backend name) and `POST /predict` (state in, action out).
- If PyTorch is not installed, the service reads the same weights with a small built-in numpy reader. The answers are identical; the `/health` and badge text show `numpy` instead of `pytorch`. With PyTorch installed, which is your normal setup, it shows `pytorch`.
- Input checks: the state must be a list of exactly 35 finite numbers; values are clipped to 0 to 1 (as in training). Anything else gets a clear 400 error. Request bodies over 16 KB are refused.
- `backend/routes/ai.js` is the only caller. It requires a valid login cookie (401 otherwise), checks the state again, forwards it with a 3-second timeout, and returns the model's answer. If the Python service is not running it returns 503 with the message "The AI model service is not running. In the model folder run: python serve.py".
- The Python service is never reachable from the internet or the browser directly.

### 6.2 Sending the current traffic state
The browser builds the same 35-value vector `sumo_env.get_state()` builds in training:

| Position | Meaning | Value sent |
|---|---|---|
| 0 to 31 | 8 incoming lanes, 4 values each, in the order North kerb, North inner, South kerb, South inner, East kerb, East inner, West kerb, West inner | see below |
| 32, 33 | Current green phase (one-hot) | North-South = [1, 0], East-West = [0, 1] |
| 34 | Time spent in the current phase | seconds in the phase divided by 60, capped at 1 |

The four values for each lane:

| Value | How it is calculated here |
|---|---|
| Queue | vehicles on the lane moving slower than 0.1 m/s, divided by 33.3 (a full 250 m lane), capped at 1 |
| Vehicles | vehicles on the lane divided by 33.3, capped at 1 |
| Waiting time | sum of the accumulated waiting seconds of the vehicles on the lane, divided by 500, capped at 1 |
| Occupancy | number of vehicles times 4.5 m, divided by 250 m, capped at 1 |

Adaptation to be aware of: in SUMO the lanes are 250 m long. In the browser each lane is 55 m. The state is computed as SUMO would report it for the **same vehicles** on a 250 m lane, so a queue of 4 cars looks the same to the model in both. The only difference appears when a queue is longer than the 55 m lane holds (about 9 cars): the browser cannot show that, so the largest queue values the model saw in training cannot occur.

Lane order assumption: "kerb lane" is the lane next to the kerb, which is SUMO's lane 0 (`N_in_0`, the rightmost lane). If your `intersection.net.xml` is different from the SUMO default, the kerb and inner lanes would be swapped; this is worth a quick check in `netedit`.

You can see the exact values sent for the latest decision on the page: "State sent to the model for the latest decision (35 values)".

### 6.3 Receiving the recommended action
The service returns, for example:

```json
{"action": 1, "phase": 0, "green_seconds": 20,
 "q_values": [-39.55, -36.85, -37.75, -38.31, -43.16, -46.08, -56.22, -61.70],
 "episode": 300, "backend": "pytorch"}
```

`action = phase * 4 + duration_index`, durations 10, 20, 30, 40 s (phase 0 = North-South green, phase 1 = East-West green), the same encoding as `decode_action()` in `sumo_env.py`. The recommended action is the one with the highest Q-value.

### 6.4 Updating the simulation from the action
The signals follow the same rules as the training environment:
- **Different phase chosen:** the current approaches get a 3 s yellow, then there is 1 s of all red (extra in this visual model, as in Step 6.3), then the new phase turns green for the chosen number of seconds.
- **Same phase chosen:** the green is extended by the chosen number of seconds. No yellow.
- When that green runs out, simulated time stops until the next answer arrives (normally a few milliseconds), so no simulated time is lost waiting for the model.
- The very first decision is made at time 0, as in training.
- Both directions are never green at the same time (checked in testing).

If the model service stops or the session expires mid-run: the simulation pauses, a red message explains what to do, and pressing Start retries. It never silently falls back to fixed timing. A login that has expired sends you to the login page.

### 6.5 Dynamic signal timings on the dashboard
The new "AI signal control" section (and the Signals and Signal status cards elsewhere on the page) shows:
- **Model badge:** online or offline, how many training episodes, and which backend.
- **Current decision:** phase and green seconds chosen, decision number and time, whether it switched phase or extended, and what the signal is doing now with a progress bar and seconds left.
- **Counters:** number of decisions, phase switches, average green time (compared with the fixed plan's 42 s).
- **Q-values:** the model's score for all 8 actions, with the chosen one highlighted.
- **Timings chart:** one bar per decision (last 30), height = green seconds, blue for North-South and amber for East-West, with a dashed line at the fixed plan's 42 s.
- **Recent decisions table:** the last 8 decisions with number, time, phase, green time, switch or extend, and vehicles queued at that moment.
- **State details:** the 35 values behind the latest decision.
- **Signal status cards** (Step 6.4): in AI mode the red approaches show **"earliest green"**, because when they turn green depends on future decisions. The number assumes the model switches at the next decision.

## 7. Changes made to existing code
- `simulation.js` model: a controller option (`fixed` or `dqn`); in `dqn` mode a small signal program (green, yellow, all red) replaces the fixed cycle; new functions `aiState()`, `applyAction()`, `needsDecision()`. The fixed-time behaviour is unchanged (same results as Step 6.4: 1,192 completed, 11.4 s average wait at 1,200 veh/h, seed 1).
- Changing "Signal control" resets the run, so each run uses one controller only.
- The page also accepts `/simulation?controller=dqn` to start in AI mode.
- Reset keeps the same random seed, so you can compare the fixed plan and the AI on identical-looking arrival patterns by running one, noting the numbers, changing the controller, and running again. Because vehicle choices differ after the first signal difference, the traffic is similar but not identical.

## 8. Testing that was done

All of this was run in the build environment against your real checkpoint.

**Model service**
- Checkpoint loads: 300 episodes, 48,585 learning steps, layers 35-128-128-8.
- Hand-made states give sensible answers: with heavy North-South queues and empty East-West the model chooses a North-South action, and the reverse for East-West; with both light it picks a short East-West green.
- Bad input (wrong length, text, NaN, non-JSON) is rejected with 400.

**Backend route** (real route code with the real login check)
- No login: 401 on both endpoints. Logged in: status and decide work. Bad state: 400. Service stopped: 503 with the helpful message.

**Closed loop** (the real model deciding in the browser simulation, 4 random seeds, 1 simulated hour each)

| Demand | Controller | Vehicles completed | Avg wait | Avg green | Switches per hour |
|---|---|---|---|---|---|
| 1,200 veh/h | Fixed-time | 1,169 | 12.0 s | 42 s | 0 |
| 1,200 veh/h | AI | 1,199 | 8.2 s | 29.4 s | 108 |
| 2,400 veh/h | Fixed-time | 2,378 | 12.9 s | 42 s | 0 |
| 2,400 veh/h | AI | 2,412 | 8.9 s | 29.0 s | 110 |
| 3,000 veh/h | Fixed-time | 2,992 | 15.2 s | 42 s | 0 |
| 3,000 veh/h | AI | 3,007 | 9.1 s | 27.1 s | 116 |

- Signals never showed green in both directions at once.
- Stage timings are as designed: yellow 3 s, all red 1 s, then the chosen green (for example 20 s, 30 s).
- Longer 4-hour runs at 1,200 and 3,000 veh/h finish without problems (longest time a car was blocked inside the intersection: 5 s and 11 s; brief overlaps of two cars inside the intersection in 0.7% and 2.3% of vehicles, the same limitation as in Step 6.3).
- The model chose all 8 actions across the runs, favouring 30 and 40 s North-South greens and 20 and 30 s East-West greens (the heavier approaches get longer greens).

**Page (headless Chromium)**
- Model badge shows online; switching to AI resets and shows the AI section; decisions, switches and average green update; signal cards show "earliest green" for red approaches.
- Stopping the model service mid-run shows the error and pauses; restarting and pressing Start resumes; switching back to fixed time works.
- Opening `/simulation?controller=dqn` starts in AI mode.
- No script errors; no sideways scrolling at 390 px width.

Not tested here: PyTorch loading (this build environment has no PyTorch, so the numpy reader ran; the PyTorch path uses the same calls as your own `DQNAgent.load()`), your real login and server, Safari and Firefox.

## 9. Observations worth knowing for your report
- The model switches phase on almost every decision (for example 108 switches in 109 decisions) and varies the green length between 10 and 40 s. That is a learned strategy of alternating directions with adaptive green times, not a bug. Each switch costs 4 s of yellow and all red.
- On the browser model the AI reduced average waiting time by roughly 30 to 40 percent against the fixed plan. Treat this as an illustration only (see section 3).
- Q-values are large negative numbers when traffic is heavy (for example around -40 or -140). They are estimated total future reward, not probabilities, so only their order matters.

## 10. Known limitations
- The browser model is not SUMO, and its lanes are 55 m, so extreme queues cannot appear (section 6.2).
- The model needs the Python service running; the web app does not start it for you.
- Each decision makes one network call; there is no caching or batching, which is fine at one call every 10 to 40 simulated seconds.
- Only one controller runs per simulation; there is no side-by-side live comparison yet.
- The model was trained on SUMO demand for Junction 1; demand on this page is set by the slider.
- In AI mode the all-red second remains an addition compared with SUMO.

## 11. Checklist: what to check now

Model service
- [ ] `python serve.py` starts and prints "DQN service ready ... pytorch" (if it says `numpy`, PyTorch is not installed in that Python; it still works)
- [ ] http://127.0.0.1:5001/health in a browser shows status ok, episode 300, state_size 35, action_size 8
- [ ] Stopping it with Ctrl+C and starting again works

Backend
- [ ] Logged out, http://localhost:3000/api/ai/status returns a 401 message
- [ ] Logged in, the same address shows `"online": true` with the model details
- [ ] With the Python service stopped, it shows `"online": false`

Page
- [ ] The AI signal control section shows "Model online" with the episode count
- [ ] The dashboard's "Open with AI signal control" button opens the simulation already in AI mode
- [ ] Choosing the AI agent resets the simulation and shows the AI panels
- [ ] After Start, the first decision appears at 00:00 and later decisions follow when each green ends

Following the model's decisions
- [ ] A decision that switches phase is followed by 3 s yellow, then 1 s all red, then green for exactly the chosen seconds
- [ ] A decision that keeps the phase extends the green with no yellow
- [ ] The chosen action matches the highest Q-value (highlighted row)
- [ ] Bars in the timings chart match the "Recent decisions" table
- [ ] Both directions are never green together
- [ ] Signal status cards count down the green time and show "earliest green" for red approaches

State and behaviour
- [ ] Open "State sent to the model": all values between 0 and 1, and the busier approaches have bigger queue values
- [ ] Heavy North or South traffic leads to longer North-South greens over time, and similarly for East-West
- [ ] Demand 2,400 at the same speed: compare the Live statistics "Avg wait (completed)" after 5 simulated minutes for fixed-time and AI (reset between them)

Failure handling
- [ ] Stop the Python service mid-run: the simulation pauses with a clear red message
- [ ] Start the service again and press Start: it carries on
- [ ] Switching Signal control back to Fixed-time shows the idle message in the AI section

## 12. Troubleshooting

| Symptom | Likely cause |
|---|---|
| "The AI model service is not running" | `python serve.py` not started, or started in the wrong folder, or a different port than `AI_SERVICE_URL` |
| `Checkpoint not found` when starting the service | You have not trained yet, or the file is not at `model/results/models/dqn_last.pt`; use `--model` to point to it |
| `ModuleNotFoundError: dqn_agent` or torch errors | Run `serve.py` from inside the `model` folder with your project's Python environment active |
| Badge says "Model offline" but the service is running | Backend cannot reach it: check `AI_SERVICE_URL` and that nothing else uses port 5001 |
| 401 / sent back to login | Your session expired; log in again |
| `fetch is not defined` in the backend console | Node older than 18; update Node |
| AI option is missing in the dropdown | Old `simulation.html` or cached script; copy the new files and hard refresh (Ctrl+F5) |
| Simulation stalls at "asking the model" | Service slow or stopped; the page shows an error and pauses after the request fails |

## 13. Next

Step 6.6 (suggested): the real evaluation. Run the trained DQN and the fixed-time controller in SUMO on the same 48 held-out test hours and compare average wait, 95th percentile, queue length and throughput (as already planned in `PROJECT_STEPS.md`), then show those results, and the training curve from `training_log.csv`, on the dashboard.
