# SmartSignal – Project Log and Step-by-Step Checks

Adaptive traffic signal control with a Deep Q-Network (DQN), plus a web application (home page, login/register, simulation dashboard).

How to use this document: after finishing each step, run the checks listed for it and tick them off before moving on.

---

## 1. Folder structure (target)

```
RL-model/
├── backend/                  Express API + MongoDB (Node)
│   ├── config/passport.js        Google OAuth strategy
│   ├── middleware/auth.js        login checks for pages and API
│   ├── models/User.js            MongoDB user schema
│   ├── routes/auth.js            register, login, Google, me, logout
│   ├── utils/mailer.js           welcome email
│   ├── utils/token.js            JWT cookie helpers
│   ├── server.js
│   ├── package.json / package-lock.json
│   ├── .env                      secrets, never committed
│   └── .env.example              template without secrets
├── frontend/                 Browser pages (no server code)
│   ├── public/                   open to everyone
│   │   ├── index.html  login.html  register.html
│   │   ├── css/auth.css
│   │   └── js/auth.js
│   └── private/dashboard.html    only after login
├── model/                    Python: SUMO + DQN
│   ├── dqn_agent.py  sumo_env.py  train.py
│   ├── run_baseline_real.py  test_rl_definition.py
│   ├── generate_routes.py  real_demand.py
│   ├── edges.edg.xml  nodes.nod.xml  intersection.net.xml
│   ├── traffic.csv               Kaggle data
│   ├── results/                  training_log.csv, baseline logs, trained model
│   └── requirements.txt
├── docs/
│   ├── PROJECT_STEPS.md          design of the RL system (Steps 1-5)
│   ├── PROJECT_LOG.md            this file
│   └── AUTH_SETUP.md             Google + Gmail setup notes
├── .gitignore
└── README.md                     short overview + link to docs/
```

Why this layout: the web app (Node) and the RL code (Python) are separate programs, so each has its own folder and its own dependency file. `frontend/` holds only what runs in the browser, and `backend/` holds everything that runs on the server.

## 2. Clean-up review of the current tree

**In the wrong place**

| Item | Problem | Fix |
|---|---|---|
| `frontend/config, middleware, models, routes, utils` | Server code inside the frontend folder | Move to `backend/` |
| `server.js, package.json, package-lock.json, node_modules, .env, .env.example` at the root | Node project files mixed with the whole project | Move to `backend/` (reinstall `node_modules`) |
| `requirements.txt` at the root | It lists Python packages | Move to `model/` |
| `frontend/views/dashboard.html` | A page, not an API view | Move to `frontend/private/` |
| `README-AUTH.md`, `model/PROJECT_STEPS.md` | Documents scattered | Move to `docs/` |
| `model/__pycache__/` | Generated files | Keep locally, add to `.gitignore` |
| `certs/` | Purpose unclear | See below |

**`certs/`:** if it holds HTTPS keys or MongoDB TLS files, move it to `backend/certs/` and add it to `.gitignore`. If it was created by accident or is empty, delete it. Never commit private keys.

**Possibly redundant:** `model/run_baseline.py` and `run_baseline_real.py`. Your docs use `run_baseline_real.py`; if the older one is no longer used, move it to `model/old/` or delete it. Do not move `log_fixed_time...csv`, because the resumable baseline script may read it from its current location.

**Missing**
- `docs/` folder (created by the script)
- A root `README.md` that explains the structure (a short one is fine, linking here)
- `.gitignore` entries (see section 3)
- A trained model file inside `model/results/`: confirm `train.py` saves one, because Step 6 and the dashboard will need to load it

## 3. Recommended `.gitignore` (project root)

```
node_modules/
.env
backend/certs/
certs/
__pycache__/
*.pyc
venv/
.venv/
*.log
.DS_Store
```

Decide separately whether `model/results/` is committed. Small CSV logs are useful for your report; large simulator outputs are not.

## 4. How to run everything

**Web app**
```
cd backend
npm install
npm run dev
```
Open http://localhost:3000. Health check: http://localhost:3000/api/health should show `server: ok` and `database: connected`.

**RL model** (from `model/`)
```
pip install -r requirements.txt
python test_rl_definition.py
python run_baseline_real.py
python train.py --episodes 300
```

**AI model service** (needed for the AI signal option; from `model/`, in a second terminal next to the web app)
```
python serve.py
```
It serves `results/models/dqn_last.pt` on http://127.0.0.1:5001 and must be running before you choose "AI agent (DQN)" on the simulation page.

---

## 5. What each step did and what to check

### Step 1 – Problem identification
Defined the problem (fixed-time signals ignore real traffic), the objectives (less waiting, shorter queues, more throughput) and the scope (one 4-way intersection, 2 lanes per approach, 2 phases).
**Check:** `docs/PROJECT_STEPS.md` states scope and objectives clearly. Nothing to run.

### Step 2 – Simulation and data
Built the SUMO intersection (`nodes.nod.xml`, `edges.edg.xml`, `intersection.net.xml`), generated demand from Junction 1 of the Kaggle dataset (`real_demand.py`, `generate_routes.py`), split train/test by week, and measured the fixed-time baseline on 48 held-out hours.
**Check**
- [ ] `sumo --version` prints 1.26.0 (already confirmed)
- [ ] `model/traffic.csv` exists
- [ ] Baseline results in `model/results/` cover 48 test hours
- [ ] Baseline summary is close to: 84,477 of 87,817 vehicles completed (96.2%), average wait 30.1 s, 95th percentile 72 s

### Step 3 – RL environment
`sumo_env.py` exposes `reset()` and `step(action)` with a 35-value state and 8 actions (phase x green duration).
**Check:** `python test_rl_definition.py` runs without errors and reports a 35-value state and 8 actions.

### Step 4 – DQN agent
`dqn_agent.py`: 35-128-128-8 network, replay buffer (50,000), target network synced every 500 steps, epsilon from 1.0 to 0.05 over the first 60% of episodes.
**Check:** the training output shows epsilon reaching 0.05 and staying there (your run shows this from the last episodes: eps 0.05).

### Step 5 – Reward and training
Reward = - queue cost - 0.5 x wait cost + 0.05 x vehicles through. `train.py` trained 300 episodes, each on a random real training hour.
**Check**
- [ ] `model/results/training_log.csv` exists with 300 rows
- [ ] Last rows show epsilon 0.05
- [ ] Light hours (for example 05:00) have small queues and positive reward, and heavy hours (for example 3,500+ vehicles) have negative reward. Your last episodes follow this pattern
- [ ] A trained model file is saved in `model/results/` (confirm the file name in `train.py`)
- [ ] Reward trend improves over episodes. Plot `training_log.csv`; it will be noisy because each episode uses a different hour, so compare averages over blocks of about 30 episodes

### Step 6.1 – Home page
Landing page in `frontend/public/index.html`: introduces the system, explains the Kaggle dataset, lists features, credits fedesoriano, and has Home / Login / Register navigation.
**Check**
- [ ] http://localhost:3000/ shows the home page
- [ ] Login button goes to `/login`, Register button goes to `/register` (not `#login`). If they do not, edit the `href` values in `index.html`
- [ ] Kaggle credit link opens the dataset page
- [ ] Page looks right on a phone-width window
- [ ] Page works in both light and dark browser themes

### Step 6.2 – Authentication
Express API with MongoDB: email/password registration with bcrypt hashing, login, "Continue with Google", JWT in an httpOnly cookie, redirect to the dashboard, and a welcome email for new users only.

Setup first
- [ ] MongoDB is running (local service or Atlas) and `MONGODB_URI` is set in `backend/.env`
- [ ] `JWT_SECRET` is a long random string
- [ ] Google client ID, secret and callback URL are set; the redirect URI in Google matches `GOOGLE_CALLBACK_URL` exactly
- [ ] SMTP values are set (Gmail App Password)
- [ ] Your Gmail accounts are listed as test users on the Google consent screen

Checks (do them in this order)

| # | Do this | Expect |
|---|---|---|
| 1 | Open `/api/health` | `server: ok`, `database: connected` |
| 2 | Register with name, email, password (new email) | Redirect to `/dashboard`, "Welcome, <name>" |
| 3 | Look in MongoDB (Compass) at the `users` collection | One document; `passwordHash` starts with `$2a$12$` or `$2b$12$`; no plain password; `welcomeEmailSent: true` |
| 4 | Check the inbox of that email | Exactly one welcome email |
| 5 | Log out, then log in with the same email and password | Dashboard opens, no second email |
| 6 | Log in with a wrong password | Red light and "Invalid email or password." |
| 7 | Register again with the same email | "This email is already registered. Log in instead." |
| 8 | Register with a weak password (short, or no number) | Clear validation message |
| 9 | Click Continue with Google using an email not yet in the database | Dashboard opens, user document has `googleId` and `avatar`, one welcome email arrives |
| 10 | Log out, click Continue with Google again | Dashboard opens, no new email, no duplicate document |
| 11 | Register by email first, then use Google with the same address | Signs in, `googleId` is added to the same document, no welcome email |
| 12 | Register by email with an address that already signed up through Google | Message to use Continue with Google |
| 13 | While logged out, open `/dashboard` | Redirects to `/login` |
| 14 | While logged in, open `/login` | Redirects to `/dashboard` |
| 15 | Cancel on the Google screen | Back on `/login` with an error message |

Security spot checks
- [ ] `.env` is not tracked by Git (`git status` does not list it)
- [ ] In browser dev tools, the `token` cookie is marked HttpOnly

### Step 6.3 - Traffic simulation page
Protected page `/simulation`: canvas intersection (2 lanes per approach), moving vehicles with turns and queues, fixed-time red/yellow/green signals (42 s green, 3 s yellow, plus 1 s all-red), Start / Pause / Reset, demand slider, speed selector and live statistics. It is a browser-side visual model, not SUMO or the DQN. Full detail: `docs/STEP_6.3_Simulation_Page.md`.
**Check:** see section 9 of that document (access, road network, signals, vehicles, controls, statistics, mobile layout).

### Step 6.4 - Real-time traffic monitoring
New monitoring section on `/simulation`: signal status with remaining green and time until green per approach, throughput (veh/h over the last 5 simulated minutes, completed trips, per-approach stop-line rate), waiting times, and a table of vehicles, density, queue count, queue length and waits for all 8 lanes, plus density/queue overlay on the road and two trend charts. Reads the Step 6.3 browser model, not SUMO or the DQN. Full detail: `docs/STEP_6.4_Real_Time_Monitoring.md`.
**Check:** section 10 of that document.

### Step 6.5 - AI model integration
The trained DQN (`model/serve.py`, port 5001) is connected through a login-protected Express route (`/api/ai/decide`) to the simulation page. The browser sends the 35-value state, receives phase and green time, and the signals obey it (yellow 3 s and all red 1 s on a switch, extension without yellow when the phase is kept). The "AI signal control" section shows the live decision, Q-values, a chart of green times, recent decisions and the state sent. Full detail: `docs/STEP_6.5_AI_Model_Integration.md`.
**Check:** section 11 of that document.

---

## 6. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Cannot find module './config/passport'` | Files not moved to `backend/`, or running `node` from the wrong folder |
| `MongoDB connection failed` | MongoDB not running, or wrong `MONGODB_URI` |
| Google `redirect_uri_mismatch` | Redirect URI in Google Cloud differs from `GOOGLE_CALLBACK_URL` (port, trailing slash, http vs https) |
| Google "Access blocked" | Your email is not in the consent screen's test users |
| `[mail] ... EAUTH` in the console | Using the normal Gmail password instead of an App Password, or 2-Step Verification is off |
| `[mail] SMTP not configured` | `SMTP_HOST` or `SMTP_USER` empty |
| Dashboard keeps returning to login | Cookie not set: open the site on `localhost:3000`, not a different host or port |
| Page styles missing | `css/` and `js/` not inside `frontend/public/` |

## 7. Coming next

- **Step 6.6 – Evaluation and real results on the dashboard:** connect the logged-in dashboard to the DQN results (fixed-time vs trained agent). It needs the trained model file and the evaluation from RL Step 6 (same 48 test hours, comparing average wait, 95th percentile, queue length and throughput).
- Add a short entry to this log for every finished step, with its own checklist.
