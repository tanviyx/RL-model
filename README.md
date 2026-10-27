# Capstone_project

# RL-Based Smart Traffic Signal Control

## Problem Statement
Problem: Fixed-timer signals. Objectives: Adaptive control. Approach: Q-learning. Outcome: Reduced wait times. Tools: RL.

## Objectives
- Objective 1
- Objective 2
- Objective 3


i just wanna test








## Tech Stack
- Frontend:
- Backend:
- Database:
- Tools:

## Folder Structure


















```bash
Capstone_project/
│
├── README.md
├── .gitignore
├── requirements.txt
├── CONTRIBUTING.md
│
├── docs/                  # Reports, PPT, diagrams
│   ├── proposal/
│   ├── review/
│   └── final-report/
│
├── src/                   # Main source code
│   ├── backend/
│   ├── frontend/
│   └── ml-model/
│
├── data/                  # Datasets
│   ├── raw/
│   └── processed/
│
├── tests/                 # Test cases
│
├── scripts/               # Helper scripts
│
└── docker/                # Docker-related files (later)

```
## Project Architecture
<img width="780" height="387" alt="image" src="https://github.com/user-attachments/assets/05bd9263-eef1-4c1a-a094-913c5ed8bbb6" />

<img width="776" height="382" alt="image" src="https://github.com/user-attachments/assets/92be5304-bbd0-4044-ab06-98d6bcc9a216" />

<img width="786" height="387" alt="image" src="https://github.com/user-attachments/assets/6eba4970-00d9-4f5f-b966-b75606209b73" />


## Installation & Setup
Steps to run locally.

## Google Sign-In
Authentication uses Google Identity Services. Create an OAuth 2.0 Client ID in Google Cloud Console and add `https://localhost:5173` as an authorized JavaScript origin.

For Docker Compose, add the same client ID to the root `.env` file:

```env
GOOGLE_CLIENT_ID=your-google-oauth-client-id
JWT_SECRET=your-session-signing-secret
```

The client ID is passed to both the frontend and backend. For local development outside Docker, set `VITE_GOOGLE_CLIENT_ID` for the Vite client and `GOOGLE_CLIENT_ID` for the server to that same value. The server also needs `MONGO_URI` and `JWT_SECRET`.

## Team Members
- Shivanshi 
- Tanvi
- Himadri

## Timeline
Phase-wise breakdown.

## License
(Optional)
