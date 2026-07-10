// Owner: Parivesh
import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/apiClient';
import { saveSession } from '@/pages/LoginPage';
import { GoogleLogin } from '@react-oauth/google';
import type { AxiosError } from 'axios';

interface LoginResponse {
    token: string; expiresIn: number;
    name: string; schoolName: string; curriculum: string;
}
interface RegResponse {
    schoolId: number; staffId: string; userId: string;
    logonId: string; message: string;
}

type Stage = 'entry' | 'email' | 'otp' | 'role' | 'details' | 'password' | 'success';
type Role  = 'teacher' | 'school' | 'other';

const TOTAL_STEPS = 5;
const STAGE_STEP: Partial<Record<Stage, number>> = { email: 1, otp: 2, role: 3, details: 4, password: 5 };

// ── shared styles ─────────────────────────────────────────────────────────────
const inp =
    'w-full rounded-xl bg-slate-900/60 border border-slate-600/50 px-4 py-3 text-white ' +
    'placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
    'focus:border-blue-500/50 transition-all text-sm';
const lbl = 'block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-widest';
const btnPrimary =
    'rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed px-7 py-2.5 text-white font-semibold ' +
    'text-sm shadow-lg shadow-blue-500/25 transition-all';
const btnGhost =
    'rounded-xl border border-slate-600/60 hover:bg-slate-700/50 px-7 py-2.5 ' +
    'text-slate-400 hover:text-slate-200 font-semibold text-sm transition-all';

// ── password strength ─────────────────────────────────────────────────────────
function pwdStrength(p: string) {
    if (!p) return { label: '', color: 'bg-slate-700', pct: 0 };
    let s = 0;
    if (p.length >= 8)           s++;
    if (/[A-Z]/.test(p))         s++;
    if (/[0-9]/.test(p))         s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    if (s <= 1) return { label: 'Weak',   color: 'bg-rose-500',    pct: 25 };
    if (s === 2) return { label: 'Fair',  color: 'bg-amber-500',   pct: 50 };
    if (s === 3) return { label: 'Good',  color: 'bg-blue-500',    pct: 75 };
    return              { label: 'Strong', color: 'bg-emerald-500', pct: 100 };
}

// ── step dots ─────────────────────────────────────────────────────────────────
function StepDots({ current }: { current: number }) {
    return (
        <div className="flex items-center gap-1.5 mb-8">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => {
                const n = i + 1;
                const done    = n < current;
                const active  = n === current;
                return (
                    <div key={n} className="flex items-center gap-1.5">
                        <div className={`flex items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ${
                            done   ? 'w-6 h-6 bg-blue-500 text-white' :
                            active ? 'w-7 h-7 bg-blue-600 ring-4 ring-blue-500/30 text-white shadow-lg shadow-blue-500/40' :
                                     'w-6 h-6 bg-slate-700 text-slate-500'
                        }`}>
                            {done ? '✓' : n}
                        </div>
                        {i < TOTAL_STEPS - 1 && (
                            <div className={`h-px w-6 transition-all duration-500 ${n < current ? 'bg-blue-500' : 'bg-slate-700'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function RegisterPage() {
    const navigate = useNavigate();

    const [stage,   setStage]   = useState<Stage>('entry');
    const [error,   setError]   = useState('');
    const [loading, setLoading] = useState(false);

    const [email,      setEmail]      = useState('');
    const [otp,        setOtp]        = useState<string[]>(Array(6).fill(''));
    const otpRefs                     = useRef<(HTMLInputElement | null)[]>([]);
    const [resendSecs, setResend]     = useState(0);
    const [role,       setRole]       = useState<Role | null>(null);
    const [fullName,   setFullName]   = useState('');
    const [schoolName, setSchoolName] = useState('');
    const [phone,      setPhone]      = useState('');
    const [country,    setCountry]    = useState('IN');
    const [stateVal,   setStateVal]   = useState('');
    const [password,   setPassword]   = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [regResult,  setRegResult]  = useState<RegResponse | null>(null);

    useEffect(() => {
        if (resendSecs <= 0) return;
        const t = setTimeout(() => setResend(s => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendSecs]);

    const step = STAGE_STEP[stage];

    // ── OTP ──────────────────────────────────────────────────────────────────
    function handleOtpChange(i: number, val: string) {
        const d = val.replace(/\D/g, '').slice(-1);
        const next = [...otp]; next[i] = d; setOtp(next);
        if (d && i < 5) otpRefs.current[i + 1]?.focus();
    }
    function handleOtpKey(i: number, e: React.KeyboardEvent) {
        if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    }
    function handleOtpPaste(e: React.ClipboardEvent) {
        e.preventDefault();
        const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const next = Array(6).fill('');
        digits.split('').forEach((d, i) => { next[i] = d; });
        setOtp(next);
        otpRefs.current[Math.min(digits.length, 5)]?.focus();
    }

    // ── Actions ──────────────────────────────────────────────────────────────
    const clearErr = () => setError('');

    async function handleGoogleRegister(credential: string) {
        clearErr();
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

    function goBack() {
        clearErr();
        const prev: Record<Stage, Stage> = {
            entry: 'entry', email: 'entry', otp: 'email',
            role: 'otp', details: 'role', password: 'details', success: 'success',
        };
        setStage(prev[stage]);
    }

    async function handleSendOtp(e: FormEvent) {
        e.preventDefault(); clearErr();
        if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email address.'); return; }
        setLoading(true);
        try {
            await api.post('/auth/send-otp', { email: email.trim() });
            setOtp(Array(6).fill('')); setResend(30); setStage('otp');
            setTimeout(() => otpRefs.current[0]?.focus(), 100);
        } catch (err) {
            const ae = err as AxiosError<{ error?: string }>;
            setError(ae.response?.data?.error ?? 'Failed to send OTP. Try again.');
        } finally { setLoading(false); }
    }

    async function handleVerifyOtp() {
        clearErr();
        const code = otp.join('');
        if (code.length < 6) { setError('Enter the complete 6-digit code.'); return; }
        setLoading(true);
        try {
            await api.post('/auth/verify-otp', { email, code });
            setStage('role');
        } catch (err) {
            const ae = err as AxiosError<{ error?: string }>;
            setError(ae.response?.data?.error ?? 'Invalid code. Please try again.');
        } finally { setLoading(false); }
    }

    async function handleResend() {
        if (resendSecs > 0) return; clearErr(); setLoading(true);
        try {
            await api.post('/auth/send-otp', { email });
            setOtp(Array(6).fill('')); setResend(30);
            setTimeout(() => otpRefs.current[0]?.focus(), 100);
        } catch { setError('Failed to resend. Please try again.'); }
        finally  { setLoading(false); }
    }

    function handleRoleNext() {
        clearErr();
        if (!role) { setError('Please select a role to continue.'); return; }
        setStage('details');
    }

    function handleDetailsNext() {
        clearErr();
        if (role === 'school' && !schoolName.trim()) { setError('School name is required.'); return; }
        if (!fullName.trim()) { setError(role === 'school' ? 'Contact person name is required.' : 'Full name is required.'); return; }
        setStage('password');
    }

    async function handleRegister() {
        clearErr();
        if (!password)           { setError('Password is required.'); return; }
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        if (password !== confirmPwd) { setError('Passwords do not match.'); return; }
        setLoading(true);
        try {
            const { data } = await api.post<RegResponse>('/auth/register', {
                contactPerson: fullName.trim(),
                email:         email.trim(),
                password,
                phone:         phone.trim(),
                country:       country.trim() || 'IN',
                state:         stateVal.trim(),
            });
            setRegResult(data);
            setStage('success');
        } catch (err) {
            const ae = err as AxiosError<{ error?: string }>;
            setError(ae.response?.data?.error ?? `Registration failed (${ae.response?.status ?? 0}). Try again.`);
        } finally { setLoading(false); }
    }

    async function handleGoToDashboard() {
        setLoading(true);
        try {
            const res = await api.post<LoginResponse>('/auth/login', {
                schoolId: regResult!.schoolId,
                userId:   email.trim(),
                password,
            });
            saveSession(res.data);
            navigate('/dashboard', { replace: true });
        } catch {
            navigate('/login');
        } finally {
            setLoading(false);
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────────
    const strength = pwdStrength(password);

    const Err = () => error ? (
        <div className="flex items-start gap-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3">
            <span className="text-rose-400 mt-0.5 shrink-0">⚠</span>
            <p className="text-rose-300 text-sm">{error}</p>
        </div>
    ) : null;

    const NavRow = ({ onNext, label = 'Continue', disabled = false }: { onNext: () => void; label?: string; disabled?: boolean }) => (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-700/50">
            <button onClick={goBack} className={btnGhost}>← Back</button>
            <button onClick={onNext} disabled={disabled || loading} className={btnPrimary}>
                {loading ? <span className="flex items-center gap-2"><Spinner />Please wait…</span> : label + ' →'}
            </button>
        </div>
    );

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1e3a5f_0%,_#0f172a_60%)] flex flex-col">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <header className="flex items-center gap-3 px-8 py-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white font-bold text-lg shadow-lg shadow-blue-500/30 select-none">
                    A
                </div>
                <span className="text-white font-semibold text-lg tracking-wide">AiGurukul Smartboard</span>
                <div className="ml-auto">
                    <button onClick={() => navigate('/login')} className="text-sm text-slate-400 hover:text-white transition-colors">
                        Sign in →
                    </button>
                </div>
            </header>

            <main className="flex flex-1 items-center justify-center px-4 py-8">
                <div className="w-full max-w-xl">

                    {/* ── ENTRY ───────────────────────────────────────────── */}
                    {stage === 'entry' && (
                        <div className="rounded-2xl bg-slate-800/80 backdrop-blur-2xl border border-slate-700/60 shadow-2xl overflow-hidden">
                            {/* Gradient accent top */}
                            <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-blue-400 to-cyan-400" />
                            <div className="px-8 py-10">
                                <div className="flex justify-center mb-6">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white text-3xl font-bold shadow-xl shadow-blue-500/30">
                                        A
                                    </div>
                                </div>
                                <h1 className="text-center text-white font-extrabold text-3xl mb-2 tracking-tight">
                                    Join AiGurukul
                                </h1>
                                <p className="text-center text-slate-400 text-sm mb-8">
                                    Create your free account and start teaching smarter.
                                </p>

                                {/* Google */}
                                <div className="flex justify-center">
                                    <GoogleLogin
                                        onSuccess={res => {
                                            if (res.credential) handleGoogleRegister(res.credential);
                                        }}
                                        onError={() => setError('Google sign-in failed.')}
                                        useOneTap={false}
                                        shape="rectangular"
                                        size="large"
                                        text="continue_with"
                                        logo_alignment="left"
                                    />
                                </div>
                                {error && (
                                    <div className="flex items-start gap-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 mt-3">
                                        <span className="text-rose-400 mt-0.5 shrink-0">⚠</span>
                                        <p className="text-rose-300 text-sm">{error}</p>
                                    </div>
                                )}

                                <div className="flex items-center gap-4 my-5">
                                    <div className="flex-1 h-px bg-slate-700/60" />
                                    <span className="text-xs text-slate-500">or continue with email</span>
                                    <div className="flex-1 h-px bg-slate-700/60" />
                                </div>

                                <button
                                    onClick={() => setStage('email')}
                                    className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 px-4 py-3.5 text-white font-bold text-sm shadow-lg shadow-blue-500/30 transition-all"
                                >
                                    Continue with Email →
                                </button>

                                <p className="mt-7 text-center text-sm text-slate-500">
                                    Already have an account?{' '}
                                    <button onClick={() => navigate('/login')} className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                                        Sign in
                                    </button>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── STEPS ───────────────────────────────────────────── */}
                    {stage !== 'entry' && stage !== 'success' && (
                        <div className="rounded-2xl bg-slate-800/80 backdrop-blur-2xl border border-slate-700/60 shadow-2xl overflow-hidden">
                            {/* Accent bar */}
                            <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-blue-400 to-cyan-400" />

                            <div className="px-8 pt-8 pb-8">
                                {/* Step dots */}
                                <StepDots current={step!} />

                                {/* Stage heading */}
                                <div className="mb-7">
                                    <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-widest mb-1.5">
                                        {step === 1 && 'Get Started'}
                                        {step === 2 && 'Verify Email'}
                                        {step === 3 && 'Your Role'}
                                        {step === 4 && 'Your Details'}
                                        {step === 5 && 'Secure Account'}
                                    </p>
                                    <h2 className="text-white font-extrabold text-2xl tracking-tight">
                                        {step === 1 && "What's your email?"}
                                        {step === 2 && 'Check your inbox'}
                                        {step === 3 && 'What best describes you?'}
                                        {step === 4 && (role === 'school' ? 'Tell us about your school' : 'Tell us about yourself')}
                                        {step === 5 && 'Set your password'}
                                    </h2>
                                    <p className="mt-1.5 text-slate-400 text-sm">
                                        {step === 1 && "We'll send a 6-digit code to verify it's you."}
                                        {step === 2 && `A 6-digit code was sent to ${email}.`}
                                        {step === 3 && 'Choose the option that fits your role.'}
                                        {step === 4 && (role === 'school' ? 'Set up your institution account.' : 'Personalise your account.')}
                                        {step === 5 && 'Choose a strong password to protect your account.'}
                                    </p>
                                </div>

                                {/* ── Step 1: Email ── */}
                                {stage === 'email' && (
                                    <form onSubmit={handleSendOtp} className="flex flex-col gap-4" noValidate>
                                        <div>
                                            <label className={lbl}>Email Address</label>
                                            <input type="email" autoFocus autoComplete="email"
                                                placeholder="you@example.com"
                                                value={email}
                                                onChange={e => { setEmail(e.target.value); clearErr(); }}
                                                className={inp} />
                                        </div>
                                        <Err />
                                        <button type="submit" disabled={loading}
                                            className={btnPrimary + ' w-full py-3 mt-1'}>
                                            {loading
                                                ? <span className="flex items-center justify-center gap-2"><Spinner />Sending…</span>
                                                : 'Send Verification Code →'}
                                        </button>
                                        <button type="button" onClick={goBack} className={btnGhost + ' w-full py-2.5'}>
                                            ← Back
                                        </button>
                                    </form>
                                )}

                                {/* ── Step 2: OTP ── */}
                                {stage === 'otp' && (
                                    <div className="flex flex-col gap-5">
                                        <div>
                                            <label className={lbl}>6-Digit Code</label>
                                            <div className="flex justify-between gap-2 mt-2" onPaste={handleOtpPaste}>
                                                {otp.map((d, i) => (
                                                    <input
                                                        key={i}
                                                        ref={el => { otpRefs.current[i] = el; }}
                                                        type="text" inputMode="numeric" maxLength={1}
                                                        value={d}
                                                        onChange={e => { handleOtpChange(i, e.target.value); clearErr(); }}
                                                        onKeyDown={e => handleOtpKey(i, e)}
                                                        className={`w-12 h-14 rounded-xl text-center text-white text-2xl font-bold
                                                            focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all
                                                            ${d
                                                                ? 'bg-blue-600/20 border-2 border-blue-500 text-blue-200 shadow-lg shadow-blue-500/20'
                                                                : 'bg-slate-900/60 border border-slate-600/50'
                                                            }`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            Didn't receive it? Check spam or{' '}
                                            <button
                                                onClick={handleResend}
                                                disabled={resendSecs > 0 || loading}
                                                className="text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-default font-semibold transition-colors"
                                            >
                                                {resendSecs > 0 ? `resend in ${resendSecs}s` : 'resend code'}
                                            </button>
                                        </p>
                                        <Err />
                                        <NavRow onNext={handleVerifyOtp} label="Verify & Continue" disabled={otp.join('').length < 6} />
                                    </div>
                                )}

                                {/* ── Step 3: Role ── */}
                                {stage === 'role' && (
                                    <div className="flex flex-col gap-3">
                                        {([
                                            {
                                                id: 'teacher' as Role,
                                                icon: '🧑‍🏫',
                                                gradient: 'from-blue-500/20 to-blue-600/10',
                                                border: 'border-blue-500/60',
                                                title: 'Individual Teacher',
                                                desc:  'I teach independently or at a school',
                                            },
                                            {
                                                id: 'school' as Role,
                                                icon: '🏫',
                                                gradient: 'from-purple-500/20 to-purple-600/10',
                                                border: 'border-purple-500/60',
                                                title: 'School or Institute',
                                                desc:  'I manage or run an educational institution',
                                            },
                                            {
                                                id: 'other' as Role,
                                                icon: '👤',
                                                gradient: 'from-slate-500/20 to-slate-600/10',
                                                border: 'border-slate-500/60',
                                                title: 'Other',
                                                desc:  'Something else',
                                            },
                                        ]).map(opt => (
                                            <button key={opt.id} type="button"
                                                onClick={() => { setRole(opt.id); clearErr(); }}
                                                className={`group flex items-center gap-4 rounded-xl px-5 py-4 text-left border-2 transition-all duration-200 ${
                                                    role === opt.id
                                                        ? `bg-gradient-to-r ${opt.gradient} ${opt.border} shadow-lg`
                                                        : 'bg-slate-900/40 border-slate-700/50 hover:border-slate-500/70 hover:bg-slate-700/30'
                                                }`}
                                            >
                                                <span className={`text-2xl transition-transform duration-200 ${role === opt.id ? 'scale-110' : 'group-hover:scale-105'}`}>
                                                    {opt.icon}
                                                </span>
                                                <div className="flex-1">
                                                    <p className="text-white font-semibold text-sm">{opt.title}</p>
                                                    <p className="text-slate-400 text-xs mt-0.5">{opt.desc}</p>
                                                </div>
                                                <div className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                                                    role === opt.id ? 'border-blue-400 bg-blue-500' : 'border-slate-600'
                                                }`}>
                                                    {role === opt.id && <div className="h-2 w-2 rounded-full bg-white" />}
                                                </div>
                                            </button>
                                        ))}
                                        <Err />
                                        <NavRow onNext={handleRoleNext} />
                                    </div>
                                )}

                                {/* ── Step 4: Details ── */}
                                {stage === 'details' && (
                                    <div className="flex flex-col gap-4">
                                        {role === 'school' && (
                                            <div>
                                                <label className={lbl}>School / Institute Name</label>
                                                <input type="text" placeholder="e.g. Sunrise Public School"
                                                    value={schoolName}
                                                    onChange={e => { setSchoolName(e.target.value); clearErr(); }}
                                                    className={inp} />
                                            </div>
                                        )}
                                        <div>
                                            <label className={lbl}>{role === 'school' ? 'Contact Person' : 'Full Name'}</label>
                                            <input type="text" placeholder="e.g. Rajesh Kumar"
                                                value={fullName}
                                                onChange={e => { setFullName(e.target.value); clearErr(); }}
                                                className={inp} />
                                        </div>
                                        <div>
                                            <label className={lbl}>Phone Number</label>
                                            <input type="tel" placeholder="e.g. 9876543210"
                                                value={phone} onChange={e => setPhone(e.target.value)}
                                                className={inp} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className={lbl}>Country</label>
                                                <input type="text" placeholder="IN"
                                                    value={country} onChange={e => setCountry(e.target.value)}
                                                    className={inp} />
                                            </div>
                                            <div>
                                                <label className={lbl}>State</label>
                                                <input type="text" placeholder="e.g. Maharashtra"
                                                    value={stateVal} onChange={e => setStateVal(e.target.value)}
                                                    className={inp} />
                                            </div>
                                        </div>
                                        <Err />
                                        <NavRow onNext={handleDetailsNext} />
                                    </div>
                                )}

                                {/* ── Step 5: Password ── */}
                                {stage === 'password' && (
                                    <div className="flex flex-col gap-4">
                                        <div>
                                            <label className={lbl}>Password</label>
                                            <input type="password" autoComplete="new-password"
                                                placeholder="Min. 8 characters"
                                                value={password}
                                                onChange={e => { setPassword(e.target.value); clearErr(); }}
                                                className={inp} />
                                            {password && (
                                                <div className="mt-2.5">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs text-slate-500">Strength</span>
                                                        <span className={`text-xs font-semibold ${
                                                            strength.pct <= 25 ? 'text-rose-400' :
                                                            strength.pct <= 50 ? 'text-amber-400' :
                                                            strength.pct <= 75 ? 'text-blue-400' : 'text-emerald-400'
                                                        }`}>{strength.label}</span>
                                                    </div>
                                                    <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${strength.color}`}
                                                            style={{ width: `${strength.pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className={lbl}>Confirm Password</label>
                                            <input type="password" autoComplete="new-password"
                                                placeholder="Repeat your password"
                                                value={confirmPwd}
                                                onChange={e => { setConfirmPwd(e.target.value); clearErr(); }}
                                                className={inp} />
                                            {confirmPwd && password !== confirmPwd && (
                                                <p className="mt-1.5 text-xs text-rose-400 flex items-center gap-1">
                                                    <span>⚠</span> Passwords don't match
                                                </p>
                                            )}
                                            {confirmPwd && password === confirmPwd && confirmPwd.length >= 8 && (
                                                <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">
                                                    <span>✓</span> Passwords match
                                                </p>
                                            )}
                                        </div>
                                        {/* Checklist */}
                                        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-900/40 border border-slate-700/40 p-4">
                                            {([
                                                ['8+ characters',     password.length >= 8],
                                                ['Uppercase letter',   /[A-Z]/.test(password)],
                                                ['Number',            /[0-9]/.test(password)],
                                                ['Special character', /[^A-Za-z0-9]/.test(password)],
                                            ] as [string, boolean][]).map(([rule, ok]) => (
                                                <div key={rule} className={`flex items-center gap-1.5 text-xs transition-colors ${ok ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                    <span>{ok ? '✓' : '○'}</span>{rule}
                                                </div>
                                            ))}
                                        </div>
                                        <Err />
                                        <NavRow
                                            onNext={handleRegister}
                                            label="Create Account"
                                            disabled={!password || password !== confirmPwd}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── SUCCESS ─────────────────────────────────────────── */}
                    {stage === 'success' && (
                        <div className="rounded-2xl bg-slate-800/80 backdrop-blur-2xl border border-slate-700/60 shadow-2xl overflow-hidden">
                            <div className="h-1 w-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-teal-400" />
                            <div className="px-8 py-8 flex flex-col items-center gap-6">

                                {/* ── Check + Heading ── */}
                                <div className="flex flex-col items-center gap-3 text-center">
                                    <div className="relative">
                                        <div className="h-16 w-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-3xl">
                                            ✓
                                        </div>
                                        <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-xl" />
                                    </div>
                                    <div>
                                        <h2 className="text-white font-extrabold text-2xl tracking-tight">Account Created!</h2>
                                        <p className="text-slate-400 text-sm mt-1">Welcome to AiGurukul, {fullName.split(' ')[0]} 🎉</p>
                                    </div>
                                </div>

                                {/* ── Account Details ── */}
                                <div className="w-full rounded-xl bg-slate-900/50 border border-slate-700/50 p-4 space-y-3">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Your Account Details</p>
                                    <div className="flex items-center justify-between py-1 border-b border-slate-700/40">
                                        <span className="text-slate-400 text-sm">Name</span>
                                        <span className="text-white font-semibold text-sm">{fullName}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1 border-b border-slate-700/40">
                                        <span className="text-slate-400 text-sm">Login Email</span>
                                        <span className="text-blue-300 font-semibold text-sm">{email}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2.5">
                                        <div>
                                            <p className="text-amber-300 font-bold text-sm">School ID</p>
                                            <p className="text-amber-400/70 text-[11px] mt-0.5">Required every time you log in</p>
                                        </div>
                                        <span className="text-amber-200 font-extrabold text-2xl tracking-wider">{regResult?.schoolId}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                        <span className="text-amber-400">⚠</span>
                                        Save your School ID — you'll need it to sign in later.
                                    </p>
                                </div>

                                {/* ── What is AiGurukul ── */}
                                <div className="w-full">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">What is AiGurukul Smartboard?</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {([
                                            { icon: '🤖', title: 'AI Lesson Plans',     desc: 'Generate complete lessons in seconds' },
                                            { icon: '📊', title: 'Progress Tracking',   desc: 'Monitor student performance live'     },
                                            { icon: '🎯', title: 'Smart Quizzes',       desc: 'Auto-create assessments instantly'    },
                                            { icon: '📚', title: 'Curriculum Aligned',  desc: 'Mapped to your syllabus & board'      },
                                        ] as const).map(f => (
                                            <div key={f.title} className="flex gap-2.5 rounded-xl bg-slate-900/40 border border-slate-700/40 p-3">
                                                <span className="text-xl shrink-0">{f.icon}</span>
                                                <div>
                                                    <p className="text-white font-semibold text-xs">{f.title}</p>
                                                    <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">{f.desc}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── CTA ── */}
                                <button
                                    onClick={handleGoToDashboard}
                                    disabled={loading}
                                    className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 px-6 py-3.5 text-white font-bold text-sm shadow-lg shadow-blue-500/30 transition-all"
                                >
                                    {loading
                                        ? <span className="flex items-center justify-center gap-2"><Spinner />Signing you in…</span>
                                        : 'Go to Dashboard →'}
                                </button>
                                <p className="text-xs text-slate-500">
                                    You'll be automatically signed in — no need to re-enter your details.
                                </p>
                            </div>
                        </div>
                    )}

                    <p className="mt-5 text-center text-xs text-slate-600">
                        AiGurukul Smartboard · Savitroday Technologies
                    </p>
                </div>
            </main>
        </div>
    );
}

function Spinner() {
    return (
        <svg className="h-4 w-4 animate-spin text-white/70" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
    );
}

