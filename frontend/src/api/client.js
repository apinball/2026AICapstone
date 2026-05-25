/**
 * 백엔드 API 클라이언트
 * 백엔드는 /api/sessions 형태로 응답하고, 프론트는 더미 데이터 스키마를 사용 중이라
 * 변환 어댑터를 통해 형식을 맞춘다.
 */

const API_BASE = "/api";

const EMOTION_TO_TAG = {
  joy: { label: "긍정적", type: "green" },
  sadness: { label: "우울", type: "blue" },
  anger: { label: "분노", type: "blue" },
  fear: { label: "불안", type: "blue" },
  surprise: { label: "놀람", type: "purple" },
  neutral: { label: "중립", type: "blue" },
  sarcasm: { label: "반어", type: "purple" },
  disgust: { label: "혐오", type: "blue" },
};

/** 백엔드 세션 → 프론트 더미 형식 변환 */
function adaptSession(s) {
  const created = new Date(s.createdAt);
  const date = created.toISOString().slice(0, 10);
  const time = created.toTimeString().slice(0, 5);

  const tags = [];
  if (s.analysisResult) {
    const finalEmo = s.analysisResult.final_emotion;
    if (EMOTION_TO_TAG[finalEmo]) tags.push(EMOTION_TO_TAG[finalEmo]);
    Object.keys(s.analysisResult.summary_emotions || {}).forEach((emo) => {
      if (EMOTION_TO_TAG[emo] && emo !== finalEmo) {
        tags.push(EMOTION_TO_TAG[emo]);
      }
    });
  }

  return {
    id: s.sessionId,
    name: s.fileName || `세션 ${s.sessionId.slice(0, 8)}`,
    date,
    time,
    duration: "-",
    tags: tags.slice(0, 3),
    status: s.status === "completed" ? "done" : s.status === "error" ? "error" : "ing",
    folder: "전체 노트",
    raw: s, // 원본 응답도 같이
  };
}

export async function fetchSessions() {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  const list = await res.json();
  return list.map(adaptSession);
}

export async function fetchSession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
  return res.json();
}

export async function uploadAudio(file) {
  const form = new FormData();
  form.append("audio", file);
  const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function deleteSession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return res.json();
}

export function getAudioUrl(sessionId) {
  return `${API_BASE}/sessions/${sessionId}/audio`;
}

/**
 * 치료 동맹 균열 감지 (수동 트리거)
 * @returns {Promise<{count: number, events: Array}>}
 */
export async function triggerRuptureDetection(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/rupture`, { method: "POST" });
  if (!res.ok) throw new Error(`Rupture detection failed: ${res.status}`);
  return res.json();
}

/**
 * 슈퍼바이저 보고용 요약 생성
 */
export async function triggerSummary(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/summary`, { method: "POST" });
  if (!res.ok) throw new Error(`Summary failed: ${res.status}`);
  return res.json();
}

/**
 * 개인정보 비식별화
 * @returns {Promise<{count: number, redacted: string[]}>}
 */
export async function triggerRedaction(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/redact`, { method: "POST" });
  if (!res.ok) throw new Error(`Redaction failed: ${res.status}`);
  return res.json();
}

/**
 * 화자 라벨 수동 정정
 * @param {string[]} speakers — 인덱스별 새 화자 ('counselor' | 'client')
 */
export async function updateSpeakers(sessionId, speakers) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/speakers`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ speakers }),
  });
  if (!res.ok) throw new Error(`Speaker update failed: ${res.status}`);
  return res.json();
}

/** 발화 메모 저장/삭제 */
export async function saveNote(sessionId, segmentIdx, text) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/notes/${segmentIdx}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Note save failed: ${res.status}`);
  return res.json();
}

/** 북마크 토글 */
export async function toggleBookmark(sessionId, segmentIdx) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/bookmarks/${segmentIdx}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Bookmark toggle failed: ${res.status}`);
  return res.json();
}
