# Step 6.7 – Database integration (MongoDB)

## Collections
| Collection | Model | One document is | Written | Main indexes |
|---|---|---|---|---|
| users | `User` | an account (name, email, password hash or Google id, `lastLoginAt`, `loginCount`) | register, login | unique email |
| experiments | `Experiment` | one comparison run: settings (length, traffic, seed, speed), status, model checkpoint used, **summary metrics for both signals**, the comparison | start, finish | user + createdAt |
| trafficsamples | `TrafficSample` | one reading of one signal at one moment (queues per approach, waits, throughput…) | once, when the run finishes | experiment + controller + t |
| signaltimings | `SignalTiming` | one green period of one signal: phase, green seconds, queues at that moment; AI also stores action and Q-values | once, when the run finishes | experiment + controller + n |

`experiment` and `user` in the last two collections point back to the run and its owner. Deleting a run removes its samples and timings too. The time series are not embedded in the experiment, so a long run never approaches MongoDB's 16 MB document limit and any time range can be queried on its own.

## Endpoints added
| Path | Returns |
|---|---|
| GET /api/history/overview | profile and login info, totals, average AI-vs-fixed change, results by run length and by traffic level, trend of the last 20 runs |
| GET /api/history/timings?experiment=&controller= | signal timings of a run (default: latest finished) plus per-signal statistics |
The Step 6.6 `/api/traffic/*` and `/api/experiments/*` endpoints now read from these collections.

## Dashboard
`/dashboard` now shows your stored totals, the average improvement, a per-run wait chart, results by length and traffic level, and the signal-timing chart and table of your latest run, all read from MongoDB.

## Files
New: `models/TrafficSample.js`, `models/SignalTiming.js`, `services/runStore.js`, `routes/history.js`, `test/fakeDb.js`, `frontend/public/js/dashboard.js`.
Changed: `models/Experiment.js` (samples removed), `models/User.js`, `routes/auth.js`, `routes/experiments.js`, `routes/traffic.js`, `services/experimentRunner.js`, `services/experimentView.js`, `services/experimentEngine.js`, `server.js`, `simulation.js` (signal-timing log), `dashboard.html`.

## Check
- [ ] Restart the backend, log in, run 5, 30 and 60 minute comparisons, open /dashboard
- [ ] Compass: collections `users`, `experiments`, `trafficsamples`, `signaltimings` exist
- [ ] `trafficsamples` has about 2 × 61 rows for a 5-minute run and 2 × 121 for 30 or 60 minutes
- [ ] In `signaltimings`, fixed rows all have `green: 42`; AI rows have 10, 20, 30 or 40
- [ ] The `users` document shows `loginCount` rising and `lastLoginAt` updating on each login
- [ ] Delete a run on /compare: its rows disappear from both collections
- [ ] `node test/api.test.js` prints only "ok" lines (the model service must be running)

## Limits
Runs made with Step 6.6 only (samples embedded) keep their summary but have no charts; run them again. The tests use an in-memory stand-in for the models, so indexes and real MongoDB behaviour are checked only when you run it on your machine.
