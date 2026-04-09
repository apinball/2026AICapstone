import { useState } from "react";
import Dashboard from "./components/Dashboard.jsx";
import SessionDetail from "./components/SessionDetail.jsx";

export default function App() {
  const [selectedSession, setSelectedSession] = useState(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header style={styles.header}>
        <span style={styles.logo}>🎙 AI 상담 분석 대시보드</span>
        {selectedSession && (
          <button
            style={{ background: "transparent", color: "#fff", fontSize: 14 }}
            onClick={() => setSelectedSession(null)}
          >
            ← 목록으로
          </button>
        )}
      </header>

      <main style={{ flex: 1, padding: "24px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        {selectedSession ? (
          <SessionDetail session={selectedSession} />
        ) : (
          <Dashboard onSelectSession={setSelectedSession} />
        )}
      </main>
    </div>
  );
}

const styles = {
  header: {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "#fff",
    padding: "16px 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  },
  logo: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" },
};
