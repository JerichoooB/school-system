export function requireMailConfig() {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    const error = new Error('Account email delivery is not configured.');
    error.status = 503;
    throw error;
  }
}

export async function sendAccountEmail(to, subject, text) {
  requireMailConfig();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const error = new Error('Unable to deliver account email. Please try again later.');
    error.status = 502;
    throw error;
  }
}
