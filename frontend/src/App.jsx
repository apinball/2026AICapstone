import { useState } from 'react';
import Landing from './pages/Landing';
import SessionList from './pages/SessionList';
import WorkspaceEditor from './pages/WorkspaceEditor';
import CounselorFeedback from './pages/CounselorFeedback'; 
import ClientReport from './pages/ClientReport'; 

function App() {
  // 새로고침 시에도 view/세션 상태 유지
  const [view, setView] = useState(() => {
    const saved = localStorage.getItem('current_view');
    const hasName = localStorage.getItem('counselor_name');
    // 이름이 저장되어 있으면 마지막 view 또는 sessions로, 아니면 landing
    return hasName ? (saved || 'sessions') : 'landing';
  });

  const [selectedSession, setSelectedSession] = useState(() => {
    try {
      const saved = localStorage.getItem('selected_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('counselor_name') || "이예온";
  });

  const handleLogin = (name) => {
    const finalName = name || "이예온";
    setUserName(finalName);
    localStorage.setItem('counselor_name', finalName);
    setView('sessions');
    localStorage.setItem('current_view', 'sessions');
  };

  // 페이지 이동 + 세션 데이터 전달용 — view/session을 localStorage에 동기화
  const navigate = (page, session = null) => {
    if (session) {
      setSelectedSession(session);
      localStorage.setItem('selected_session', JSON.stringify(session));
    }
    if (page === 'landing') {
      // 로그아웃: 저장된 상태 초기화
      localStorage.removeItem('current_view');
      localStorage.removeItem('selected_session');
      localStorage.removeItem('counselor_name');
    } else {
      localStorage.setItem('current_view', page);
    }
    setView(page);
  };

  return (
    <>
      <style>
        {`
          * {
            cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Ccircle cx='10' cy='10' r='7' fill='%2310b981' stroke='%23ffffff' stroke-width='1.5'/%3E%3C/svg%3E") 10 10, auto !important;
          }
          a, button, [onClick], [style*='cursor:pointer'] {
             cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Ccircle cx='14' cy='14' r='12' fill='%2310b981' opacity='0.3'/%3E%3Ccircle cx='14' cy='14' r='5' fill='%2310b981' stroke='%23ffffff' stroke-width='1.5'/%3E%3C/svg%3E") 14 14, pointer !important;
          }
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .page-transition {
            animation: fadeSlideIn 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
            width: 100%;
            height: 100vh;
          }
          div[onClick], button, a {
            transition: transform 0.1s ease-out !important;
          }
          div[onClick]:active, button:active, a:active {
            transform: scale(0.96) !important;
          }
        `}
      </style>

      <div key={view} className="page-transition">
        {view === 'landing' && <Landing onLogin={handleLogin} />}
        {view === 'sessions' && <SessionList navigate={navigate} counselorName={userName} />}
        {view === 'workspace' && <WorkspaceEditor navigate={navigate} counselorName={userName} session={selectedSession} />}
        {view === 'feedback' && <CounselorFeedback navigate={navigate} counselorName={userName} session={selectedSession} />}
        {view === 'report' && <ClientReport navigate={navigate} counselorName={userName} session={selectedSession} />}
      </div>
    </>
  );
}

export default App;
