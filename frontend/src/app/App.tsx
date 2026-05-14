import { Routes, Route, Navigate } from 'react-router-dom';
import TeacherDashboardPage from '@/pages/TeacherDashboardPage';
import TopicTeachingPage from '@/pages/TopicTeachingPage';
import SmartboardSessionPage from '@/pages/SmartboardSessionPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<TeacherDashboardPage />} />
      <Route path="/teach/:topicId" element={<TopicTeachingPage />} />
      <Route path="/session/:sessionId" element={<SmartboardSessionPage />} />
    </Routes>
  );
}
