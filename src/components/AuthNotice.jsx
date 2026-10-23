import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export default function AuthNotice({ notice }) {
  if (!notice?.message) return null;
  const Icon = notice.type === 'error' ? AlertCircle : notice.type === 'success' ? CheckCircle2 : Info;
  return <div className={`auth-notice auth-notice-${notice.type || 'info'}`} role={notice.type === 'error' ? 'alert' : 'status'}>
    <Icon size={18} aria-hidden="true" /><span>{notice.message}</span>
  </div>;
}
