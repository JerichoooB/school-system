import { useEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useTheme } from '../context/useTheme';

export default function AuthGoogleButton({ loading, onSuccess, onError }) {
  const container = useRef(null);
  const [width, setWidth] = useState(300);
  const { darkMode } = useTheme();
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      setWidth(Math.min(400, Math.floor(entries[0].contentRect.width)));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className="google-login-wrapper" aria-busy={loading} inert={loading ? true : undefined}>
    <GoogleLogin locale="en" text="continue_with" theme={darkMode ? 'filled_black' : 'outline'} size="large" width={String(width)} onSuccess={onSuccess} onError={onError} />
  </div>;
}
