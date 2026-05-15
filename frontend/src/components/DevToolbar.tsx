import { useState } from 'react';
import { fetchDevToken, clearDevToken, hasToken } from '@/services/devAuth';

/**
 * Floating dev toolbar — only rendered when import.meta.env.DEV is true.
 * Lets Parivesh get a dev JWT without Savischools running.
 * Invisible in production builds (tree-shaken away).
 */
export default function DevToolbar() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');
  const loggedIn = hasToken();

  async function handleLogin() {
    setStatus('loading');
    try {
      await fetchDevToken();
      setStatus('ok');
      setMsg('Dev token set — refreshing…');
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setStatus('err');
      setMsg('Failed — is the API running on port 7001?');
    }
  }

  function handleLogout() {
    clearDevToken();
    window.location.reload();
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold shadow-lg ring-2 ring-amber-600">
      <span className="text-amber-900">⚠ DEV</span>
      {loggedIn ? (
        <button
          onClick={handleLogout}
          className="rounded bg-amber-700 px-2 py-0.5 text-white hover:bg-amber-800"
        >
          Logout
        </button>
      ) : (
        <button
          onClick={handleLogin}
          disabled={status === 'loading'}
          className="rounded bg-amber-700 px-2 py-0.5 text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {status === 'loading' ? 'Getting token…' : 'Dev Login'}
        </button>
      )}
      {msg && <span className="text-amber-900">{msg}</span>}
    </div>
  );
}
