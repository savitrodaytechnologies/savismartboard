import { Routes, Route, Navigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import LoginPage, { isLoggedIn } from '@/pages/LoginPage';
import TeacherDashboardPage from '@/pages/TeacherDashboardPage';
import TopicTeachingPage from '@/pages/TopicTeachingPage';
import SmartboardSessionPage from '@/pages/SmartboardSessionPage';
import DevToolbar from '@/components/DevToolbar';
import OfflineIndicator from '@/components/OfflineIndicator';

function PwaUpdateBanner() {
    const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
    if (!needRefresh) return null;
    return (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-blue-600 px-5 py-2.5 text-sm text-white shadow-lg">
            <span>New version available</span>
            <button onClick={() => updateServiceWorker(true)} className="rounded-full bg-white text-blue-700 font-semibold px-3 py-0.5 hover:bg-blue-50">
                Update
            </button>
        </div>
    );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
    if (!isLoggedIn()) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

export default function App() {
    return (
        <>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<Navigate to={isLoggedIn() ? '/dashboard' : '/login'} replace />} />
                <Route path="/dashboard" element={<RequireAuth><TeacherDashboardPage /></RequireAuth>} />
                <Route path="/teach/:topicId" element={<RequireAuth><TopicTeachingPage /></RequireAuth>} />
                <Route path="/session/:sessionId" element={<RequireAuth><SmartboardSessionPage /></RequireAuth>} />
            </Routes>
            <OfflineIndicator />
            <PwaUpdateBanner />
            {import.meta.env.DEV && <DevToolbar />}
        </>
    );
}