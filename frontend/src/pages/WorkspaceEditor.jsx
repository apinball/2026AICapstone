import React, { useState, useEffect, useRef } from 'react';
import { fetchSession, getAudioUrl, triggerRuptureDetection, triggerSummary, triggerRedaction, updateSpeakers, saveNote, toggleBookmark } from '../api/client';

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
  const [ruptureLoading, setRuptureLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [redactionLoading, setRedactionLoading] = useState(false);
  const [showRedacted, setShowRedacted] = useState(false);

  // 실제 세션이면 백엔드에서 분석 결과 가져오기 + processing 중인 작업 자동 폴링
  useEffect(() => {
    if (!session?.id || typeof session.id !== 'string') return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const data = await fetchSession(session.id);
        if (cancelled) return;
        setAnalysisData(data);
        // processing 중인 작업 있으면 5초 후 다시 fetch
        const js = data?.jobStatus ?? {};
        const anyProcessing = Object.values(js).some(j => j?.status === "processing");
        if (anyProcessing) setTimeout(refresh, 5000);
      } catch (err) {
        console.warn('세션 로드 실패:', err.message);
      }
    };
    refresh();
    return () => { cancelled = true; };
  }, [session?.id]);

  /**
   * 백그라운드 작업 트리거 후 결과 필드가 채워질 때까지 폴링.
   * @param {string} fieldName - DB 응답 객체에서 확인할 필드 이름
   * @param {function} triggerFn - 트리거 API 함수
   */
  const pollUntilReady = async (fieldName, triggerFn) => {
    if (!session?.id || typeof session.id !== 'string') return;
    const before = await fetchSession(session.id);
    const previousTs = before?.[fieldName];

    await triggerFn(session.id);

    // 최대 20분 (5초 × 240) — 50분 상담의 긴 LLM 분석도 커버
    const maxAttempts = 240;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const updated = await fetchSession(session.id);
      if (updated[fieldName] && updated[fieldName] !== previousTs) {
        setAnalysisData(updated);
        return updated;
      }
    }
    throw new Error("처리 시간이 초과되었습니다 (페이지 새로고침으로 결과를 확인하세요)");
  };

  const handleRuptureDetect = async () => {
    setRuptureLoading(true);
    try {
      await pollUntilReady('ruptureAnalyzedAt', triggerRuptureDetection);
    } catch (err) {
      alert(`Rupture 감지 실패: ${err.message}`);
    } finally {
      setRuptureLoading(false);
    }
  };

  const handleSummaryGenerate = async () => {
    setSummaryLoading(true);
    try {
      await pollUntilReady('summaryGeneratedAt', triggerSummary);
    } catch (err) {
      alert(`요약 생성 실패: ${err.message}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleRedaction = async () => {
    setRedactionLoading(true);
    try {
      await pollUntilReady('redactedAt', triggerRedaction);
      setShowRedacted(true);
    } catch (err) {
      alert(`비식별화 실패: ${err.message}`);
    } finally {
      setRedactionLoading(false);
    }
  };

  /** 모든 발화의 상담사/내담자 라벨을 일괄 반전 */
  const handleSwapAllSpeakers = async () => {
    if (!session?.id || typeof session.id !== 'string') return;
    const segs = analysisData?.analysisResult?.segments;
    if (!segs?.length) return;
    const swapped = segs.map(s =>
      s.speaker === 'counselor' ? 'client' : (s.speaker === 'client' ? 'counselor' : s.speaker)
    );
    try {
      await updateSpeakers(session.id, swapped);
      const updated = await fetchSession(session.id);
      setAnalysisData(updated);
    } catch (err) {
      alert(`화자 변경 실패: ${err.message}`);
    }
  };

  /** 발화 인덱스로 점프: 스크롤 + 오디오 시점 이동 + 하이라이트 */
  const jumpToSegment = (segIdx) => {
    const startTime = analysisData?.analysisResult?.segments?.[segIdx]?.start;
    if (typeof startTime === 'number') seekTo(startTime);
    setActivePlayId(segIdx);
    // 다음 tick에 DOM 렌더 끝나고 스크롤
    requestAnimationFrame(() => {
      const el = document.getElementById(`segment-${segIdx}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const [editingNoteIdx, setEditingNoteIdx] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");

  const notes = analysisData?.notes ?? {};
  const bookmarks = analysisData?.bookmarks ?? [];

  const startEditNote = (segIdx) => {
    setEditingNoteIdx(segIdx);
    setNoteDraft(notes[segIdx]?.text ?? "");
  };

  const handleSaveNote = async () => {
    if (!session?.id || editingNoteIdx === null) return;
    try {
      await saveNote(session.id, editingNoteIdx, noteDraft);
      const updated = await fetchSession(session.id);
      setAnalysisData(updated);
    } catch (err) {
      alert(`메모 저장 실패: ${err.message}`);
    } finally {
      setEditingNoteIdx(null);
      setNoteDraft("");
    }
  };

  const handleDeleteNote = async (segIdx) => {
    if (!session?.id) return;
    try {
      await saveNote(session.id, segIdx, "");
      const updated = await fetchSession(session.id);
      setAnalysisData(updated);
    } catch (err) {
      alert(`메모 삭제 실패: ${err.message}`);
    }
  };

  const handleToggleBookmark = async (segIdx) => {
    if (!session?.id) return;
    try {
      await toggleBookmark(session.id, segIdx);
      const updated = await fetchSession(session.id);
      setAnalysisData(updated);
    } catch (err) {
      alert(`북마크 실패: ${err.message}`);
    }
  };

  /** 특정 인덱스의 화자 토글 */
  const handleToggleSpeaker = async (idx) => {
    if (!session?.id || typeof session.id !== 'string') return;
    const segs = analysisData?.analysisResult?.segments;
    if (!segs?.[idx]) return;
    const speakers = segs.map(s => s.speaker);
    speakers[idx] = speakers[idx] === 'counselor' ? 'client' : 'counselor';
    try {
      await updateSpeakers(session.id, speakers);
      const updated = await fetchSession(session.id);
      setAnalysisData(updated);
    } catch (err) {
      alert(`화자 변경 실패: ${err.message}`);
    }
  };

  const ruptureEvents = analysisData?.ruptureEvents ?? [];
  const summary = analysisData?.summary;
  const redactedSegments = analysisData?.redactedSegments;
  const hasRedaction = Array.isArray(redactedSegments) && redactedSegments.length > 0;

  // DB의 jobStatus 기반 — 페이지 재진입에도 상태 유지
  const jobStatus = analysisData?.jobStatus ?? {};
  const ruptureProcessing = jobStatus.rupture?.status === "processing" || ruptureLoading;
  const summaryProcessing = jobStatus.summary?.status === "processing" || summaryLoading;
  const redactionProcessing = jobStatus.redaction?.status === "processing" || redactionLoading;

  // 세그먼트가 어떤 rupture 윈도우에 속하는지 매핑
  const segmentRuptureMap = {};
  ruptureEvents.forEach((ev, idx) => {
    for (let i = ev.window_start_idx; i <= ev.window_end_idx; i++) {
      segmentRuptureMap[i] = { ...ev, eventIdx: idx };
    }
  });

  // 백엔드 분석 결과를 채팅 형식으로 변환 (비식별화 토글 적용)
  const transcript = analysisData?.analysisResult?.segments?.length
    ? analysisData.analysisResult.segments.map((seg, i) => ({
        id: i,
        time: formatTime(seg.start),
        startSec: seg.start,
        speaker: seg.speaker,
        text: showRedacted && hasRedaction ? (redactedSegments[i] ?? seg.text) : seg.text,
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
          {isRealSession && (
            <>
              <button
                onClick={handleSwapAllSpeakers}
                title="상담사 ↔ 내담자 전체 반전"
                style={{
                  padding: '10px 16px',
                  background: '#fff',
                  color: '#475569',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                🔄 화자 반전
              </button>
              {hasRedaction ? (
                <button
                  onClick={() => setShowRedacted(v => !v)}
                  title="비식별화 보기 토글"
                  style={{
                    padding: '10px 16px',
                    background: showRedacted ? '#10b981' : '#fff',
                    color: showRedacted ? '#fff' : '#10b981',
                    border: `1.5px solid #10b981`,
                    borderRadius: 12,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  🛡 {showRedacted ? '비식별 ON' : '비식별 OFF'}
                </button>
              ) : (
                <button
                  onClick={handleRedaction}
                  disabled={redactionProcessing}
                  style={{
                    padding: '10px 20px',
                    background: redactionProcessing ? '#94a3b8' : '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    cursor: redactionProcessing ? 'wait' : 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  {redactionProcessing ? '⟳ 처리 중...' : '🛡 비식별화'}
                </button>
              )}
              <button
                onClick={handleSummaryGenerate}
                disabled={summaryProcessing}
                style={{
                  padding: '10px 20px',
                  background: summaryProcessing ? '#94a3b8' : '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  cursor: summaryProcessing ? 'wait' : 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                }}
              >
                {summaryProcessing ? '⟳ 요약 중...' : '✨ AI 요약'}
              </button>
              <button
                onClick={handleRuptureDetect}
                disabled={ruptureProcessing}
                style={{
                  padding: '10px 20px',
                  background: ruptureProcessing ? '#94a3b8' : '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  cursor: ruptureProcessing ? 'wait' : 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
                }}
              >
                {ruptureProcessing ? '⟳ 분석 중...' : '🔍 균열 감지'}
              </button>
            </>
          )}
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

          {/* 치료 동맹 균열 감지 결과 */}
          {ruptureEvents.length > 0 && (
            <div style={{ background: '#fff', padding: 24, borderRadius: 20, border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ background: '#f3e8ff', color: '#7c3aed', padding: 6, borderRadius: 8, fontSize: 16 }}>🔍</div>
                균열 감지 ({ruptureEvents.length}건)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {ruptureEvents.map((ev, i) => {
                  const isWithdrawal = ev.rupture_type === 'withdrawal';
                  const color = isWithdrawal ? '#f59e0b' : '#ef4444';
                  const bg = isWithdrawal ? '#fef3c7' : '#fee2e2';
                  return (
                    <div
                      key={i}
                      onClick={() => jumpToSegment(ev.window_start_idx)}
                      title="클릭하여 해당 발화로 이동"
                      style={{ background: bg, borderLeft: `4px solid ${color}`, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                      onMouseOver={(e) => { e.currentTarget.style.transform = 'translateX(2px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>
                          {isWithdrawal ? '🟡 Withdrawal' : '🔴 Confrontation'}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          {formatTime(ev.window_start_time)}~{formatTime(ev.window_end_time)} →
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>
                        강도: <strong>{ev.intensity}/10</strong>
                      </div>
                      {ev.evidence?.length > 0 && (
                        <div style={{ fontSize: 12, color: '#334155', marginBottom: 8, lineHeight: 1.5 }}>
                          {ev.evidence.slice(0, 2).map((e, j) => (
                            <div key={j} style={{ marginBottom: 2 }}>• {e}</div>
                          ))}
                        </div>
                      )}
                      {ev.recommendation && (
                        <div style={{ fontSize: 12, color: '#1e293b', background: '#fff', padding: '8px 10px', borderRadius: 6, marginTop: 6, lineHeight: 1.5 }}>
                          💡 {ev.recommendation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 분석 통계 */}
          {isRealSession && (
            <div style={{ background: '#fff', padding: 24, borderRadius: 20, border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ background: '#fef3c7', color: '#d97706', padding: 6, borderRadius: 8, fontSize: 16 }}>📊</div> 분석 통계
              </h3>
              <ul style={{ paddingLeft: 0, margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.8, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 최종 감정: <strong>{analysisData.analysisResult.final_emotion}</strong> ({(analysisData.analysisResult.final_emotion_score * 100).toFixed(1)}%)</li>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 음향 감정: {analysisData.analysisResult.acoustic_emotion}</li>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 상담사 발화 비율: {(analysisData.analysisResult.counselor_talk_ratio * 100).toFixed(1)}%</li>
                <li style={{ display: 'flex', gap: 10 }}><span style={{ color: '#10b981' }}>•</span> 세그먼트 수: {analysisData.analysisResult.segments.length}개</li>
              </ul>
            </div>
          )}

          {/* AI 요약 (LLM 생성) */}
          {summary && (
            <div style={{ background: '#fff', padding: 24, borderRadius: 20, border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ background: '#eff6ff', color: '#3b82f6', padding: 6, borderRadius: 8, fontSize: 16 }}>✨</div> AI 요약
              </h3>

              {summary.headline && (
                <div style={{ background: '#eff6ff', padding: '12px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#1e40af', marginBottom: 16, lineHeight: 1.5 }}>
                  {summary.headline}
                </div>
              )}

              {summary.main_topics?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>📌 주요 주제</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {summary.main_topics.map((t, i) => (
                      <span key={i} style={{ fontSize: 11, padding: '3px 10px', background: '#f1f5f9', borderRadius: 12, color: '#475569' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {summary.client_issues?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>🔴 호소 문제</div>
                  <ul style={{ paddingLeft: 16, margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                    {summary.client_issues.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}

              {summary.counselor_approach && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>🍀 상담사 개입</div>
                  <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>{summary.counselor_approach}</div>
                </div>
              )}

              {summary.emotional_flow && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>📈 정서 흐름</div>
                  <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>{summary.emotional_flow}</div>
                </div>
              )}

              {summary.action_items?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>✅ 다음 회기</div>
                  <ul style={{ paddingLeft: 16, margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                    {summary.action_items.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 오른쪽: STT 인터랙티브 기록지 (모던 채팅 UI) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '40px', background: '#f8fafc' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {transcript.map((chat) => {
              const isCounselor = chat.speaker === 'counselor';
              const isActive = activePlayId === chat.id;
              const rupture = segmentRuptureMap[chat.id];
              const isRuptureWithdrawal = rupture?.rupture_type === 'withdrawal';
              const isRuptureConfrontation = rupture?.rupture_type === 'confrontation';
              const ruptureColor = isRuptureWithdrawal ? '#f59e0b' : (isRuptureConfrontation ? '#ef4444' : null);

              return (
                <div id={`segment-${chat.id}`} key={chat.id} style={{ display: 'flex', flexDirection: isCounselor ? 'row-reverse' : 'row', gap: 16, alignItems: 'flex-start' }}>
                  {/* 프로필 아이콘 */}
                  <div style={{ width: 44, height: 44, borderRadius: 22, background: isCounselor ? '#fff' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 2px 5px rgba(0,0,0,0.05)', border: isCounselor ? '1px solid #e2e8f0' : 'none', flexShrink: 0 }}>
                    {isCounselor ? '🍀' : '👤'}
                  </div>

                  {/* 대화 내용 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isCounselor ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, flexDirection: isCounselor ? 'row-reverse' : 'row' }}>
                      <span>{isCounselor ? '상담사' : '내담자'}</span>
                      {isRealSession && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleSpeaker(chat.id); }}
                          title="화자 변경"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: '#94a3b8', padding: '2px 4px', borderRadius: 4 }}
                          onMouseOver={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#475569'; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
                        >
                          🔄
                        </button>
                      )}
                      <span style={{ display: 'inline-block', padding: '4px 8px', background: '#e2e8f0', borderRadius: 12, fontSize: 11, color: '#475569' }}>⏱️ {chat.time}</span>
                      {ruptureColor && (
                        <span title={`${rupture.rupture_type} (강도 ${rupture.intensity})`} style={{ padding: '3px 8px', background: ruptureColor, color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                          {isRuptureWithdrawal ? '🟡 철수' : '🔴 대립'}
                        </span>
                      )}
                    </div>
                    <div
                      onClick={() => onSegmentClick(chat)}
                      style={{
                        padding: '16px 20px', fontSize: 15, lineHeight: 1.6, cursor: 'pointer',
                        background: isActive ? '#fef08a' : (isCounselor ? '#fff' : '#10b981'),
                        color: isActive ? '#854d0e' : (isCounselor ? '#1e293b' : '#fff'),
                        border: ruptureColor
                          ? `2px solid ${ruptureColor}`
                          : (isActive ? '1px solid #fde047' : (isCounselor ? '1px solid #e2e8f0' : '1px solid #059669')),
                        borderRadius: 20,
                        borderTopRightRadius: isCounselor ? 4 : 20,
                        borderTopLeftRadius: !isCounselor ? 4 : 20,
                        boxShadow: isActive ? '0 0 0 4px rgba(253, 224, 71, 0.3)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        transition: 'all 0.2s ease',
                        letterSpacing: '-0.3px',
                        position: 'relative',
                      }}
                    >
                      {chat.text}
                      {bookmarks.includes(chat.id) && (
                        <span title="북마크" style={{ position: 'absolute', top: -8, [isCounselor ? 'left' : 'right']: -8, fontSize: 16 }}>🔖</span>
                      )}
                    </div>

                    {/* 메모 영역 */}
                    {isRealSession && (editingNoteIdx === chat.id ? (
                      <div style={{ marginTop: 8, width: '100%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: isCounselor ? 'flex-end' : 'flex-start' }}>
                        <textarea
                          autoFocus
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="이 발화에 대한 메모..."
                          style={{ width: '100%', minHeight: 60, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={handleSaveNote} style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>저장</button>
                          <button onClick={() => { setEditingNoteIdx(null); setNoteDraft(""); }} style={{ padding: '6px 14px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>취소</button>
                        </div>
                      </div>
                    ) : notes[chat.id]?.text ? (
                      <div onClick={() => startEditNote(chat.id)} style={{ marginTop: 6, padding: '8px 12px', background: '#fef3c7', borderLeft: '3px solid #f59e0b', borderRadius: 8, fontSize: 13, color: '#78350f', cursor: 'pointer', maxWidth: '100%', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>📝 {notes[chat.id].text}</span>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteNote(chat.id); }} style={{ background: 'transparent', border: 'none', color: '#92400e', cursor: 'pointer', fontSize: 12 }}>✕</button>
                      </div>
                    ) : null)}

                    {/* 발화별 액션 버튼 (호버 시) */}
                    {isRealSession && editingNoteIdx !== chat.id && !notes[chat.id] && (
                      <div style={{ marginTop: 4, display: 'flex', gap: 4, opacity: 0.4, transition: 'opacity 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.opacity = 1} onMouseLeave={(e) => e.currentTarget.style.opacity = 0.4}>
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditNote(chat.id); }}
                          title="메모 추가"
                          style={{ background: 'transparent', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 11, padding: '2px 8px', borderRadius: 6, color: '#64748b' }}
                        >📝 메모</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleBookmark(chat.id); }}
                          title={bookmarks.includes(chat.id) ? "북마크 해제" : "북마크"}
                          style={{ background: 'transparent', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 11, padding: '2px 8px', borderRadius: 6, color: '#64748b' }}
                        >🔖 {bookmarks.includes(chat.id) ? '해제' : '북마크'}</button>
                      </div>
                    )}
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
