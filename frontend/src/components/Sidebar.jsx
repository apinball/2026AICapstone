import React, { useState, useEffect, useRef } from 'react';

const NAV_ITEMS = [
  { key: "sessions", label: "전체 노트",    icon: "📋" },
  { key: "feedback", label: "상담사 피드백", icon: "📊" },
  { key: "report",   icon: "📄", label: "상담 결과" },
];

const SUB_ITEMS = [
  { key: "shared_in",  label: "공유 받은 노트", icon: "📥" },
  { key: "shared_out", label: "공유한 노트",    icon: "📤" },
  { key: "trash",      label: "휴지통",         icon: "🗑️" },
];

export function Sidebar({ activePage, navigate, activeFolder, setActiveFolder, counselorName }) {
  const [isMemoOpen, setIsMemoOpen] = useState(false); 
  const [isRecording, setIsRecording] = useState(false); 
  const [recordTime, setRecordTime] = useState(0);       
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    let timer;
    if (isRecording) timer = setInterval(() => setRecordTime(p => p + 1), 1000);
    else setRecordTime(0);
    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    let stream = null;
    if (isVideoOpen) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(vs => { stream = vs; if (videoRef.current) videoRef.current.srcObject = vs; })
        .catch(() => setIsVideoOpen(false));
    }
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [isVideoOpen]);

  const formatTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  return (
    <aside style={{ width: 172, background: "#fff", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, fontFamily: "'Pretendard', sans-serif" }}>
      
      {/* 1. 상단 로고 및 인사말, 퀵 아이콘 */}
      <div style={{ padding: "24px 18px 20px", borderBottom: "1px solid #e2e8f0" }}>
        <div onClick={() => navigate('landing')} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 16, color: "#0f172a", marginBottom: 12, cursor: "pointer" }}>
          🍀 Clover
        </div>
        <div style={{ marginBottom: 16, fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
          안녕하세요, <span style={{ color: "#10b981" }}>{counselorName}</span>님 👋
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {[{ icon: "🎤", act: () => setIsRecording(true) }, { icon: "📹", act: () => setIsVideoOpen(true) }, { icon: "📝", act: () => setIsMemoOpen(true) }].map((item, i) => (
            <div 
              key={i} 
              onClick={item.act} 
              style={{ fontSize: 18, cursor: "pointer", opacity: 0.6, transition: "all 0.2s", borderRadius: "8px", padding: "4px" }}
              onMouseOver={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.background = "#f0fdf4"; // 퀵 아이콘에도 옅은 초록 배경
                e.currentTarget.style.transform = "scale(1.1)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.opacity = "0.6";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {item.icon}
            </div>
          ))}
        </div>
      </div>

      {/* 2. 메인 내비게이션 & 폴더 */}
      <div style={{ padding: "12px 0", flex: 1 }}>
        <div style={{ padding: "8px 20px", fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>MAIN</div>
        {NAV_ITEMS.map(item => {
          const isActive = activePage === item.key;
          return (
            <div 
              key={item.key} 
              onClick={() => navigate(item.key)} 
              style={{ 
                display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", fontSize: 14, cursor: "pointer", transition: "all 0.2s",
                background: isActive ? "#ecfdf5" : "transparent", 
                color: isActive ? "#10b981" : "#475569", 
                fontWeight: isActive ? 600 : 500 
              }}
              onMouseOver={(e) => {
                if(!isActive) {
                  e.currentTarget.style.background = "#f0fdf4"; // 호버 시 옅은 초록색 배경
                  e.currentTarget.style.color = "#059669"; // 글자색도 살짝 초록빛으로
                }
              }}
              onMouseOut={(e) => {
                if(!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#475569";
                }
              }}
            >
              <span>{item.icon}</span> {item.label}
            </div>
          );
        })}
        <div style={{ height: "1px", background: "#f1f5f9", margin: "12px 16px" }} />
        <div style={{ padding: "8px 20px", fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>FOLDERS</div>
        {SUB_ITEMS.map(item => {
          const isActive = activeFolder === item.key;
          return (
            <div 
              key={item.key} 
              onClick={() => { setActiveFolder?.(item.key); navigate("sessions"); }} 
              style={{ 
                display: "flex", alignItems: "center", gap: 10, padding: "8px 20px 8px 24px", fontSize: 13, cursor: "pointer", transition: "all 0.2s",
                color: isActive ? "#10b981" : "#64748b", 
                fontWeight: isActive ? 600 : 500,
                background: "transparent"
              }}
              onMouseOver={(e) => {
                if(!isActive) {
                  e.currentTarget.style.background = "#f0fdf4"; // 호버 시 옅은 초록색 배경
                  e.currentTarget.style.color = "#059669";
                }
              }}
              onMouseOut={(e) => {
                if(!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#64748b";
                }
              }}
            >
              <span>{item.icon}</span> {item.label}
            </div>
          );
        })}
      </div>

      {/* 3. 하단 상태 바 및 도움말 */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6, fontWeight: 600 }}>
            <span style={{ color: "#64748b" }}>잔여 사용량</span>
            <span style={{ color: "#059669" }}>264분 / 300분</span>
          </div>
          <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: "88%", height: "100%", background: "#10b981" }} />
          </div>
        </div>
        {["도움말", "알림 센터", "설정"].map(it => (
          <div 
            key={it} 
            onClick={() => alert("해당 기능은 아직 개발 중입니다. 🚧")}
            style={{ fontSize: 12, color: "#94a3b8", padding: "6px 8px", margin: "2px -8px", borderRadius: "6px", cursor: "pointer", transition: "all 0.2s" }}
            onMouseOver={(e) => { 
              e.target.style.color = "#059669"; 
              e.target.style.background = "#f0fdf4"; // 하단 메뉴에도 배경색 적용
              e.target.style.fontWeight = "600"; 
            }}
            onMouseOut={(e) => { 
              e.target.style.color = "#94a3b8"; 
              e.target.style.background = "transparent";
              e.target.style.fontWeight = "400"; 
            }}
          >
            {it}
          </div>
        ))}
      </div>

      {/* 플로팅 기능들 (기존과 동일) */}
      {isMemoOpen && (
        <div style={{ position: 'fixed', bottom: 20, left: 184, width: 280, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.08)', zIndex: 1000 }}>
          <div style={{ background: '#ecfdf5', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #d1fae5' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#065f46' }}>📝 메모</span>
            <button onClick={() => setIsMemoOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
          <textarea style={{ width: '100%', height: 150, padding: 16, border: 'none', outline: 'none', resize: 'none' }} placeholder="메모를 입력하세요..." />
        </div>
      )}

      {isRecording && (
        <div style={{ position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: '12px 24px', borderRadius: 30, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 2000, display: 'flex', alignItems: 'center', gap: 16, border: '1.5px solid #fecaca' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{formatTime(recordTime)}</span>
          <button onClick={() => setIsRecording(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 20 }}>종료</button>
        </div>
      )}

      {isVideoOpen && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#000', width: 640, height: 480, borderRadius: 24, zIndex: 3000, overflow: 'hidden' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button onClick={() => setIsVideoOpen(false)} style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: '#fff', border: 'none', padding: '12px 32px', borderRadius: 30 }}>종료</button>
        </div>
      )}
    </aside>
  );
}
