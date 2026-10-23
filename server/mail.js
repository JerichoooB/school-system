import nodemailer from 'nodemailer';

function mailError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function requireMailConfig() {
  const provider = (process.env.MAIL_PROVIDER || 'resend').trim().toLowerCase();
  if (provider === 'gmail') {
    const user = (process.env.GMAIL_USER || '').trim();
    const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user) || pass.length !== 16) {
      throw mailError(503, 'Account email delivery is not configured. Please contact the school administrator.');
    }
    return { provider, user, pass };
  }
  if (provider !== 'resend' || !process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    throw mailError(503, 'Account email delivery is not configured.');
  }
  return { provider };
}

export async function sendAccountEmail(to, subject, text) {
  const config = requireMailConfig();
  try {
    if (config.provider === 'gmail') {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: config.user, pass: config.pass },
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      await transporter.sendMail({
        from: { name: 'School Hub', address: config.user },
        to, subject, text,
      });
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Email provider rejected the request');
  } catch {
    // Provider errors can contain credentials or delivery details; never expose them.
    throw mailError(502, 'Unable to deliver account email. Please try again later.');
  }
}
