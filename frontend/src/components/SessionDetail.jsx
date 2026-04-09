import { useState, useEffect } from "react";
import AudioPlayer from "./AudioPlayer.jsx";
import EmotionChart from "./EmotionChart.jsx";
import TranscriptViewer from "./TranscriptViewer.jsx";

const API = "/api";

export default function SessionDetail({ session }) {
  const [data, setData] = useState(session);

  // pending 상태면 완료될 때까지 폴링
  useEffect(() => {
    if (data.status === "completed") return;
    const id = setInterval(async () => {
      const res = await fetch(`${API}/sessions/${data.sessionId}`);
      const updated = await res.json();
      setData(updated);
      if (updated.status !== "pending") clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [data.sessionId, data.status]);

  if (data.status === "pending") {
    return <PendingView />;
  }
  if (data.status === "error" || !data.analysisResult) {
    return <div style={{ padding: 24, color: "#ef4444" }}>분석 실패. 다시 시도해 주세요.</div>;
  }

  const result = data.analysisResult;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 요약 카드 */}
      <SummaryBar result={result} />

      {/* 오디오 플레이어 */}
      <section style={styles.card}>
        <h3 style={styles.sectionTitle}>오디오 재생</h3>
        <AudioPlayer sessionId={data.sessionId} segments={result.segments} />
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* 감정 타임라인 차트 */}
        <section style={styles.card}>
          <h3 style={styles.sectionTitle}>감정 타임라인</h3>
          <EmotionChart segments={result.segments} />
        </section>

        {/* 감정 분포 파이 */}
        <section style={styles.card}>
          <h3 style={styles.sectionTitle}>감정 분포</h3>
          <EmotionChart segments={result.segments} type="pie" summary={result.summary_emotions} />
        </section>
      </div>

      {/* 전사 텍스트 */}
      <section style={styles.card}>
        <h3 style={styles.sectionTitle}>전사 텍스트 (가사형)</h3>
        <TranscriptViewer segments={result.segments} />
      </section>
    </div>
  );
}

function SummaryBar({ result }) {
  const items = [
    { label: "최종 감정", value: result.final_emotion },
    { label: "신뢰도", value: `${(result.final_emotion_score * 100).toFixed(1)}%` },
    { label: "음향 감정", value: result.acoustic_emotion },
    { label: "상담사 발화 비율", value: `${(result.counselor_talk_ratio * 100).toFixed(1)}%` },
    { label: "세그먼트 수", value: result.segments.length },
  ];
  return (
    <div style={styles.summaryBar}>
      {items.map((it) => (
        <div key={it.label} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{it.label}</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function PendingView() {
  return (
    <div style={{ textAlign: "center", padding: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
      <p style={{ fontSize: 16, color: "#667eea", fontWeight: 600 }}>AI 분석 중입니다...</p>
      <p style={{ fontSize: 13, color: "#888", marginTop: 8 }}>잠시 후 자동으로 업데이트됩니다.</p>
    </div>
  );
}

const styles = {
  card: {
    background: "#fff", borderRadius: 12, padding: 24,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  sectionTitle: { fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#333" },
  summaryBar: {
    background: "#fff", borderRadius: 12, padding: "20px 32px",
    display: "flex", justifyContent: "space-around", alignItems: "center",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
};
