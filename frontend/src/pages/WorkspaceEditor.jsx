import React, { useState, useEffect, useRef } from 'react';
import { fetchSession, getAudioUrl } from '../api/client';

const MOCK_TRANSCRIPT = [
  { id: 1, time: "00:01", speaker: "counselor", text: "안녕하세요, 지우님. 지난주에 뵙고 일주일 만이네요. 그동안 어떻게 지내셨나요?" },
  { id: 2, time: "00:15", speaker: "client", text: "음... 그냥 비슷했어요. 과제는 여전히 많고, 잠도 잘 못 자고요." },
  { id: 3, time: "00:28", speaker: "counselor", text: "잠을 잘 못 주무셨군요. 혹시 잠자리에 들기 전에 어떤 생각들이 주로 나나요?" },
  { id: 4, time: "00:35", speaker: "client", text: "계속 뒤처지는 것 같다는 생각이 들어요. 동기들은 다들 취업 준비도 잘하고 앞서가는데, 저만 제자리걸음인 것 같아서 불안해요." },
  { id: 5, time: "00:52", speaker: "counselor", text: "동기들과 비교하게 되면서 많이 불안하셨겠어요. 그 불안감이 지우님을 밤새 괴롭히고 있었군요." },
];

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function WorkspaceEditor({ navigate, session }) {
  const [activePlayId, setActivePlayId] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const audioRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  // 실제 세션이면 백엔드에서 분석 결과 가져오기
  useEffect(() => {
    if (!session?.id || typeof session.id !== 'string') return;
    fetchSession(session.id)
      .then(setAnalysisData)
      .catch(err => console.warn('세션 로드 실패:', err.message));
  }, [session?.id]);

  // 백엔드 분석 결과를 채팅 형식으로 변환
  const transcript = analysisData?.analysisResult?.segments?.length
    ? analysisData.analysisResult.segments.map((seg, i) => ({
        id: i,
        time: formatTime(seg.start),
        startSec: seg.start,
        speaker: seg.speaker,
        text: seg.text,
        emotion: seg.text_emotion,
      }))
    : MOCK_TRANSCRIPT;

  const isRealSession = !!analysisData?.analysisResult;
  const audioSrc = session?.id && typeof session.id === 'string' ? getAudioUrl(session.id) : null;

  const togglePlay = () => {
    if (!audioRef.current) return;
    playing ? audioRef.current.pause() : audioRef.current.play();
    setPlaying(!playing);
  };

  const seekTo = (sec) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = sec;
    setCurrentTime(sec);
  };

  const onSegmentClick = (item) => {
    setActivePlayId(item.id);
    if (item.startSec !== undefined) seekTo(item.startSec);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', background: '#f8fafc', fontFamily: "'Pretendard', sans-serif" }}>
      
      {/* 상단 헤더 */}
      <header style={{ padding: '18px 32px', background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button onClick={() => navigate('sessions')} style={{ background: '#f1f5f9', border: 'none', width: 40, height: 40, borderRadius: '50%', fontSize: 18, cursor: 'pointer', color: '#475569', transition: 'all 0.2s' }} onMouseOver={e=>e.target.style.background='#e2e8f0'} onMouseOut={e=>e.target.style.background='#f1f5f9'}>←</button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>{session?.name || '김지우 내담자 - 4회차 상담'}</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0 0', fontWeight: 500 }}>{session?.date ? `${session.date} · ${session.time || ''}` : '2026.04.17 · 오후 2:00 · 45분 진행'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{ padding: '10px 20px', background: '#fff', border: '1px solid #cbd5e1', color: '#334155', borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' }} onMouseOver={e=>e.target.style.background='#f8fafc'} onMouseOut={e=>e.target.style.background='#fff'}>📝 메모 요약</button>
          <button style={{ padding: '10px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)', transition: 'all 0.2s' }} onMouseOver={e=>{e.target.style.transform='translateY(-1px)'; e.target.style.boxShadow='0 6px 16px rgba(16, 185, 129, 0.4)'}} onMouseOut={e=>{e.target.style.transform='translateY(0)'; e.target.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.3)'}}>분석 완료</button>
        </div>
      </header>

      {/* 메인 작업 영역 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* 왼쪽: 오디오 & 요약 정보 */}
        <div style={{ width: 360, background: '#fff', borderRight: '1px solid #e2e8f0', padding: 32, display: 'flex', flexDirection: 'column', gap: 32, overflowY: 'auto' }}>
          
          {/* 오디오 플레이어 */}
          <div style={{ background: 'linear-gradient(145deg, #ecfdf5 0%, #d1fae5 100%)', padding: 24, borderRadius: 24, boxShadow: '0 10px 25px rgba(16, 185, 129, 0.1)', border: '1px solid #a7f3d0' }}>
            {audioSrc && (
              <audio
                ref={audioRef}
                src={audioSrc}
                onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
                onEnded={() => setPlaying(false)}
                style={{ display: 'none' }}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, position: 'relative' }}>
              {playing && <div style={{ position: 'absolute', width: 64, height: 64, borderRadius: '50%', background: '#10b981', opacity: 0.2, animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }} />}
              <button onClick={togglePlay} style={{ width: 64, height: 64, borderRadius: '50%', background: '#10b981', color: '#fff', border: 'none', fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(16, 185, 129, 0.4)', zIndex: 1, paddingLeft: playing ? 0 : 4 }}>
                {playing ? '⏸' : '▶'}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#059669', marginBottom: 8 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#047857', fontWeight: 600 }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* AI 자동 요약 */}
          <div style={{ background: '#fff', padding: 24, borderRadius: 20, border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ background: '#eff6ff', color: '#3b82f6', padding: 6, borderRadius: 8, fontSize: 16 }}>✨</div> AI 핵심 요약
            </h3>
            {isRealSession ? (
              <ul style={{ paddingLeft: 0, margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.8, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 최종 감정: <strong>{analysisData.analysisResult.final_emotion}</strong> ({(analysisData.analysisResult.final_emotion_score * 100).toFixed(1)}%)</li>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 음향 감정: {analysisData.analysisResult.acoustic_emotion}</li>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 상담사 발화 비율: {(analysisData.analysisResult.counselor_talk_ratio * 100).toFixed(1)}%</li>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 세그먼트 수: {analysisData.analysisResult.segments.length}개</li>
              </ul>
            ) : (
              <ul style={{ paddingLeft: 0, margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.8, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 최근 일주일간 수면 장애 지속</li>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 타인(동기)과의 비교로 인한 불안감 호소</li>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 자존감 저하 및 학업 스트레스 누적</li>
              </ul>
            )}
          </div>
        </div>

        {/* 오른쪽: STT 인터랙티브 기록지 (모던 채팅 UI) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '40px', background: '#f8fafc' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {transcript.map((chat) => {
              const isCounselor = chat.speaker === 'counselor';
              const isActive = activePlayId === chat.id;

              return (
                <div key={chat.id} style={{ display: 'flex', flexDirection: isCounselor ? 'row-reverse' : 'row', gap: 16, alignItems: 'flex-start' }}>
                  {/* 프로필 아이콘 */}
                  <div style={{ width: 44, height: 44, borderRadius: 22, background: isCounselor ? '#fff' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 2px 5px rgba(0,0,0,0.05)', border: isCounselor ? '1px solid #e2e8f0' : 'none', flexShrink: 0 }}>
                    {isCounselor ? '🍀' : '👤'}
                  </div>
                  
                  {/* 대화 내용 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isCounselor ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, flexDirection: isCounselor ? 'row-reverse' : 'row' }}>
                      <span>{isCounselor ? '상담사 (나)' : '김지우 (내담자)'}</span>
                      <span style={{ display: 'inline-block', padding: '4px 8px', background: '#e2e8f0', borderRadius: 12, fontSize: 11, color: '#475569', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={e=>e.target.style.background='#cbd5e1'} onMouseOut={e=>e.target.style.background='#e2e8f0'}>⏱️ {chat.time}</span>
                    </div>
                    <div
                      onClick={() => onSegmentClick(chat)}
                      style={{ 
                        padding: '16px 20px', fontSize: 15, lineHeight: 1.6, cursor: 'pointer',
                        background: isActive ? '#fef08a' : (isCounselor ? '#fff' : '#10b981'),
                        color: isActive ? '#854d0e' : (isCounselor ? '#1e293b' : '#fff'),
                        border: isActive ? '1px solid #fde047' : (isCounselor ? '1px solid #e2e8f0' : '1px solid #059669'),
                        borderRadius: 20,
                        borderTopRightRadius: isCounselor ? 4 : 20,
                        borderTopLeftRadius: !isCounselor ? 4 : 20,
                        boxShadow: isActive ? '0 0 0 4px rgba(253, 224, 71, 0.3)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        transition: 'all 0.2s ease',
                        letterSpacing: '-0.3px'
                      }}
                    >
                      {chat.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
