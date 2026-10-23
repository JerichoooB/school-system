import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, KeyRound, LoaderCircle, LockKeyhole } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import AuthField from '../components/AuthField';
import AuthNotice from '../components/AuthNotice';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const validToken = /^[a-f0-9]{64}$/.test(token || '');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    if (password.length < 8) return setNotice({ type: 'error', message: 'Use at least 8 characters for your password.' });
    if (new TextEncoder().encode(password).length > 72) return setNotice({ type: 'error', message: 'This password is too long. Try a shorter one.' });
    if (password !== confirmPassword) return setNotice({ type: 'error', message: 'Passwords do not match.' });
    setLoading(true); setNotice(null);
    try {
      const response = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const result = await response.json();
      if (response.ok && result.success) navigate('/', { replace: true, state: { notice: 'Password updated. Sign in with your new password.' } });
      else setNotice({ type: 'error', message: result.message || 'Unable to reset your password. Please request a new link.' });
    } catch { setNotice({ type: 'error', message: 'Unable to connect to the server. Please try again.' }); }
    finally { setLoading(false); }
  }
  return <AuthLayout eyebrow="A LITTLE RESET" title={validToken ? 'Choose a new password' : 'Let’s try a fresh link'} description={validToken ? 'Make it something secure that you haven’t used before.' : 'This reset link is missing or invalid. Request a new one to get back to your account.'} footer={<Link to="/"><ArrowLeft size={14} /> Back to sign in</Link>}>
    <div className="auth-state-icon"><KeyRound size={27} strokeWidth={1.5} /></div>
    {validToken ? <>
      <AuthNotice notice={notice} />
      <form className="auth-form" onSubmit={submit}>
        <AuthField disabled={loading} label="New password" name="password" type={showPassword ? 'text' : 'password'} icon={LockKeyhole} placeholder="New password" autoComplete="new-password" value={password} onChange={event => { setPassword(event.target.value); setNotice(null); }} showPassword={showPassword} onTogglePassword={() => setShowPassword(value => !value)} required />
        <AuthField disabled={loading} label="Confirm new password" name="confirmPassword" type={showConfirm ? 'text' : 'password'} icon={LockKeyhole} placeholder="Confirm new password" autoComplete="new-password" value={confirmPassword} onChange={event => { setConfirmPassword(event.target.value); setNotice(null); }} showPassword={showConfirm} onTogglePassword={() => setShowConfirm(value => !value)} required />
        <p className="auth-hint"><KeyRound size={13} /> Use at least 8 characters for your password.</p>
        <button className="auth-primary signin-button" disabled={loading} type="submit">{loading ? <><LoaderCircle className="auth-spinner" size={18} /> Updating…</> : <>Update password <ArrowRight size={17} /></>}</button>
      </form>
      {notice?.type === 'error' && <Link className="auth-text-button auth-back" to="/forgot-password">Request a new reset link <ArrowRight size={14} /></Link>}
    </> : <Link className="auth-primary" to="/forgot-password">Request a new reset link <ArrowRight size={17} /></Link>}
  </AuthLayout>;
}
