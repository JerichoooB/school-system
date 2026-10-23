import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/session', { signal: controller.signal })
      .then(async response => {
        if (response.status === 401) {
          localStorage.removeItem('user');
          localStorage.removeItem('isAuthenticated');
          setStatus('anonymous');
          return;
        }
        if (!response.ok) throw new Error('Session check failed');
        const result = await response.json();
        localStorage.setItem('user', JSON.stringify(result.user));
        setStatus('authenticated');
      })
      .catch(error => { if (error.name !== 'AbortError') setStatus('error'); });
    return () => controller.abort();
  }, []);
  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'error') return <p role="alert">Unable to check your session. Please refresh to retry.</p>;
  return status === 'authenticated' ? children : <Navigate to="/" replace />;
}
