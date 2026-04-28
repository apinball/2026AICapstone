import { useState, useMemo } from "react";
import { Sidebar } from "../components/Sidebar";
import { Calendar } from "../components/Calendar";
import { ALL_SESSIONS, TAG_COLORS } from "../data/sessions";

const FOLDER_MAP = {
  home:        null,          
  sessions:    "전체 노트",
  shared_in:   "공유 받은 노트",
  shared_out:  "공유한 노트",
  trash:       "휴지통",
};

function SessionCard({ session, onClick }) {
  const isTrash = session.folder === "휴지통";
  return (
    <div
      onClick={() => onClick && onClick(session)}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.07)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
      style={{
        background: isTrash ? "#fafafa" : "#fff", border: "0.5px solid #e5e7eb",
        borderRadius: 10, padding: "14px 18px", cursor: "pointer", transition: "box-shadow .15s",
        opacity: isTrash ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: isTrash ? "#f3f4f6" : "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="6" r="3" stroke={isTrash ? "#9ca3af" : "#22c55e"} strokeWidth="1.3" />
              <path d="M2 14.5c0-2.5 2.7-4.5 6-4.5s6 2 6 4.5" stroke={isTrash ? "#9ca3af" : "#22c55e"} strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: isTrash ? "#9ca3af" : "#111827", marginBottom: 2 }}>{session.name}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              {session.folder} · {session.date} · {session.time} {session.duration !== "-" && ` · ${session.duration}`}
            </div>
            {session.sharedBy && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>📥 공유: {session.sharedBy}</div>}
            {session.sharedTo && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>📤 대상: {session.sharedTo}</div>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {isTrash ? (
            <span style={{ fontSize: 11, color: "#ef4444", padding: "3px 10px", background: "#fef2f2", borderRadius: 20, border: "0.5px solid #fca5a5" }}>🗑️ 삭제됨</span>
          ) : session.status === "done" ? (
            <>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 500, background: "#dcfce7", color: "#166534", border: "0.5px solid #86efac", display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="5" cy="5" r="4.5" stroke="#22c55e" strokeWidth="1" />
                  <path d="M2.5 5l2 2 3-3" stroke="#22c55e" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg> 분석 완료
              </span>
              <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 500 }}>자세히 보기 →</span>
            </>
          ) : (
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 500, background: "#eff6ff", color: "#1d4ed8", border: "0.5px solid #93c5fd" }}>⟳ 분석 중</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {session.tags.map(tag => (
          <span key={tag.label} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: TAG_COLORS[tag.type]?.bg || "#f3f4f6", color: TAG_COLORS[tag.type]?.color || "#374151" }}>
            {tag.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SessionList({ navigate, counselorName }) {
  const [activePage, setActivePage] = useState("sessions");
  const [activeFolder, setActiveFolder] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [activeTab, setActiveTab] = useState("최근 생성");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const handleNavigate = (page) => {
    if (page === 'landing') {
      navigate('landing');
      return;
    }
    setActivePage(page);
    setActiveFolder(null);
    if (["feedback", "report", "home"].includes(page)) {
      navigate(page);
    }
  };

  const handleFolderSelect = (folder) => {
    setActiveFolder(folder);
    setActivePage("sessions");
    setSelectedDate(null);
  };

  const filtered = useMemo(() => {
    let list = ALL_SESSIONS;

    if (activeFolder === "shared_in") list = list.filter(s => s.folder === "공유 받은 노트");
    else if (activeFolder === "shared_out") list = list.filter(s => s.folder === "공유한 노트");
    else if (activeFolder === "trash") list = list.filter(s => s.folder === "휴지통");
    else list = list.filter(s => s.folder === "전체 노트");

    if (selectedDate) {
      list = list.filter(s => {
        const sessionDay = parseInt(s.date.split('-').pop()); 
        return sessionDay === selectedDate;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.tags.some(t => t.label.includes(q)));
    }

    if (activeTab === "공유 받은") list = list.filter(s => s.folder === "공유 받은 노트");

    return list.sort((a, b) => new Date(b.date + " " + b.time) - new Date(a.date + " " + a.time));
  }, [activeFolder, selectedDate, searchQuery, activeTab]);

  const calendarSessions = useMemo(() => {
    if (!selectedDate) return [];
    return ALL_SESSIONS.filter(s => {
      const sessionDay = parseInt(s.date.split('-').pop());
      return sessionDay === selectedDate && s.folder === "전체 노트";
    });
  }, [selectedDate]);

  const folderLabel = activeFolder
    ? { shared_in: "공유 받은 노트", shared_out: "공유한 노트", trash: "휴지통" }[activeFolder] || "전체 노트"
    : "전체 노트";

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", background: "#f9fafb" }}>
      <Sidebar 
        activePage={activePage} 
        navigate={handleNavigate} 
        activeFolder={activeFolder} 
        setActiveFolder={handleFolderSelect} 
        counselorName={counselorName}
      />

      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", borderBottom: "0.5px solid #86efac", padding: "9px 20px", fontSize: 12, color: "#166534", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>📋</span> <span style={{ fontWeight: 500 }}>AI 상담 분석 플랫폼 — 실시간 음성 기록 및 인사이트를 바로 확인하세요</span>
          </div>
          <span style={{ cursor: "pointer", color: "#9ca3af" }}>✕</span>
        </div>

        <div style={{ padding: "22px 28px", flex: 1, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 500, color: "#111827", marginBottom: 2 }}>{folderLabel}</h1>
              <p style={{ fontSize: 12, color: "#9ca3af" }}>{selectedDate ? `${selectedDate}일 · ` : ""}총 {filtered.length}개 세션</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {showSearch ? (
                <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="이름, 태그 검색..." style={{ border: "0.5px solid #d1d5db", borderRadius: 8, padding: "7px 12px", fontSize: 13, outline: "none", width: 180, fontFamily: "inherit" }} onBlur={() => { if (!searchQuery) setShowSearch(false); }} />
              ) : (
                <button onClick={() => setShowSearch(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#f3f4f6", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 13, color: "#9ca3af", cursor: "pointer" }}>🔍 검색</button>
              )}
            </div>
          </div>

          {!activeFolder && (
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {["최근 생성", "공유 받은"].map(t => (
                <button key={t} onClick={() => setActiveTab(t)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, border: "0.5px solid", cursor: "pointer", borderColor: activeTab === t ? "#22c55e" : "#e5e7eb", background: activeTab === t ? "#f0fdf4" : "#fff", color: activeTab === t ? "#16a34a" : "#6b7280", fontWeight: activeTab === t ? 500 : 400 }}>{t}</button>
              ))}
            </div>
          )}

          {activeFolder === "trash" && (
            <div style={{ padding: "10px 14px", background: "#fef2f2", border: "0.5px solid #fca5a5", borderRadius: 8, fontSize: 12, color: "#991b1b", marginBottom: 14 }}>🗑️ 삭제된 세션은 30일 후 자동으로 영구 삭제됩니다.</div>
          )}

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#9ca3af" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 14 }}>{selectedDate ? `${selectedDate}일에 해당하는 세션이 없습니다.` : "세션이 없습니다."}</div>
              {selectedDate && <button onClick={() => setSelectedDate(null)} style={{ marginTop: 12, padding: "7px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>전체 보기</button>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(s => <SessionCard key={s.id} session={s} onClick={s.status === "done" && s.folder === "전체 노트" ? () => navigate("workspace", s) : null} />)}
            </div>
          )}
        </div>
      </main>

      <aside style={{ width: 230, borderLeft: "0.5px solid #e5e7eb", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "auto" }}>
        <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        {selectedDate && (
          <div style={{ padding: "0 12px 12px" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 8 }}>{selectedDate}일 세션</div>
            {calendarSessions.length === 0 ? <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "12px 0" }}>세션 없음</div> : calendarSessions.map(s => (
              <div key={s.id} onClick={() => navigate("workspace", s)} style={{ padding: "8px 10px", background: "#f9fafb", border: "0.5px solid #e5e7eb", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#111827" }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{s.time} · {s.duration}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                  {s.tags.slice(0, 2).map(tag => <span key={tag.label} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: TAG_COLORS[tag.type]?.bg, color: TAG_COLORS[tag.type]?.color }}>{tag.label}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
        {!selectedDate && (
          <div style={{ padding: "0 12px 16px" }}>
            <div style={{ padding: 12, background: "#f0fdf4", borderRadius: 8, border: "0.5px solid #bbf7d0" }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#166534", marginBottom: 8 }}>💡 빠른 탐색 팁</div>
              {["● 날짜 클릭 → 해당 날 세션 보기", "● 🟢 도트 표시 = 세션 있는 날", "● 다양한 녹음 언어 지원", "● 강조할 내용 하이라이트"].map(tip => <div key={tip} style={{ fontSize: 11, color: "#4b7c5a", marginBottom: 4 }}>{tip}</div>)}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
