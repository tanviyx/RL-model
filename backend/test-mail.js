// Run from the backend folder:  node test-mail.js
// Checks the SMTP settings in .env and sends a test email to yourself.
require('dotenv').config();
const nodemailer = require('nodemailer');

for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'])
  console.log(k.padEnd(10), process.env[k] ? 'set' : 'MISSING');

const port = Number(process.env.SMTP_PORT) || 587;
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

t.verify()
  .then(() => {
    console.log('SMTP login OK');
    return t.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: 'SmartSignal test email',
      text: 'If you can read this, welcome emails will work.',
    });
  })
  .then(() => console.log('Test email sent to', process.env.SMTP_USER))
  .catch((e) => console.error('FAILED:', e.message));
