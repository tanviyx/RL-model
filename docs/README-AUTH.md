# SmartSignal – Step 6.2 Authentication

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill it in (MongoDB URI, JWT_SECRET, Google keys, SMTP).
3. Put your home page at `public/index.html` (change its Login/Register links to `/login` and `/register`).
4. `npm run dev` then open http://localhost:3000

## Google keys
Google Cloud Console > APIs & Services > Credentials > Create OAuth client ID (Web application).
Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`.
Configure the OAuth consent screen and add your test users.

## Welcome email (Gmail)
Turn on 2-step verification, create an App Password, and use it as SMTP_PASS.
Without SMTP settings the app still works; it just logs that the email was skipped.

## Who gets the welcome email
| Action | Result |
|---|---|
| Register with email (new) | account created, welcome email sent |
| Register with email, email already exists | rejected (409), no email |
| Google, email not in database | account created, welcome email sent |
| Google, email already registered | signed in and Google linked, no email |
| Login with email + password | no email |

Each user also has a `welcomeEmailSent` flag, so the email can never go out twice.
