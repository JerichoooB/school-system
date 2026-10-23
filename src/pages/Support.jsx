import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { ArrowUpRight } from 'lucide-react';
import '../styles/support.css';

export default function Support() {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setState('sending');
    setMessage('');
    try {
      const endpoint = import.meta.env.VITE_FORMSPREE_ENDPOINT || 'https://formspree.io/f/xgaawjzg';
      if (!/^https:\/\/formspree\.io\/f\/[a-zA-Z0-9]+$/.test(endpoint)) throw new Error('Invalid support configuration');
      const response = await fetch(endpoint, {
        method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Submission failed');
      setState('sent');
      setMessage('Your message has been sent. We’ll reply by email.');
      form.reset();
    } catch {
      setState('error');
      setMessage('Unable to send your message. Please try again.');
    }
  }
  return <AuthLayout eyebrow="HERE TO HELP" title="Help & support" description="Send a question to the School Hub team. We’ll reply to the email address you provide." footer={<Link to="/">Back to sign in <ArrowUpRight size={14} /></Link>}>
    <div className="support-page">
    <p className="support-note">Keep your account safe: never include passwords or verification codes.</p>
    <form onSubmit={submit}>
      <label>Your name<input name="name" required maxLength={120} autoComplete="name" /></label>
      <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
      <label>Message<textarea name="message" required maxLength={5000} rows={6} /></label>
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="support-honeypot" aria-hidden="true" />
      <button disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send message'} <ArrowUpRight size={16} aria-hidden="true" /></button>
      <p role={state === 'error' ? 'alert' : 'status'}>{message}</p>
    </form>
    <Link to="/dashboard">Back to dashboard</Link>
    </div>
  </AuthLayout>;
}
