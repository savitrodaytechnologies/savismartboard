import { useState, useRef, useEffect } from 'react';
import { api } from '@/services/apiClient';

interface Props {
    name: string;
    schoolName: string;
    onLogout: () => void;
}

export default function ProfileDropdown({ name, schoolName, onLogout }: Props) {
    const [open, setOpen]           = useState(false);
    const [showPwModal, setShowPwModal] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handle(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    const initials = name
        .split(' ')
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase() ?? '')
        .join('');

    return (
        <>
            <div className="relative" ref={ref}>
                {/* Avatar button */}
                <button
                    onClick={() => setOpen(v => !v)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 transition-colors shadow-sm"
                >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-bold select-none">
                        {initials || '?'}
                    </span>
                    <span className="hidden sm:block text-sm font-semibold text-slate-800">{name}</span>
                    <svg className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                         fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {/* Dropdown menu */}
                {open && (
                    <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100">
                            <p className="text-sm font-semibold text-slate-800">{name}</p>
                        </div>
                        <button
                            onClick={() => { setOpen(false); setShowPwModal(true); }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24"
                                 stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round"
                                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Change Password
                        </button>
                        <div className="border-t border-slate-100" />
                        <button
                            onClick={() => { setOpen(false); onLogout(); }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"
                                 stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round"
                                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Sign out
                        </button>
                    </div>
                )}
            </div>

            {/* Change Password Modal */}
            {showPwModal && (
                <ChangePasswordModal onClose={() => setShowPwModal(false)} />
            )}
        </>
    );
}

// ── Change Password Modal ─────────────────────────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
    const [current,  setCurrent]  = useState('');
    const [next,     setNext]     = useState('');
    const [confirm,  setConfirm]  = useState('');
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [success,  setSuccess]  = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (next !== confirm) { setError('New passwords do not match.'); return; }
        if (next.length < 8)  { setError('New password must be at least 8 characters.'); return; }

        setLoading(true);
        try {
            await api.put('/profile/password', {
                currentPassword: current,
                newPassword:     next,
            });
            setSuccess(true);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })
                ?.response?.data?.error ?? 'Failed to change password. Please try again.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-base font-semibold text-slate-800">Change Password</h2>
                    <button onClick={onClose}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {success ? (
                    <div className="px-6 py-8 text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24"
                                 stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="font-semibold text-slate-800">Password updated!</p>
                        <p className="text-sm text-slate-500 mt-1">Your new password is active immediately.</p>
                        <button onClick={onClose}
                                className="mt-5 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
                            Done
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Current password</label>
                            <input
                                type="password"
                                value={current}
                                onChange={e => setCurrent(e.target.value)}
                                required
                                autoFocus
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">New password</label>
                            <input
                                type="password"
                                value={next}
                                onChange={e => setNext(e.target.value)}
                                required
                                minLength={8}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Confirm new password</label>
                            <input
                                type="password"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                required
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {error && (
                            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-100">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            {loading ? 'Updating…' : 'Update Password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
