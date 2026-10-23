import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, KeyRound, LoaderCircle, LockKeyhole, Mail, UserRound } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import AuthField from '../components/AuthField';
import AuthNotice from '../components/AuthNotice';

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [verification, setVerification] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [notice, setNotice] = useState(null);
  const [existing, setExisting] = useState(false);
  function change(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
    setNotice(null);
    setExisting(false);
  }
  async function request(action, body) {
    const response = await fetch(`/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { response, result: await response.json() };
  }
  async function register(event) {
    event.preventDefault();
    if (busy) return;
    if (form.password !== form.confirmPassword) return setNotice({ type: 'error', message: 'Passwords do not match.' });
    if (form.password.length < 8) return setNotice({ type: 'error', message: 'Use at least 8 characters for your password.' });
    if (new TextEncoder().encode(form.password).length > 72) return setNotice({ type: 'error', message: 'This password is too long. Try a shorter one.' });
    setBusy(true); setNotice(null);
    try {
      const { response, result } = await request('register', { name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(), email: form.email, password: form.password });
      if (response.ok && result.success) {
        setVerification(true);
        setNotice({ type: 'success', message: 'Your verification code is on its way. Check your inbox and spam folder.' });
      } else {
        setExisting(response.status === 409);
        setNotice({ type: 'error', message: result.message || 'Unable to create your account. Please try again.' });
      }
    } catch { setNotice({ type: 'error', message: 'Unable to connect to the server. Please try again.' }); }
    finally { setBusy(false); }
  }
  async function verify(event) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) return setNotice({ type: 'error', message: 'Enter the six-digit code from your email.' });
    setBusy(true); setNotice(null);
    try {
      const { response, result } = await request('verify-email', { email: form.email, code });
      if (response.ok && result.success) navigate('/', { replace: true, state: { notice: 'Email verified. You can now sign in.' } });
      else setNotice({ type: 'error', message: result.message || 'Invalid verification code.' });
    } catch { setNotice({ type: 'error', message: 'Unable to connect to the server. Please try again.' }); }
    finally { setBusy(false); }
  }
  async function resend() {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const { response, result } = await request('resend-verification', { email: form.email });
      setNotice({ type: response.ok && result.success ? 'success' : 'error', message: result.message || 'Unable to request a new code.' });
    } catch { setNotice({ type: 'error', message: 'Unable to request a new code. Please try again.' }); }
    finally { setBusy(false); }
  }
  return <AuthLayout eyebrow={verification ? 'ONE LAST STEP' : 'A FRESH START'} title={verification ? 'Check your inbox' : 'Make yourself at home'} description={verification ? <>We sent a six-digit code to <strong className="auth-email">{form.email}</strong></> : 'Create your account and get ready for your school day.'} footer={<>Already have an account? <Link to="/">Sign in <ArrowRight size={14} /></Link></>}>
    {verification && <div className="auth-state-icon"><Mail size={27} strokeWidth={1.5} /></div>}
    <AuthNotice notice={notice} />
    {!verification ? <form className="auth-form" onSubmit={register}>
      <div className="auth-name-row">
        <AuthField disabled={busy} label="First name" name="firstName" type="text" icon={UserRound} placeholder="First name" autoComplete="given-name" maxLength={60} value={form.firstName} onChange={change} required />
        <AuthField disabled={busy} label="Last name" name="lastName" type="text" icon={UserRound} placeholder="Last name" autoComplete="family-name" maxLength={59} value={form.lastName} onChange={change} required />
      </div>
      <AuthField disabled={busy} label="Email address" name="email" type="email" icon={Mail} placeholder="name@example.com" autoComplete="email" value={form.email} onChange={change} required />
      <AuthField disabled={busy} label="Password" name="password" type={showPassword ? 'text' : 'password'} icon={LockKeyhole} placeholder="Create a password" autoComplete="new-password" value={form.password} onChange={change} showPassword={showPassword} onTogglePassword={() => setShowPassword(value => !value)} required />
      <AuthField disabled={busy} label="Confirm password" name="confirmPassword" type={showConfirm ? 'text' : 'password'} icon={LockKeyhole} placeholder="Confirm password" autoComplete="new-password" value={form.confirmPassword} onChange={change} showPassword={showConfirm} onTogglePassword={() => setShowConfirm(value => !value)} required />
      <p className="auth-hint"><KeyRound size={13} /> Use at least 8 characters for your password.</p>
      <button className="auth-primary" disabled={busy} type="submit">{busy ? <><LoaderCircle className="auth-spinner" size={18} /> Creating account…</> : <>Create account <ArrowRight size={17} /></>}</button>
      {existing && <button className="auth-text-button auth-centered" type="button" onClick={() => { setVerification(true); setNotice(null); }}>Already waiting for a code? Verify your email</button>}
    </form> : <form className="auth-form" onSubmit={verify}>
      <AuthField disabled={busy} label="Verification code" name="code" type="text" icon={KeyRound} placeholder="Enter 6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, '')); setNotice(null); }} className="auth-code-input" required />
      <p className="auth-hint">Your code expires after 10 minutes.</p>
      <button className="auth-primary" disabled={busy} type="submit">{busy ? <><LoaderCircle className="auth-spinner" size={18} /> Please wait…</> : <>Verify email <ArrowRight size={17} /></>}</button>
      <div className="auth-resend"><span>Didn’t receive it?</span><button className="auth-text-button" type="button" disabled={busy} onClick={resend}>Resend verification code</button></div>
      <button className="auth-text-button auth-back" type="button" disabled={busy} onClick={() => { setVerification(false); setCode(''); setNotice(null); }}><ArrowLeft size={14} /> Use a different email</button>
    </form>}
  </AuthLayout>;
}
