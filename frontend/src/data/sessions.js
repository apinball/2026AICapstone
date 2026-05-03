// 전체 세션 더미 데이터 (날짜별로 구성)
export const ALL_SESSIONS = [
  // 2026-04-17
  { id: 101, name: "김지우", date: "2026-04-17", time: "14:00", duration: "45분", tags: [{ label: "긍정적", type: "green" }, { label: "불안", type: "blue" }, { label: "성장", type: "purple" }], status: "done", folder: "전체 노트" },
  { id: 102, name: "박서연", date: "2026-04-17", time: "10:30", duration: "38분", tags: [{ label: "우울", type: "blue" }, { label: "희망", type: "pink" }], status: "ing", folder: "전체 노트" },

  // 2026-04-16
  { id: 103, name: "이민준", date: "2026-04-16", time: "16:00", duration: "50분", tags: [{ label: "긍정적", type: "green" }, { label: "자신감", type: "purple" }], status: "done", folder: "전체 노트" },
  { id: 104, name: "최유진", date: "2026-04-16", time: "11:00", duration: "42분", tags: [{ label: "불안", type: "blue" }, { label: "성장", type: "purple" }, { label: "긍정적", type: "green" }], status: "done", folder: "전체 노트" },

  // 2026-04-15
  { id: 105, name: "정하은", date: "2026-04-15", time: "15:30", duration: "47분", tags: [{ label: "희망", type: "pink" }, { label: "긍정적", type: "green" }], status: "done", folder: "전체 노트" },
  { id: 106, name: "강민서", date: "2026-04-15", time: "09:00", duration: "55분", tags: [{ label: "불안", type: "blue" }, { label: "우울", type: "blue" }], status: "done", folder: "전체 노트" },

  // 2026-04-14
  { id: 107, name: "윤소희", date: "2026-04-14", time: "13:00", duration: "40분", tags: [{ label: "성장", type: "purple" }, { label: "자신감", type: "purple" }], status: "done", folder: "전체 노트" },
  { id: 108, name: "임재현", date: "2026-04-14", time: "10:00", duration: "35분", tags: [{ label: "긍정적", type: "green" }], status: "done", folder: "전체 노트" },

  // 2026-04-13
  { id: 109, name: "오지훈", date: "2026-04-13", time: "14:30", duration: "52분", tags: [{ label: "불안", type: "blue" }, { label: "희망", type: "pink" }], status: "done", folder: "전체 노트" },

  // 2026-04-12
  { id: 110, name: "한예진", date: "2026-04-12", time: "11:00", duration: "48분", tags: [{ label: "우울", type: "blue" }, { label: "성장", type: "purple" }], status: "done", folder: "전체 노트" },

  // 2026-04-10
  { id: 111, name: "서준혁", date: "2026-04-10", time: "15:00", duration: "44분", tags: [{ label: "긍정적", type: "green" }, { label: "자신감", type: "purple" }], status: "done", folder: "전체 노트" },

  // 2026-04-08
  { id: 112, name: "장나연", date: "2026-04-08", time: "10:00", duration: "39분", tags: [{ label: "불안", type: "blue" }], status: "done", folder: "전체 노트" },

  // 공유 받은 노트
  { id: 201, name: "슈퍼바이저 피드백 — 김지우 케이스", date: "2026-04-16", time: "09:00", duration: "-", tags: [{ label: "피드백", type: "purple" }], status: "done", folder: "공유 받은 노트", sharedBy: "박민준 슈퍼바이저" },
  { id: 202, name: "케이스 컨퍼런스 — 4월 정기", date: "2026-04-14", time: "18:00", duration: "-", tags: [{ label: "회의", type: "blue" }], status: "done", folder: "공유 받은 노트", sharedBy: "팀 전체" },
  { id: 203, name: "외부 자문 — 이민준 케이스 검토", date: "2026-04-11", time: "11:00", duration: "-", tags: [{ label: "자문", type: "green" }], status: "done", folder: "공유 받은 노트", sharedBy: "김수현 원장" },

  // 공유한 노트
  { id: 301, name: "김지우 — 중간 경과 보고", date: "2026-04-15", time: "17:00", duration: "-", tags: [{ label: "보고", type: "green" }], status: "done", folder: "공유한 노트", sharedTo: "박민준 슈퍼바이저" },
  { id: 302, name: "정하은 — 초기 평가서", date: "2026-04-13", time: "16:30", duration: "-", tags: [{ label: "평가", type: "purple" }], status: "done", folder: "공유한 노트", sharedTo: "김수현 원장" },

  // 휴지통
  { id: 401, name: "[삭제됨] 테스트 세션", date: "2026-04-10", time: "09:00", duration: "5분", tags: [{ label: "테스트", type: "blue" }], status: "done", folder: "휴지통" },
  { id: 402, name: "[삭제됨] 미완성 녹음", date: "2026-04-09", time: "14:00", duration: "2분", tags: [{ label: "미완성", type: "blue" }], status: "done", folder: "휴지통" },
];

export const TAG_COLORS = {
  green:  { bg: "#dcfce7", color: "#166534" },
  blue:   { bg: "#eff6ff", color: "#1d4ed8" },
  purple: { bg: "#f5f3ff", color: "#5b21b6" },
  pink:   { bg: "#fdf2f8", color: "#9d174d" },
  red:    { bg: "#fef2f2", color: "#991b1b" },
  yellow: { bg: "#fefce8", color: "#854d0e" },
};

// 날짜에 세션이 있는 날 집합 (달력 도트 표시용)
export const SESSION_DATES = new Set(ALL_SESSIONS.map(s => s.date));
