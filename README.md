# SmartSignal

SmartSignal is a reinforcement-learning traffic signal control project. It compares an adaptive DQN controller with a fixed-time signal at a four-way intersection.

## MERN stack

- **MongoDB** stores accounts, experiments, traffic samples, and signal timings.
- **Express.js and Node.js** provide authentication and the REST API.
- **React and Vite** render the web application and create the production bundle.
- **Python, PyTorch, and SUMO** power the traffic-control model and evaluation.

React renders the existing landing, authentication, dashboard, comparison, and simulation screens. The current simulation and chart interactions are retained while the frontend is migrated.

## Run locally

Requirements: Node.js 20 or newer, MongoDB, and Python for the model service.

1. Copy `.env.example` to `backend/.env` and set the MongoDB URI, JWT secret, and any Google OAuth or mail settings you use.
2. Start the Express API from a terminal:

   ```powershell
   cd backend
   npm ci
   npm run dev
   ```

3. Start the React development server in a second terminal:

   ```powershell
   cd frontend
   npm ci
   npm run dev
   ```

4. Open `http://localhost:5173`. Vite proxies `/api` requests to Express on port 3000.
5. To use live DQN decisions and comparison runs, install `model/requirements-serve.txt` and run `python serve.py` from the `model` directory.

Google sign-in requires a Google OAuth web client. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` in `backend/.env`, and register the callback URL with the OAuth client.

## Production and Docker

Build the React application with `npm run build` in `frontend`. Express serves the resulting `frontend/dist` bundle and API from the same origin. Docker Compose builds the frontend as part of the backend image; copy `.env.example` to the repository-root `.env` before running `docker compose up --build`.

## Project architecture

<img width="780" height="387" alt="Project architecture" src="https://github.com/user-attachments/assets/05bd9263-eef1-4c1a-a094-913c5ed8bbb6" />

<img width="776" height="382" alt="Project architecture" src="https://github.com/user-attachments/assets/92be5304-bbd0-4044-ab06-98d6bcc9a216" />

<img width="786" height="387" alt="Project architecture" src="https://github.com/user-attachments/assets/6eba4970-00d9-4f5f-b966-b75606209b73" />

## Team

- Shivanshi
- Tanvi
- Himadri
