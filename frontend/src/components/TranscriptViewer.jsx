/**
 * 인터랙티브 전사 뷰어
 * - 북마크 추가 / 메모 작성 기능
 * - 데이터는 localStorage에 저장 (MVP) → 추후 백엔드 연동
 */
import { useState, useEffect } from "react";

export default function TranscriptViewer({ segments }) {
  const [bookmarks, setBookmarks] = useState({});
  const [memos, setMemos] = useState({});
  const [editingIdx, setEditingIdx] = useState(null);
  const [memoInput, setMemoInput] = useState("");

  // localStorage 복원
  useEffect(() => {
    const b = localStorage.getItem("bookmarks");
    const m = localStorage.getItem("memos");
    if (b) setBookmarks(JSON.parse(b));
    if (m) setMemos(JSON.parse(m));
  }, []);

  function toggleBookmark(idx) {
    const next = { ...bookmarks, [idx]: !bookmarks[idx] };
    setBookmarks(next);
    localStorage.setItem("bookmarks", JSON.stringify(next));
  }

  function saveMemo(idx) {
    const next = { ...memos, [idx]: memoInput };
    setMemos(next);
    localStorage.setItem("memos", JSON.stringify(next));
    setEditingIdx(null);
    setMemoInput("");
  }

  function startEdit(idx) {
    setEditingIdx(idx);
    setMemoInput(memos[idx] ?? "");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {segments.map((seg, idx) => (
        <div key={idx} style={{ ...styles.row, borderLeft: `3px solid ${seg.speaker === "counselor" ? "#667eea" : "#10b981"}` }}>
          <div style={styles.rowHeader}>
            <span style={styles.speaker}>
              {seg.speaker === "counselor" ? "상담사" : "내담자"}
            </span>
            <span style={styles.time}>{seg.start.toFixed(1)}s</span>
            <span style={{ ...styles.emotionBadge, background: EMOTION_BG[seg.text_emotion] ?? "#e5e7eb" }}>
              {seg.text_emotion}
            </span>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {/* 북마크 */}
              <button
                style={{ background: "transparent", fontSize: 16, padding: 0 }}
                title="북마크"
                onClick={() => toggleBookmark(idx)}
              >
                {bookmarks[idx] ? "🔖" : "📑"}
              </button>
              {/* 메모 */}
              <button
                style={{ background: "transparent", fontSize: 14, padding: 0, color: "#667eea" }}
                title="메모 추가"
                onClick={() => startEdit(idx)}
              >
                ✏️
              </button>
            </div>
          </div>

          <p style={styles.text}>{seg.text}</p>

          {memos[idx] && editingIdx !== idx && (
            <div style={styles.memoDisplay} onClick={() => startEdit(idx)}>
              💬 {memos[idx]}
            </div>
          )}

          {editingIdx === idx && (
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input
                autoFocus
                value={memoInput}
                onChange={(e) => setMemoInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveMemo(idx)}
                placeholder="메모를 입력하세요 (Enter 저장)"
                style={styles.memoInput}
              />
              <button style={{ background: "#667eea", color: "#fff" }} onClick={() => saveMemo(idx)}>
                저장
              </button>
              <button style={{ background: "#e5e7eb", color: "#333" }} onClick={() => setEditingIdx(null)}>
                취소
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const EMOTION_BG = {
  joy: "#fef3c7", sadness: "#dbeafe", anger: "#fee2e2",
  neutral: "#f3f4f6", fear: "#ede9fe", surprise: "#dbeafe",
  sarcasm: "#ffedd5",
};

const styles = {
  row: {
    padding: "10px 14px", borderRadius: 6,
    background: "#fafafa",
  },
  rowHeader: {
    display: "flex", alignItems: "center", gap: 8, marginBottom: 4,
  },
  speaker: { fontSize: 12, fontWeight: 700, color: "#444" },
  time: { fontSize: 11, color: "#aaa" },
  emotionBadge: {
    fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600,
  },
  text: { fontSize: 14, lineHeight: 1.6, color: "#222" },
  memoDisplay: {
    marginTop: 6, fontSize: 12, color: "#667eea",
    background: "#ede9fe", padding: "4px 10px", borderRadius: 6, cursor: "pointer",
  },
  memoInput: {
    flex: 1, border: "1px solid #d1d5db", borderRadius: 6,
    padding: "6px 10px", fontSize: 13,
  },
};
