import { Eye, EyeOff } from 'lucide-react';

export default function AuthField({ label, name, icon: Icon, showPassword, onTogglePassword, ...props }) {
  const id = `auth-${name}`;
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className={`auth-input-wrap${onTogglePassword ? ' auth-input-password' : ''}`}>
      {Icon && <Icon className="auth-input-icon" size={18} strokeWidth={1.7} aria-hidden="true" />}
      <input id={id} name={name} {...props} />
      {onTogglePassword && <button className="auth-password-toggle" type="button" onClick={onTogglePassword} aria-pressed={showPassword} aria-label={showPassword ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>}
    </div>
  </div>;
}
