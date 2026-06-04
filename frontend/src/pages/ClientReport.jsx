import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { fetchSessions, fetchSession, triggerSummary } from '../api/client';

export default function ClientReport({ navigate, counselorName, session: initialSession }) {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(initialSession?.id ?? null);
  const [data, setData] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchSessions()
      .then(list => {
        const completed = list.filter(s => s.status === 'done' && typeof s.id === 'string');
        setSessions(completed);
        if (!selectedId && completed.length > 0) setSelectedId(completed[0].id);
      })
      .catch(err => console.warn('세션 목록 로드 실패:', err.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetchSession(selectedId).then(setData).catch(err => console.warn(err.message));
  }, [selectedId]);

  const handleGenerate = async () => {
    if (!selectedId) return;
    setGenerating(true);
    try {
      const before = await fetchSession(selectedId);
      const prevTs = before?.summaryGeneratedAt;
      await triggerSummary(selectedId);

      // 최대 20분 폴링
      for (let i = 0; i < 240; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const updated = await fetchSession(selectedId);
        if (updated.summaryGeneratedAt && updated.summaryGeneratedAt !== prevTs) {
          setData(updated);
          return;
        }
      }
      throw new Error("처리 시간 초과 (페이지 새로고침으로 확인 가능)");
    } catch (err) {
      alert(`요약 생성 실패: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const summary = data?.summary;
  const distortions = data?.distortions ?? [];
  const worksheets = data?.worksheets ?? [];
  const segments = data?.analysisResult?.segments ?? [];
  const counselorRatio = data?.analysisResult?.counselor_talk_ratio ?? null;
  const totalSegments = segments.length;
  const dateLabel = data?.createdAt ? new Date(data.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';

  const DISTORTION_LABELS_KO = {
    all_or_nothing: "흑백사고", overgeneralization: "과잉일반화", mental_filter: "정신적 필터링",
    disqualifying_positive: "긍정 무시", jumping_to_conclusions: "결론 도약", catastrophizing: "재앙화",
    minimization: "축소화", emotional_reasoning: "감정적 추론", should_statements: "당위적 사고",
    labeling: "낙인찍기", personalization: "개인화",
  };
  const distortionCounts = {};
  distortions.forEach(d => (d.distortion_types || []).forEach(t => {
    distortionCounts[t] = (distortionCounts[t] || 0) + 1;
  }));

  // 감정 추이 (내담자 발화 valence 12등분)
  const EMOTION_VALENCE = { joy: 0.9, surprise: 0.6, neutral: 0.5, sadness: 0.25, fear: 0.2, disgust: 0.15, anger: 0.1, sarcasm: 0.3 };
  const clientSegs = segments.filter(s => s.speaker === 'client');
  const trend = [];
  if (clientSegs.length >= 12) {
    const bucket = clientSegs.length / 12;
    for (let i = 0; i < 12; i++) {
      const slice = clientSegs.slice(Math.floor(i * bucket), Math.floor((i + 1) * bucket));
      const avg = slice.length ? slice.reduce((s, x) => s + (EMOTION_VALENCE[x.text_emotion] ?? 0.5), 0) / slice.length : 0.5;
      trend.push(avg);
    }
  }

  const reportRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // 여러 페이지 분할
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const filename = `상담리포트_${dateLabel.replace(/\./g, "-").replace(/\s/g, "")}.pdf`;
      pdf.save(filename);
    } catch (err) {
      alert(`PDF 생성 실패: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ height: '100vh', width: '100%', overflowY: 'auto', background: '#f1f5f9', padding: '40px 20px', boxSizing: 'border-box', fontFamily: "'Pretendard', sans-serif" }}>

      {/* 컨트롤 바 */}
      <div style={{ maxWidth: 840, margin: '0 auto 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('sessions')} style={{ background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 20 }}>←</span> 돌아가기
        </button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {sessions.length > 0 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', cursor: 'pointer' }}
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.name} · {s.date}</option>
              ))}
            </select>
          )}
          {data && !summary && (
            <button onClick={handleGenerate} disabled={generating} style={{ padding: '10px 18px', background: generating ? '#94a3b8' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, cursor: generating ? 'wait' : 'pointer', fontSize: 14, fontWeight: 600 }}>
              {generating ? '⟳ 생성 중...' : '✨ AI 요약 생성'}
            </button>
          )}
          <button
            onClick={handleDownloadPdf}
            disabled={downloading || !summary}
            title={!summary ? "AI 요약을 먼저 생성하세요" : "PDF로 저장"}
            style={{ padding: '10px 18px', background: downloading ? '#94a3b8' : '#fff', border: '1px solid #cbd5e1', borderRadius: 10, cursor: (downloading || !summary) ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, color: '#334155', opacity: !summary ? 0.5 : 1 }}
          >
            {downloading ? '⟳ 생성 중...' : '📥 PDF'}
          </button>
        </div>
      </div>

      {/* A4 리포트 */}
      <div ref={reportRef} style={{ maxWidth: 840, margin: '0 auto 60px', background: '#fff', padding: '60px 80px', borderRadius: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.08)', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 8, background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)' }} />
        <div style={{ position: 'absolute', top: 60, right: 80, fontSize: 120, opacity: 0.03, pointerEvents: 'none' }}>🍀</div>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <span style={{ display: 'inline-block', padding: '6px 16px', background: '#f1f5f9', color: '#475569', borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 14, letterSpacing: '1px' }}>CLOVER AI REPORT</span>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', letterSpacing: '-1px' }}>상담 요약 리포트</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0, fontWeight: 500 }}>AI가 객관적으로 분석한 상담 결과입니다.</p>
        </div>

        <div style={{ borderTop: '2px solid #0f172a', borderBottom: '1px solid #e2e8f0', padding: '16px 0', marginBottom: 36, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#1e293b', flexWrap: 'wrap', gap: 12 }}>
          <div><strong style={{ color: '#64748b', marginRight: 6 }}>내담자</strong> <span style={{ fontWeight: 600 }}>[내담자]</span></div>
          <div><strong style={{ color: '#64748b', marginRight: 6 }}>상담 일시</strong> <span style={{ fontWeight: 600 }}>{dateLabel}</span></div>
          <div><strong style={{ color: '#64748b', marginRight: 6 }}>담당 상담사</strong> <span style={{ fontWeight: 600 }}>{counselorName ?? '-'}</span></div>
        </div>

        {!data && (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
            {sessions.length === 0 ? "분석 완료된 세션이 없습니다." : "세션을 불러오는 중..."}
          </div>
        )}

        {data && !summary && (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
            아직 AI 요약이 생성되지 않았습니다.<br />
            상단의 <strong style={{ color: '#3b82f6' }}>"✨ AI 요약 생성"</strong> 버튼을 눌러 분석하세요.
          </div>
        )}

        {summary && (
          <>
            {summary.headline && (
              <section style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, fontWeight: 700 }}>
                  <span style={{ background: '#ecfdf5', color: '#10b981', padding: 8, borderRadius: 10, fontSize: 14 }}>📌</span> 이번 상담의 핵심
                </h2>
                <div style={{ background: '#f8fafc', padding: 22, borderRadius: 12, fontSize: 15, color: '#334155', lineHeight: 1.7, border: '1px solid #f1f5f9' }}>
                  {summary.headline}
                </div>
              </section>
            )}

            {summary.main_topics?.length > 0 && (
              <section style={{ marginBottom: 36 }}>
                <h2 style={{ fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontWeight: 700 }}>
                  <span style={{ background: '#fef3c7', color: '#d97706', padding: 8, borderRadius: 10, fontSize: 14 }}>💬</span> 주요 주제
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {summary.main_topics.map((t, i) => (
                    <span key={i} style={{ fontSize: 13, padding: '6px 14px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 16, fontWeight: 600 }}>{t}</span>
                  ))}
                </div>
              </section>
            )}

            {summary.client_issues?.length > 0 && (
              <section style={{ marginBottom: 36 }}>
                <h2 style={{ fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontWeight: 700 }}>
                  <span style={{ background: '#fee2e2', color: '#dc2626', padding: 8, borderRadius: 10, fontSize: 14 }}>🔴</span> 호소 문제
                </h2>
                <ul style={{ paddingLeft: 0, margin: 0, listStyle: 'none' }}>
                  {summary.client_issues.map((s, i) => (
                    <li key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
                      <span style={{ color: '#dc2626', fontWeight: 800 }}>{String(i + 1).padStart(2, '0')}.</span>
                      <div>{s}</div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {summary.emotional_flow && (
              <section style={{ marginBottom: 36 }}>
                <h2 style={{ fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontWeight: 700 }}>
                  <span style={{ background: '#eff6ff', color: '#3b82f6', padding: 8, borderRadius: 10, fontSize: 14 }}>📈</span> 감정 및 상태 변화
                </h2>
                <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, background: '#f8fafc', padding: 18, borderRadius: 10 }}>
                  {summary.emotional_flow}
                </div>
              </section>
            )}

            {summary.action_items?.length > 0 && (
              <section style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontWeight: 700 }}>
                  <span style={{ background: '#fdf2f8', color: '#db2777', padding: 8, borderRadius: 10, fontSize: 14 }}>🎯</span> 다음까지의 작은 목표
                </h2>
                <div style={{ borderLeft: '4px solid #10b981', background: '#fafafa', padding: '16px 20px', borderRadius: '0 12px 12px 0' }}>
                  {summary.action_items.map((s, i) => (
                    <div key={i} style={{ marginBottom: i === summary.action_items.length - 1 ? 0 : 8, fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
                      ✓ {s}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 분석 통계 */}
            {totalSegments > 0 && (
              <section style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontWeight: 700 }}>
                  <span style={{ background: '#f1f5f9', color: '#64748b', padding: 8, borderRadius: 10, fontSize: 14 }}>📊</span> 분석 통계
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>총 발화 수</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{totalSegments}</div>
                  </div>
                  {counselorRatio !== null && (
                    <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10 }}>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>상담사 발화 비율</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{Math.round(counselorRatio * 100)}%</div>
                    </div>
                  )}
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>인지왜곡 감지</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#db2777' }}>{distortions.length}건</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>CBT 워크시트</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#0891b2' }}>{worksheets.length}건</div>
                  </div>
                </div>
              </section>
            )}

            {/* 감정 추이 차트 */}
            {trend.length > 0 && (
              <section style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontWeight: 700 }}>
                  <span style={{ background: '#eff6ff', color: '#3b82f6', padding: 8, borderRadius: 10, fontSize: 14 }}>📉</span> 정서 흐름 (긍정 지수)
                </h2>
                <div style={{ background: '#f8fafc', padding: 18, borderRadius: 12 }}>
                  <div style={{ height: 120, display: 'flex', alignItems: 'flex-end', gap: 6, paddingBottom: 14, borderBottom: '1.5px solid #e2e8f0' }}>
                    {trend.map((v, i) => {
                      const pct = Math.round(v * 100);
                      return (
                        <div key={i} style={{ flex: 1, height: `${Math.max(pct, 5)}%`, background: pct >= 60 ? '#3b82f6' : '#94a3b8', borderRadius: 4, transition: 'height 0.4s' }} />
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                    <span>상담 시작</span>
                    <span>중반</span>
                    <span>상담 종료</span>
                  </div>
                </div>
              </section>
            )}

            {/* 인지왜곡 분포 */}
            {distortions.length > 0 && (
              <section style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontWeight: 700 }}>
                  <span style={{ background: '#fce7f3', color: '#db2777', padding: 8, borderRadius: 10, fontSize: 14 }}>🧠</span> 자주 나타난 사고 패턴
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(distortionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => {
                    const ko = DISTORTION_LABELS_KO[type] || type;
                    const maxC = Math.max(...Object.values(distortionCounts));
                    return (
                      <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, color: '#334155', minWidth: 110, fontWeight: 600 }}>{ko}</span>
                        <div style={{ flex: 1, height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                          <div style={{ width: `${(count / maxC) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #db2777, #ec4899)', borderRadius: 5 }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#64748b', minWidth: 30, textAlign: 'right', fontWeight: 600 }}>{count}회</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.5 }}>
                  Aaron Beck의 인지치료 이론에 기반해 분석된 11가지 인지왜곡 중 이번 회기에서 나타난 패턴입니다.
                </div>
              </section>
            )}

            {/* CBT 워크시트 (사고 기록지) */}
            {worksheets.length > 0 && (
              <section style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontWeight: 700 }}>
                  <span style={{ background: '#cffafe', color: '#0891b2', padding: 8, borderRadius: 10, fontSize: 14 }}>📋</span> 사고 기록지 (Thought Record)
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {worksheets.map((w, i) => (
                    <div key={i} style={{ background: '#f0fdfa', padding: 16, borderRadius: 10, borderLeft: '4px solid #0891b2' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0e7490', marginBottom: 6 }}>💭 자동적 사고</div>
                      <div style={{ fontSize: 13, color: '#0f172a', marginBottom: 12, fontStyle: 'italic', lineHeight: 1.5 }}>
                        "{w.automatic_thought}"
                      </div>
                      {w.counter_evidence?.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>✓ 반박할 수 있는 증거</div>
                          <ul style={{ paddingLeft: 18, margin: '0 0 12px 0', fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
                            {w.counter_evidence.map((e, j) => <li key={j}>{e}</li>)}
                          </ul>
                        </>
                      )}
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0891b2', marginBottom: 4 }}>⚖ 균형잡힌 사고</div>
                      <div style={{ fontSize: 12, color: '#0f172a', background: '#fff', padding: '10px 12px', borderRadius: 6, lineHeight: 1.5, marginBottom: 8 }}>
                        {w.balanced_thought}
                      </div>
                      {w.emotional_shift && (
                        <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>
                          📉 감정 변화: <strong>{w.emotional_shift}</strong>
                        </div>
                      )}
                      {w.homework_suggestion && (
                        <div style={{ fontSize: 11, color: '#a16207', background: '#fef3c7', padding: '8px 10px', borderRadius: 6, lineHeight: 1.5 }}>
                          🎯 <strong>다음까지 시도해볼 것:</strong> {w.homework_suggestion}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 60, paddingTop: 30, borderTop: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
          본 리포트는 Clover AI 분석을 기반으로 작성되었으며,<br />내담자의 객관적 상태 인지를 돕기 위한 참고 자료입니다.
        </div>
      </div>
    </div>
  );
}
