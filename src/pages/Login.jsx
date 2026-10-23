import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import AuthField from '../components/AuthField';
import AuthNotice from '../components/AuthNotice';
import AuthGoogleButton from '../components/AuthGoogleButton';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(location.state?.notice ? { type: 'success', message: location.state.notice } : null);
  const [form, setForm] = useState({ email: '', password: '' });
  function change(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
    setNotice(null);
  }
  async function signIn(action, body) {
    if (loading) return;
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setNotice({ type: 'error', message: result.message || 'Unable to sign in. Please try again.' });
        return;
      }
      localStorage.setItem('user', JSON.stringify(result.user));
      localStorage.setItem('isAuthenticated', 'true');
      navigate('/dashboard', { replace: true });
    } catch {
      setNotice({ type: 'error', message: 'Unable to connect to the server. Please try again.' });
    } finally { setLoading(false); }
  }
  return <AuthLayout eyebrow="YOUR SCHOOL DAY STARTS HERE" title="Welcome back" description="Sign in to your School Hub account." footer={<>New to School Hub? <Link to="/signup">Create an account <ArrowRight size={14} /></Link></>}>
    <AuthNotice notice={notice} />
    <form className="auth-form" onSubmit={event => { event.preventDefault(); signIn('login', form); }}>
      <AuthField disabled={loading} label="Email address" name="email" type="email" icon={Mail} placeholder="name@example.com" autoComplete="username" value={form.email} onChange={change} required />
      <AuthField disabled={loading} label="Password" name="password" type={showPassword ? 'text' : 'password'} icon={LockKeyhole} placeholder="Enter your password" autoComplete="current-password" value={form.password} onChange={change} showPassword={showPassword} onTogglePassword={() => setShowPassword(value => !value)} required />
      <div className="auth-form-options"><span className="auth-session-note"><LockKeyhole size={12} /> Your space, securely.</span><Link to="/forgot-password">Forgot your password?</Link></div>
      <button className="auth-primary signin-button" type="submit" disabled={loading} aria-busy={loading}>{loading ? <><LoaderCircle className="auth-spinner" size={18} /> Signing in…</> : <>Sign in <ArrowRight size={17} /></>}</button>
    </form>
    {import.meta.env.VITE_GOOGLE_CLIENT_ID && <>
      <div className="auth-divider"><span />Or continue with<span /></div>
      <AuthGoogleButton loading={loading} onSuccess={response => signIn('google-login', { credential: response.credential })} onError={() => setNotice({ type: 'error', message: 'Google sign-in failed. Please try again.' })} />
    </>}
  </AuthLayout>;
}
