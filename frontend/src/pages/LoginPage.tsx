// Owner: Parivesh
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/apiClient';
import { GoogleLogin } from '@react-oauth/google';
import type { AxiosError } from 'axios';

interface LoginResponse {
    token: string;
    expiresIn: number;
    name: string;
    schoolName: string;
    curriculum: string;
}

export function saveSession(data: LoginResponse) {
    localStorage.setItem('savischools_jwt', data.token);
    localStorage.setItem('sb_user_name', data.name);
    localStorage.setItem('sb_school_name', data.schoolName);
    localStorage.setItem('sb_curriculum', data.curriculum);
}

export function clearSession() {
    ['savischools_jwt', 'sb_user_name', 'sb_school_name', 'sb_curriculum'].forEach(k =>
        localStorage.removeItem(k));
}

export function isLoggedIn(): boolean {
    return !!localStorage.getItem('savischools_jwt');
}

export function getUser() {
    return {
        name:       localStorage.getItem('sb_user_name')   ?? '',
        schoolName: localStorage.getItem('sb_school_name') ?? '',
        curriculum: localStorage.getItem('sb_curriculum')  ?? '',
    };
}

const inputCls =
    'w-full rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-white placeholder-slate-500 ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors';
const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

export default function LoginPage() {
    const navigate = useNavigate();

    const [schoolId, setSchoolId] = useState('');
    const [userId,   setUserId]   = useState('');
    const [password, setPassword] = useState('');
    const [error,    setError]    = useState('');
    const [loading,  setLoading]  = useState(false);

    async function handleGoogleSuccess(credential: string) {
        setError('');
        setLoading(true);
        try {
            const res = await api.post<LoginResponse>('/auth/google', { idToken: credential });
            saveSession(res.data);
            navigate('/dashboard', { replace: true });
        } catch (err) {
            const ae = err as AxiosError<{ error?: string }>;
            setError(ae.response?.data?.error ?? 'Google sign-in failed.');
        } finally {
            setLoading(false);
        }
    }

    async function handleLogin(e: FormEvent) {
        e.preventDefault();
        setError('');
        const sid = parseInt(schoolId, 10);
        if (isNaN(sid) || sid <= 0) { setError('School ID must be a number.'); return; }
        if (!userId.trim())          { setError('User ID is required.');        return; }
        if (!password)               { setError('Password is required.');       return; }

        setLoading(true);
        try {
            const res = await api.post<LoginResponse>('/auth/login', {
                schoolId: sid,
                userId:   userId.trim(),
                password,
            });
            saveSession(res.data);
            navigate('/dashboard', { replace: true });
        } catch (err) {
            const ae = err as AxiosError<{ error?: string }>;
            setError(ae.response?.data?.error ?? 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">

            {/* Header */}
            <header className="flex items-center gap-3 px-8 py-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 text-white font-bold text-lg select-none">
                    A
                </div>
                <span className="text-white font-semibold text-lg tracking-wide">AiGurukul Smartboard</span>
            </header>

            <main className="flex flex-1 flex-col lg:flex-row items-center justify-center gap-16 px-6 py-12">

                {/* Left tagline */}
                <div className="max-w-md text-center lg:text-left">
                    <h1 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight">
                        Your classroom,<br />
                        <span className="text-blue-400">supercharged.</span>
                    </h1>
                    <p className="mt-5 text-slate-400 text-lg leading-relaxed">
                        Teach with AI content cards, annotate live on the whiteboard,
                        quiz students, and share session notes — all in one place.
                    </p>
                    <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
                        {[
                            ['📚', 'AI content cards'],
                            ['✏️', 'Live annotation'],
                            ['❓', 'Question bank'],
                            ['🤖', 'AI assistant'],
                        ].map(([icon, label]) => (
                            <div key={label} className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-slate-300">
                                <span>{icon}</span><span>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Login card */}
                <div className="w-full max-w-sm">
                    <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-8 shadow-2xl">
                        <h2 className="text-white font-bold text-2xl mb-1">Sign in</h2>
                        <p className="text-slate-400 text-sm mb-7">Enter your credentials to continue.</p>

                        <form onSubmit={handleLogin} className="flex flex-col gap-4" noValidate>
                            <div>
                                <label className={labelCls}>School ID</label>
                                <input
                                    type="number" inputMode="numeric" placeholder="e.g. 1203"
                                    value={schoolId} onChange={e => setSchoolId(e.target.value)}
                                    className={inputCls} required
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Email / User ID</label>
                                <input
                                    type="text" autoComplete="username" placeholder="your@email.com"
                                    value={userId} onChange={e => setUserId(e.target.value)}
                                    className={inputCls} required
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Password</label>
                                <input
                                    type="password" autoComplete="current-password" placeholder="••••••••"
                                    value={password} onChange={e => setPassword(e.target.value)}
                                    className={inputCls} required
                                />
                            </div>

                            {error && (
                                <p className="text-rose-400 text-sm rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2">
                                    {error}
                                </p>
                            )}

                            <button type="submit" disabled={loading}
                                className="mt-1 w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 text-white font-semibold transition-colors">
                                {loading ? 'Signing in…' : 'Sign in'}
                            </button>
                        </form>

                        {/* Google sign-in */}
                        <div className="mt-5 flex items-center gap-3">
                            <span className="flex-1 h-px bg-white/10" />
                            <span className="text-xs text-slate-500 uppercase tracking-wide">or</span>
                            <span className="flex-1 h-px bg-white/10" />
                        </div>
                        <div className="mt-4 flex justify-center">
                            <GoogleLogin
                                onSuccess={res => {
                                    if (res.credential) handleGoogleSuccess(res.credential);
                                }}
                                onError={() => setError('Google sign-in failed.')}
                                useOneTap={false}
                                shape="rectangular"
                                size="large"
                                text="signin_with"
                                logo_alignment="left"
                            />
                        </div>

                        <p className="mt-5 text-center text-sm text-slate-400">
                            New to AiGurukul?{' '}
                            <button
                                onClick={() => navigate('/register')}
                                className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                            >
                                Create an account
                            </button>
                        </p>
                    </div>

                    <p className="mt-4 text-center text-xs text-slate-600">
                        AiGurukul Smartboard · Savitroday Technologies
                    </p>
                </div>
            </main>
        </div>
    );
}

