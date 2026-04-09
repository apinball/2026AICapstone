/**
 * 가사형 오디오 플레이어
 * - 현재 재생 위치와 일치하는 세그먼트를 하이라이트
 * - 세그먼트 클릭 시 해당 타임스탬프로 점프
 */
import { useRef, useState, useEffect } from "react";

const SPEAKER_COLOR = {
  counselor: "#667eea",
  client: "#10b981",
  unknown: "#888",
};

export default function AudioPlayer({ sessionId, segments }) {
  const audioRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  // sessionId 기반으로 백엔드에서 presigned URL 또는 스트림 URL 가져오기
  // 현재 베이스라인에서는 placeholder — 실제 구현 시 S3 presigned URL 연동
  const audioSrc = `/api/sessions/${sessionId}/audio`;

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); } else { el.play(); }
    setPlaying(!playing);
  }

  function handleTimeUpdate() {
    setCurrentTime(audioRef.current?.currentTime ?? 0);
  }

  function handleLoadedMetadata() {
    setDuration(audioRef.current?.duration ?? 0);
  }

  function seekTo(time) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  const activeIdx = segments.findIndex(
    (seg) => currentTime >= seg.start && currentTime < seg.end
  );

  return (
    <div>
      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setPlaying(false)}
        style={{ display: "none" }}
      />

      {/* 컨트롤 바 */}
      <div style={styles.controls}>
        <button style={styles.playBtn} onClick={togglePlay}>
          {playing ? "⏸" : "▶"}
        </button>
        <span style={{ fontSize: 13, color: "#555", minWidth: 90 }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
          style={{ flex: 1 }}
        />
      </div>

      {/* 가사형 세그먼트 목록 */}
      <div style={styles.transcriptBox}>
        {segments.map((seg, idx) => (
          <div
            key={idx}
            onClick={() => seekTo(seg.start)}
            style={{
              ...styles.segLine,
              background: activeIdx === idx ? "#f0f0ff" : "transparent",
              borderLeft: `3px solid ${SPEAKER_COLOR[seg.speaker] ?? "#ccc"}`,
            }}
          >
            <span style={{ ...styles.timestamp, color: SPEAKER_COLOR[seg.speaker] ?? "#888" }}>
              [{formatTime(seg.start)}] {seg.speaker === "counselor" ? "상담사" : "내담자"}
            </span>
            <span style={styles.segText}>{seg.text}</span>
            <span style={styles.emotionTag}>{seg.text_emotion}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  controls: {
    display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
    padding: "10px 16px", background: "#f7f7fb", borderRadius: 8,
  },
  playBtn: {
    background: "#667eea", color: "#fff", width: 36, height: 36,
    borderRadius: "50%", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
  },
  transcriptBox: {
    maxHeight: 320, overflowY: "auto",
    display: "flex", flexDirection: "column", gap: 6,
  },
  segLine: {
    padding: "8px 12px", borderRadius: 6, cursor: "pointer",
    display: "flex", alignItems: "flex-start", gap: 10,
    transition: "background 0.15s",
  },
  timestamp: { fontSize: 11, fontWeight: 700, minWidth: 110, paddingTop: 2 },
  segText: { flex: 1, fontSize: 14, lineHeight: 1.5 },
  emotionTag: {
    fontSize: 11, background: "#ede9fe", color: "#7c3aed",
    borderRadius: 12, padding: "2px 8px", whiteSpace: "nowrap",
  },
};
