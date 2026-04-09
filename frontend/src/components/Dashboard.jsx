import { useState, useRef, useEffect } from "react";

const API = "/api";

export default function Dashboard({ onSelectSession }) {
  const [sessions, setSessions] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000); // 폴링
    return () => clearInterval(interval);
  }, []);

  async function fetchSessions() {
    try {
      const res = await fetch(`${API}/sessions`);
      const data = await res.json();
      setSessions(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch {
      // 서버 미연결 시 무시
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("audio", file);
      const res = await fetch(`${API}/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      await fetchSessions();
    } catch (err) {
      alert(`업로드 실패: ${err.message}`);
    } finally {
      setUploading(false);
      fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div style={styles.toolbar}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>상담 세션 목록</h2>
        <label style={styles.uploadBtn}>
          {uploading ? "업로드 중..." : "＋ 오디오 업로드"}
          <input ref={fileRef} type="file" accept=".m4a,.wav,.mp3" onChange={handleUpload} />
        </label>
      </div>

      <div style={styles.grid}>
        {sessions.length === 0 && (
          <p style={{ color: "#888", gridColumn: "1/-1" }}>
            아직 세션이 없습니다. 오디오 파일을 업로드해 주세요.
          </p>
        )}
        {sessions.map((s) => (
          <SessionCard key={s.sessionId} session={s} onClick={() => onSelectSession(s)} />
        ))}
      </div>
    </div>
  );
}

function SessionCard({ session, onClick }) {
  const statusColor = {
    pending: "#f59e0b",
    completed: "#10b981",
    error: "#ef4444",
  }[session.status] ?? "#888";

  const emotion = session.analysisResult?.final_emotion ?? "-";
  const ratio = session.analysisResult
    ? `${Math.round(session.analysisResult.counselor_talk_ratio * 100)}%`
    : "-";

  return (
    <div style={styles.card} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{session.fileName ?? session.sessionId.slice(0, 8)}</span>
        <span style={{ ...styles.badge, background: statusColor }}>{session.status}</span>
      </div>
      <div style={styles.cardMeta}>
        <MetaItem label="최종 감정" value={EMOTION_EMOJI[emotion] ?? emotion} />
        <MetaItem label="상담사 발화" value={ratio} />
        <MetaItem label="날짜" value={new Date(session.createdAt).toLocaleDateString("ko-KR")} />
      </div>
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 15 }}>{value}</div>
    </div>
  );
}

const EMOTION_EMOJI = {
  joy: "😊 기쁨", sadness: "😢 슬픔", anger: "😠 분노",
  neutral: "😐 중립", fear: "😨 두려움", surprise: "😲 놀람",
  sarcasm: "😏 반어", disgust: "🤢 혐오",
};

const styles = {
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  uploadBtn: {
    background: "#667eea", color: "#fff", padding: "9px 18px",
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#fff", borderRadius: 12, padding: 20,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    cursor: "pointer", transition: "transform 0.1s, box-shadow 0.1s",
  },
  badge: {
    color: "#fff", fontSize: 11, fontWeight: 700,
    padding: "2px 8px", borderRadius: 20,
  },
  cardMeta: { display: "flex", justifyContent: "space-around", marginTop: 12 },
};
