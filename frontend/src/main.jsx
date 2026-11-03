import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import parse from 'html-react-parser';
import landingPage from '../pages/landing.html?raw';
import dashboardPage from '../private/dashboard.html?raw';
import simulationPage from '../private/simulation.html?raw';
import comparePage from '../private/compare.html?raw';
import './auth.css';

const pages = {
  '/': { html: landingPage, title: 'Adaptive Traffic Signal Control' },
  '/login': { title: 'Log in · SmartSignal', public: true },
  '/register': { title: 'Register · SmartSignal', public: true },
  '/dashboard': { html: dashboardPage, title: 'Dashboard · SmartSignal', script: '/js/dashboard.js' },
  '/simulation': { html: simulationPage, title: 'Simulation · SmartSignal', script: '/js/simulation.js', stylesheet: '/css/simulation.css' },
  '/compare': { html: comparePage, title: 'Compare signals · SmartSignal', script: '/js/compare.js' },
};

function AuthPage({ register }) {
  const [message, setMessage] = useState(() => (
    new URLSearchParams(window.location.search).get('error') === 'google'
      ? 'Google sign-in failed. Try again or use your email.'
      : ''
  ));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setSubmitting(true);

    try {
      const form = event.currentTarget;
      const body = Object.fromEntries(new FormData(form));
      const response = await fetch(register ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to continue. Please try again.');
      window.location.assign(result.redirect || '/dashboard');
    } catch (error) {
      setMessage(error.message || 'Unable to reach the server. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="About SmartSignal">
        <a className="auth-brand" href="/">SmartSignal <span>TRAFFIC CONTROL, REIMAGINED</span></a>
        <div className="auth-story-content">
          <div className="traffic-light" aria-hidden="true">
            <i /><i /><i />
          </div>
          <p className="auth-eyebrow">ADAPTIVE SIGNAL CONTROL</p>
          <h1>Better flow starts with a smarter signal.</h1>
          <p className="auth-story-copy">Explore how a trained AI responds to changing traffic at a four-way intersection.</p>
          <div className="auth-feature"><span>01</span> Watch traffic respond in real time</div>
          <div className="auth-feature"><span>02</span> Compare AI with fixed-time signals</div>
        </div>
        <p className="auth-story-footer">Powered by reinforcement learning</p>
      </section>

      <section className="auth-main">
        <div className="auth-card">
          <p className="auth-eyebrow">{register ? 'GET STARTED' : 'WELCOME BACK'}</p>
          <h2>{register ? 'Create your account' : 'Sign in to SmartSignal'}</h2>
          <p className="auth-intro">{register ? 'Save your experiments and track your results.' : 'Your traffic experiments are waiting for you.'}</p>

          <a className="auth-google" href="/api/auth/google">
            <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
              <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google
          </a>

          <div className="auth-divider"><span>or continue with email</span></div>
          <form className="auth-form" onSubmit={handleSubmit}>
            {register && (
              <label>
                Name
                <input name="name" type="text" autoComplete="name" minLength="2" maxLength="60" placeholder="Your name" required />
              </label>
            )}
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={register ? 8 : undefined}
                maxLength={register ? 72 : undefined}
                placeholder={register ? 'At least 8 characters' : 'Enter your password'}
                required
              />
            </label>
            {register && <p className="auth-hint">Use at least 8 characters, including a letter and a number.</p>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
              {!submitting && <span aria-hidden="true">→</span>}
            </button>
            <p className="auth-message" role="alert" aria-live="polite">{message}</p>
          </form>

          <p className="auth-switch">
            {register ? 'Already have an account?' : 'New to SmartSignal?'}{' '}
            <a href={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</a>
          </p>
          <a className="auth-home" href="/">← Back to home</a>
        </div>
      </section>
    </main>
  );
}

function getBody(html) {
  const styles = html.match(/<style[\s\S]*?<\/style>/gi)?.join('') ?? '';
  const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  return styles + body;
}

function App() {
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const page = pages[path];

  useEffect(() => {
    if (!page || path === '/') {
      setReady(true);
      return undefined;
    }

    let active = true;
    fetch('/api/auth/me')
      .then((response) => {
        if (response.ok) {
          if (page.public) window.location.replace('/dashboard');
          else if (active) setReady(true);
          return;
        }
        if (response.status === 401) {
          if (page.public) {
            if (active) setReady(true);
          } else {
            window.location.replace('/login');
          }
          return;
        }
        throw new Error(`Authentication check failed (${response.status}).`);
      })
      .catch((error) => {
        if (active) {
          console.error(error);
          setAuthError(error.message);
        }
      });

    return () => {
      active = false;
    };
  }, [page, path]);

  useEffect(() => {
    if (!page) return undefined;
    document.title = page.title;

    let stylesheet;
    if (page.stylesheet) {
      stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = page.stylesheet;
      document.head.appendChild(stylesheet);
    }

    let script;
    if (ready && page.script) {
      script = document.createElement('script');
      script.src = page.script;
      script.async = false;
      document.body.appendChild(script);
    }

    return () => {
      stylesheet?.remove();
      script?.remove();
    };
  }, [page, ready]);

  if (!page) {
    return (
      <main className="not-found">
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <a href="/">Return to SmartSignal</a>
      </main>
    );
  }

  if (authError) {
    return <p role="alert">Could not verify your session: {authError}</p>;
  }

  if (!ready && path !== '/') return <p role="status">Checking your session…</p>;

  if (path === '/login' || path === '/register') {
    return <AuthPage register={path === '/register'} />;
  }

  return <>{parse(getBody(page.html))}</>;
}

createRoot(document.getElementById('root')).render(<App />);
