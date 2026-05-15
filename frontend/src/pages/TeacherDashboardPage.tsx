// Owner: Manohar (Savischools integration) — Parivesh wired the shell; Manohar fills real data
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { savischoolsContextService } from '@/services/savischoolsContextService';
import { smartboardSessionService } from '@/services/smartboardSessionService';
import type { ClassDto, SubjectDto, TopicDto } from '@/types';

// ── lightweight session summary shape from GET /api/smartboard/sessions/recent ──
interface RecentSession {
    sessionId: number;
    status: string;
    startedAt: string;
    sessionTitle?: string;
}

export default function TeacherDashboardPage() {
    const navigate = useNavigate();

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

    // Load classes on mount
    useEffect(() => {
        savischoolsContextService.getClasses()
            .then((data: ClassDto[]) => setClasses(data))
            .catch(() => setClasses([]));

        setSessionsLoading(true);
        smartboardSessionService.recent()
            .then((data: RecentSession[]) => setRecentSessions(data))
            .catch(() => setRecentSessions([]))
            .finally(() => setSessionsLoading(false));
    }, []);

    // Load subjects when class changes
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

    async function handleStartSession() {
        if (!selectedClass || !selectedSubject) return;
        const title = selectedTopic
            ? `${selectedSubject.name} — ${selectedTopic.name}`
            : `${selectedSubject.name} (Class ${selectedClass.name})`;

        setStarting(true);
        try {
            const res = await smartboardSessionService.start({
                classId: selectedClass.classId,
                subjectId: selectedSubject.subjectId,
                topicId: selectedTopic?.topicId ?? null,
                sessionTitle: title,
            }) as { sessionId: number };
            navigate(`/session/${res.sessionId}`);
        } finally {
            setStarting(false);
        }
    }

    function handleBrowseTopic() {
        if (!selectedTopic || !selectedSubject || !selectedClass) return;
        navigate(
            `/teach/${selectedTopic.topicId}?title=${encodeURIComponent(selectedTopic.name)}&subjectId=${selectedSubject.subjectId}&classId=${selectedClass.classId}`
        );
    }

    const canStart = !!selectedClass && !!selectedSubject;
    const canBrowse = canStart && !!selectedTopic;

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">Teacher Dashboard</h1>

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
                                                <button
                                                    onClick={() => navigate(`/session/${s.sessionId}`)}
                                                    className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${s.status === 'InProgress'
                                                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                                        }`}
                                                >
                                                    {s.status === 'InProgress' ? 'Continue' : 'View'}
                                                </button>
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
    );
}
