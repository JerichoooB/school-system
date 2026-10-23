import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LoaderCircle, Mail } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import AuthField from '../components/AuthField';
import AuthNotice from '../components/AuthNotice';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setNotice(null);
    try {
      const response = await fetch('/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const result = await response.json();
      setNotice({ type: response.ok && result.success ? 'success' : 'error', message: result.message || 'Unable to request a password reset. Please try again.' });
    } catch { setNotice({ type: 'error', message: 'Unable to connect to the server. Please try again.' }); }
    finally { setLoading(false); }
  }
  return <AuthLayout eyebrow="LET’S GET YOU BACK IN" title="Forgot your password?" description="It happens. Enter your email and we’ll help you reset it." footer={<Link to="/"><ArrowLeft size={14} /> Back to sign in</Link>}>
    <div className="auth-state-icon"><Mail size={27} strokeWidth={1.5} /></div>
    <AuthNotice notice={notice} />
    <form className="auth-form" onSubmit={submit}>
      <AuthField disabled={loading} label="Email address" name="email" type="email" icon={Mail} placeholder="name@example.com" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setNotice(null); }} required />
      <button className="auth-primary signin-button" type="submit" disabled={loading}>{loading ? <><LoaderCircle className="auth-spinner" size={18} /> Sending…</> : <>Send reset link <ArrowRight size={17} /></>}</button>
    </form>
    <p className="auth-helper">Signed up with Google? Use <Link to="/">Google sign-in</Link> instead.</p>
  </AuthLayout>;
}
