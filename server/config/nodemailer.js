import nodemailer from 'nodemailer'
import dotenv from "dotenv";
dotenv.config();
console.log("SMTP USER:", process.env.SMTP_USER);
console.log("SMTP PASS:", process.env.SMTP_PASS);

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true only for 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export default transporter;
