import React, { useState, useEffect } from 'react';
import { fetchSessions, fetchSession } from '../api/client';

const EMOTION_VALENCE = {
  joy: 0.9, surprise: 0.6, neutral: 0.5,
  sadness: 0.25, fear: 0.2, disgust: 0.15, anger: 0.1, sarcasm: 0.3,
};

export default function CounselorFeedback({ navigate, session: initialSession }) {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(initialSession?.id ?? null);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchSessions()
      .then(list => {
        const completed = list.filter(s => s.status === 'done' && typeof s.id === 'string');
        setSessions(completed);
        if (!selectedId && completed.length > 0) {
          setSelectedId(completed[0].id);
        }
      })
      .catch(err => console.warn('세션 목록 로드 실패:', err.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetchSession(selectedId).then(setData).catch(err => console.warn('세션 로드 실패:', err.message));
  }, [selectedId]);

  const result = data?.analysisResult;
  const segments = result?.segments ?? [];
  const ruptureEvents = data?.ruptureEvents ?? [];
  const summary = data?.summary;

  // 대화 점유율
  const counselorRatio = result?.counselor_talk_ratio ?? 0;
  const counselorPercent = Math.round(counselorRatio * 100);
  const clientPercent = 100 - counselorPercent;

  // 비율 평가
  const ratioFeedback = (() => {
    if (counselorPercent < 25) return { ok: true, msg: "경청 위주의 훌륭한 상담이 진행되었습니다." };
    if (counselorPercent <= 40) return { ok: true, msg: "이상적인 비율입니다. 내담자가 충분히 표현할 수 있는 환경을 제공했습니다." };
    if (counselorPercent <= 50) return { ok: true, msg: "적절한 수준입니다. 약간 더 경청 비중을 늘려보세요." };
    return { ok: false, msg: "상담사 발화량이 다소 많습니다. 내담자가 자기 표현할 시간을 더 주는 것을 고려해 보세요." };
  })();

  // 감정 추이 — segments를 N등분해서 평균 valence 계산
  const buckets = 12;
  const trend = computeEmotionTrend(segments, buckets);

  return (
    <div style={{ height: '100vh', width: '100%', overflowY: 'auto', background: '#f8fafc', padding: '40px 48px', boxSizing: 'border-box', fontFamily: "'Pretendard', sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
          <button onClick={() => navigate('sessions')} style={{ background: '#fff', border: '1px solid #e2e8f0', width: 44, height: 44, borderRadius: '50%', fontSize: 20, cursor: 'pointer', color: '#475569', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>←</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.5px' }}>📊 AI 메타 인지 피드백</h1>
            <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 15, fontWeight: 500 }}>내 상담 패턴을 분석하고 더 나은 방향을 모색해 보세요.</p>
          </div>
          {sessions.length > 0 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', cursor: 'pointer' }}
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.name} · {s.date}</option>
              ))}
            </select>
          )}
        </header>

        {!data && (
          <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
            {sessions.length === 0 ? "분석 완료된 세션이 없습니다." : "세션 데이터를 불러오는 중..."}
          </div>
        )}

        {data && !result && (
          <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
            이 세션은 아직 분석되지 않았습니다.
          </div>
        )}

        {data && result && (
          <>
            <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
              {/* 대화 점유율 */}
              <div style={{ flex: 1, background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', padding: 32 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: '0 0 24px 0' }}>🗣️ 대화 점유율</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
                  <div style={{ position: 'relative', width: 140, height: 140, borderRadius: '50%', background: `conic-gradient(#10b981 0% ${counselorPercent}%, #e2e8f0 ${counselorPercent}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 100, height: 100, background: '#fff', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{counselorPercent}%</span>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>상담사</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 14, height: 14, background: '#10b981', borderRadius: 4 }}/> <span style={{ fontSize: 14, fontWeight: 600 }}>상담사</span></div>
                      <span style={{ fontWeight: 700 }}>{counselorPercent}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 14, height: 14, background: '#e2e8f0', borderRadius: 4 }}/> <span style={{ fontSize: 14, fontWeight: 600 }}>내담자</span></div>
                      <span style={{ fontWeight: 700 }}>{clientPercent}%</span>
                    </div>
                    <div style={{ padding: '12px 14px', background: ratioFeedback.ok ? '#ecfdf5' : '#fef3c7', borderRadius: 10, border: `1px solid ${ratioFeedback.ok ? '#a7f3d0' : '#fcd34d'}`, marginTop: 4 }}>
                      <p style={{ fontSize: 12, color: ratioFeedback.ok ? '#047857' : '#92400e', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>{ratioFeedback.ok ? '💡' : '⚠️'} {ratioFeedback.msg}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI 상담 스킬 분석 */}
              <div style={{ flex: 1.5, background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', padding: 32 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: '0 0 24px 0' }}>💡 AI 상담 스킬 분석</h3>
                {summary?.counselor_approach ? (
                  <div style={{ background: '#f8fafc', padding: 20, borderRadius: 14, borderLeft: '4px solid #3b82f6', marginBottom: 14 }}>
                    <strong style={{ fontSize: 14, color: '#1e293b', display: 'block', marginBottom: 8 }}>👍 상담사 개입 방식</strong>
                    <span style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>{summary.counselor_approach}</span>
                  </div>
                ) : (
                  <div style={{ background: '#f8fafc', padding: 16, borderRadius: 10, color: '#94a3b8', fontSize: 13, marginBottom: 14 }}>
                    상세 분석을 보려면 WorkspaceEditor에서 "✨ AI 요약"을 먼저 실행하세요.
                  </div>
                )}

                {ruptureEvents.length > 0 ? (
                  <div style={{ background: '#fff1f2', padding: 20, borderRadius: 14, borderLeft: '4px solid #f43f5e' }}>
                    <strong style={{ fontSize: 14, color: '#881337', display: 'block', marginBottom: 8 }}>🌱 주의 필요 — 치료 동맹 균열 {ruptureEvents.length}건</strong>
                    {ruptureEvents.slice(0, 2).map((ev, i) => (
                      <div key={i} style={{ fontSize: 13, color: '#9f1239', lineHeight: 1.6, marginTop: 4 }}>
                        • <strong>{ev.rupture_type === 'withdrawal' ? '철수형' : '대립형'}</strong> (강도 {ev.intensity}/10): {ev.recommendation}
                      </div>
                    ))}
                  </div>
                ) : summary && (
                  <div style={{ background: '#ecfdf5', padding: 16, borderRadius: 10, color: '#047857', fontSize: 13, fontWeight: 600 }}>
                    ✓ 감지된 치료 동맹 균열 없음 — 안정적인 라포가 유지되었습니다.
                  </div>
                )}
              </div>
            </div>

            {/* 감정 추이 차트 */}
            <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', padding: 32 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: '0 0 32px 0' }}>📈 내담자 감정 긍정 지수 추이</h3>
              {trend.length === 0 ? (
                <div style={{ padding: 30, color: '#94a3b8', textAlign: 'center' }}>분석 가능한 발화 데이터가 부족합니다.</div>
              ) : (
                <>
                  <div style={{ height: 180, display: 'flex', alignItems: 'flex-end', gap: 12, paddingBottom: 24, borderBottom: '2px solid #f1f5f9' }}>
                    {trend.map((v, i) => {
                      const heightPct = Math.round(v * 100);
                      const isHigh = heightPct >= 60;
                      return (
                        <div
                          key={i}
                          title={`${heightPct}%`}
                          style={{
                            flex: 1, height: `${Math.max(heightPct, 5)}%`, position: 'relative',
                            background: isHigh ? 'linear-gradient(180deg, #3b82f6, #93c5fd)' : 'linear-gradient(180deg, #94a3b8, #cbd5e1)',
                            borderRadius: 8, transition: 'all 0.4s ease', cursor: 'pointer',
                          }}
                        >
                          <div style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 600, color: isHigh ? '#2563eb' : '#64748b' }}>{heightPct}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                    <span style={{ padding: '6px 10px', background: '#f8fafc', borderRadius: 8 }}>상담 시작</span>
                    <span style={{ padding: '6px 10px', background: '#f8fafc', borderRadius: 8 }}>중반부</span>
                    <span style={{ padding: '6px 10px', background: '#eff6ff', color: '#2563eb', borderRadius: 8 }}>상담 종료</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function computeEmotionTrend(segments, buckets) {
  const clientSegs = segments.filter(s => s.speaker === 'client');
  if (clientSegs.length < buckets) return [];

  const bucketSize = clientSegs.length / buckets;
  const trend = [];
  for (let i = 0; i < buckets; i++) {
    const slice = clientSegs.slice(Math.floor(i * bucketSize), Math.floor((i + 1) * bucketSize));
    if (slice.length === 0) {
      trend.push(0.5);
      continue;
    }
    const avgValence = slice.reduce((sum, s) => sum + (EMOTION_VALENCE[s.text_emotion] ?? 0.5), 0) / slice.length;
    trend.push(avgValence);
  }
  return trend;
}
