import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { savischoolsContextService } from '@/services/savischoolsContextService';
import { smartboardSessionService, type RecentSession } from '@/services/smartboardSessionService';
import { startSessionOfflineFirst } from '@/services/sessionStartService';
import { db } from '@/db/localDb';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { clearSession, getUser } from '@/pages/LoginPage';
import type { ClassDto, SubjectDto, TopicDto } from '@/types';

export default function TeacherDashboardPage() {
    const navigate = useNavigate(); const isOnline = useOnlineStatus();
    // Cascading pickers
    const [classes, setClasses] = useState<ClassDto[]>([]);
    const [subjects, setSubjects] = useState<SubjectDto[]>([]);
    const [topics, setTopics] = useState<TopicDto[]>([]);

    const [selectedClass, setSelectedClass] = useState<ClassDto | null>(null);
    const [selectedSubject, setSelectedSubject] = useState<SubjectDto | null>(null);
    const [selectedTopic, setSelectedTopic] = useState<TopicDto | null>(null);

    // Recent sessions
    const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(true);

    const [starting, setStarting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ sessionId: number; title: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    async function loadLocalSessions() {
        const locals = await db.sessions.orderBy('updatedAt').reverse().limit(10).toArray();
        setRecentSessions(locals.map(s => ({
            sessionId: s.serverSessionId ?? (s.sessionId as number),
            status: s.status,
            startedAt: s.startedAt,
            sessionTitle: s.sessionTitle,
        })));
    }
    // Load classes on mount
    useEffect(() => {
        if (isOnline) {
            savischoolsContextService.getClasses()
                .then((data: ClassDto[]) => setClasses(data))
                .catch(() => setClasses([]));
        }

        setSessionsLoading(true);
        if (isOnline) {
            smartboardSessionService.recent()
                .then((data: RecentSession[]) => setRecentSessions(data))
                .catch(() => loadLocalSessions())
                .finally(() => setSessionsLoading(false));
        } else {
            loadLocalSessions().finally(() => setSessionsLoading(false));
        }
    }, [isOnline]);
    useEffect(() => {
        setSelectedSubject(null); setSelectedTopic(null); setSubjects([]); setTopics([]);
        if (!selectedClass) return;
        savischoolsContextService.getSubjects(selectedClass.classId)
            .then((data: SubjectDto[]) => setSubjects(data))
            .catch(() => setSubjects([]));
    }, [selectedClass]);

    // Load topics when subject changes
    useEffect(() => {
        setSelectedTopic(null); setTopics([]);
        if (!selectedSubject || !selectedClass) return;
        savischoolsContextService.getTopics(selectedSubject.subjectId, selectedClass.classId)
            .then((data: TopicDto[]) => setTopics(data))
            .catch(() => setTopics([]));
    }, [selectedSubject, selectedClass]);

    async function handleDeleteConfirmed() {
        if (!deleteTarget) return;
        setDeleting(true);
        const id = deleteTarget.sessionId;
        try {
            if (isOnline) {
                await smartboardSessionService.delete(id);
            }
            // Remove from local DB (best-effort — may not exist locally)
            await db.sessions.delete(id as unknown as string);
            await db.pages.where('sessionId').equals(id as unknown as number).delete();
        } catch {
            // swallow — session may already be gone
        } finally {
            // Always remove from the list even if the API call failed
            setRecentSessions(prev => prev.filter(s => s.sessionId !== id));
            setDeleting(false);
            setDeleteTarget(null);
        }
    }

    async function handleStartSession() {
        if (!selectedClass || !selectedSubject) return;
        const title = selectedTopic
            ? `${selectedSubject.name} — ${selectedTopic.name}`
            : `${selectedSubject.name} (Class ${selectedClass.name})`;

        setStarting(true);
        try {
            const sid = await startSessionOfflineFirst({
                classId: selectedClass.classId,
                subjectId: selectedSubject.subjectId,
                topicId: selectedTopic?.topicId ?? null,
                sessionTitle: title,
            });
            navigate(`/session/${sid}`);
        }
        finally {
            setStarting(false);
        }
    }

    function handleBrowseTopic() {
        if (!selectedClass || !selectedSubject || !selectedTopic) return;
        const params = new URLSearchParams({
            classId: String(selectedClass.classId),
            subjectId: String(selectedSubject.subjectId),
            slug: selectedTopic.slug,
            title: `${selectedSubject.name} — ${selectedTopic.name}`,
        });
        navigate(`/teach/${selectedTopic.topicId}?${params.toString()}`);
    }

    const canStart = !!selectedClass && !!selectedSubject;
    const canBrowse = canStart && !!selectedTopic;
    const user = getUser();

    function handleLogout() {
        clearSession();
        navigate('/login', { replace: true });
    }

    return (
        <>
            <div className="min-h-screen bg-slate-50 p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Teacher Dashboard</h1>
                        {user.name && (
                            <p className="text-sm text-slate-500 mt-0.5">
                                {user.name} · {user.schoolName}
                                {user.curriculum && <span className="ml-2 rounded bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-semibold">{user.curriculum}</span>}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleLogout}
                        className="text-sm text-slate-500 hover:text-slate-800 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-100 transition-colors"
                    >
                        Sign out
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* ── Picker card ─────────────────────────────────────────────────── */}
                    <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col gap-4">
                        <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Start a Session</h2>

                        {/* Class */}
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Class</label>
                            <select
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={selectedClass?.classId ?? ''}
                                onChange={e => setSelectedClass(classes.find(c => c.classId === Number(e.target.value)) ?? null)}
                            >
                                <option value="">Select class…</option>
                                {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
                            </select>
                        </div>

                        {/* Subject */}
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Subject</label>
                            <select
                                disabled={!selectedClass}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                value={selectedSubject?.subjectId ?? ''}
                                onChange={e => setSelectedSubject(subjects.find(s => s.subjectId === Number(e.target.value)) ?? null)}
                            >
                                <option value="">Select subject…</option>
                                {subjects.map(s => <option key={s.subjectId} value={s.subjectId}>{s.name}</option>)}
                            </select>
                        </div>

                        {/* Topic (optional) */}
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Topic <span className="text-slate-400">(optional)</span></label>
                            <select
                                disabled={!selectedSubject}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                value={selectedTopic?.topicId ?? ''}
                                onChange={e => setSelectedTopic(topics.find(t => t.topicId === Number(e.target.value)) ?? null)}
                            >
                                <option value="">No specific topic</option>
                                {topics.map(t => <option key={t.topicId} value={t.topicId}>{t.name}</option>)}
                            </select>
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={handleStartSession}
                                disabled={!canStart || starting}
                                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm font-semibold disabled:opacity-40 transition-colors"
                            >
                                {starting ? 'Starting…' : '⬜ Blank Board'}
                            </button>
                            <button
                                onClick={handleBrowseTopic}
                                disabled={!canBrowse}
                                title="Browse content cards & questions for this topic"
                                className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 text-white py-2 text-sm font-semibold disabled:opacity-40 transition-colors"
                            >
                                📄 Browse Content
                            </button>
                        </div>
                    </div>

                    {/* ── Recent sessions ─────────────────────────────────────────────── */}
                    <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
                        <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide mb-4">Recent Sessions</h2>

                        {sessionsLoading && <p className="text-sm text-slate-400">Loading…</p>}

                        {!sessionsLoading && recentSessions.length === 0 && (
                            <p className="text-sm text-slate-400">No sessions yet. Start your first one using the picker →</p>
                        )}

                        {!sessionsLoading && recentSessions.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-slate-500 border-b border-slate-100">
                                            <th className="pb-2 text-left font-medium">Title</th>
                                            <th className="pb-2 text-left font-medium">Date</th>
                                            <th className="pb-2 text-left font-medium">Status</th>
                                            <th className="pb-2" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentSessions.map(s => (
                                            <tr key={s.sessionId} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                                <td className="py-2 pr-3 text-slate-800 font-medium max-w-52 truncate">
                                                    {s.sessionTitle ?? `Session #${s.sessionId}`}
                                                </td>
                                                <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                                                    {new Date(s.startedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td className="py-2 pr-3">
                                                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.status === 'InProgress'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                        {s.status === 'InProgress' ? 'In Progress' : 'Ended'}
                                                    </span>
                                                </td>
                                                <td className="py-2 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => navigate(`/session/${s.sessionId}`)}
                                                            className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${s.status === 'InProgress'
                                                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                                                }`}
                                                        >
                                                            {s.status === 'InProgress' ? 'Continue' : 'View'}
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteTarget({ sessionId: s.sessionId, title: s.sessionTitle ?? `Session #${s.sessionId}` })}
                                                            className="rounded px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 transition-colors"
                                                            title="Delete session"
                                                        >🗑</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Delete confirmation modal ─────────────────────────────────── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
                        <h3 className="text-base font-semibold text-slate-800 mb-2">Delete Session?</h3>
                        <p className="text-sm text-slate-500 mb-5">
                            <span className="font-medium text-slate-700">&ldquo;{deleteTarget.title}&rdquo;</span> will be permanently deleted.
                            This cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirmed}
                                disabled={deleting}
                                className="rounded-lg px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-60"
                            >
                                {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
