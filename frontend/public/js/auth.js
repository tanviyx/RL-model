const form = document.querySelector('form');
const msg = document.getElementById('msg');
const btn = form.querySelector('button.submit');

function lamp(color) {
  document.querySelectorAll('.lamp').forEach((l) => l.classList.toggle('on', l.dataset.c === color));
}
lamp('green');

if (new URLSearchParams(location.search).get('error') === 'google') {
  msg.textContent = 'Google sign-in failed. Try again or use your email.';
  lamp('red');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  lamp('amber');
  btn.disabled = true;
  try {
    const res = await fetch(form.dataset.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Something went wrong.');
    lamp('green');
    location.href = data.redirect || '/dashboard';
  } catch (err) {
    lamp('red');
    msg.textContent = err.message;
    btn.disabled = false;
  }
});
