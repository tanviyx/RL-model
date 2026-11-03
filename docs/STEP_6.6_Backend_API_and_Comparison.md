# Step 6.6 – Backend APIs and fixed-time vs AI comparison

## What it does
The same traffic (same seed, same arrival moments, same turning choices) goes through a fixed-time signal (42 s green) and through the trained DQN. You pick 5 minutes, 30 minutes or 1 hour of simulated time. Both runs are stored in MongoDB and compared on average wait, 95th percentile wait, longest wait, travel time, average and worst queue, vehicles completed and throughput.

The run happens on the server (`services/experimentEngine.js`, using the same `SimCore` as the simulation page), so the browser does not have to stay busy. Speed options: as fast as possible, 60x, 10x or real time.

## Endpoints (all need login)
| Method and path | Purpose |
|---|---|
| POST /api/experiments `{minutes: 5\|30\|60, demand?, seed?, speed?}` | Start a run (202). One active run per user |
| GET /api/experiments | Your past runs (no samples) |
| GET /api/experiments/:id | One run; live progress and samples while running |
| POST /api/experiments/:id/cancel | Stop a running run |
| DELETE /api/experiments/:id | Delete a finished run |
| GET /api/experiments/:id/export.csv | Both signals' samples as CSV |
| GET /api/traffic/live?experiment= | Latest reading of both signals |
| GET /api/traffic/history?experiment=&controller=&from=&to=&limit= | Time series |
| GET /api/traffic/summary | Average AI-vs-fixed change over your finished runs |
| GET /api/traffic/baseline | SUMO fixed-time results on the 48 test hours |
Existing: /api/auth/*, /api/ai/status, /api/ai/decide.

## Files
New: `backend/services/{experimentEngine,experimentRunner,experimentView,modelClient}.js`, `backend/models/Experiment.js`, `backend/routes/{experiments,traffic}.js`, `backend/test/api.test.js`, `frontend/private/compare.html`, `frontend/public/js/compare.js`.
Changed: `server.js` (routes, /compare page, marks interrupted runs failed on start), `routes/ai.js` (uses modelClient), `simulation.js` (arrivals now identical across controllers; `stats()` added), `dashboard.html` (link).

## Check
- [ ] Start MongoDB, `python serve.py` in `model`, `npm start` in `backend`
- [ ] Log in, open /compare, run 5 minutes: bar fills, charts draw, result table appears
- [ ] Run 30 minutes and 1 hour; both finish in seconds
- [ ] Both signals report the same "spawned" count in the table
- [ ] Refresh the page: the run is still in Past runs; Open, CSV and Delete work
- [ ] In Compass, the `experiments` collection holds the documents
- [ ] `node test/api.test.js` (needs the model service) prints only "ok" lines

## Limits
Results come from the browser traffic model, not SUMO. Duration is simulated time. Demand is constant per run.
