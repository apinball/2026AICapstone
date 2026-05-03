import React from 'react';

export default function CounselorFeedback({ navigate }) {
  return (
    <div style={{ height: '100vh', width: '100%', overflowY: 'auto', background: '#f8fafc', padding: '40px 48px', boxSizing: 'border-box', fontFamily: "'Pretendard', sans-serif" }}>
      
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 }}>
          <button onClick={() => navigate('sessions')} style={{ background: '#fff', border: '1px solid #e2e8f0', width: 44, height: 44, borderRadius: '50%', fontSize: 20, cursor: 'pointer', color: '#475569', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', transition: 'all 0.2s' }} onMouseOver={e=>e.target.style.background='#f1f5f9'} onMouseOut={e=>e.target.style.background='#fff'}>←</button>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.5px' }}>📊 AI 메타 인지 피드백</h1>
            <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 15, fontWeight: 500 }}>내 상담 패턴을 분석하고 더 나은 방향을 모색해 보세요.</p>
          </div>
        </header>

        <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
          {/* 말하기 비율 도넛 차트 */}
          <div style={{ flex: 1, background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', padding: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: '0 0 24px 0', letterSpacing: '-0.3px' }}>🗣️ 대화 점유율</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
               <div style={{ position: 'relative', width: 140, height: 140, borderRadius: '50%', background: 'conic-gradient(#10b981 0% 30%, #e2e8f0 30% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.05)' }}>
                 <div style={{ width: 100, height: 100, background: '#fff', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                   <span style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>30%</span>
                   <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>상담사</span>
                 </div>
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 14, height: 14, background: '#10b981', borderRadius: 4 }}/> <span style={{ fontSize: 15, fontWeight: 600, color: '#334155' }}>상담사</span></div>
                   <span style={{ fontWeight: 700 }}>30%</span>
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 14, height: 14, background: '#e2e8f0', borderRadius: 4 }}/> <span style={{ fontSize: 15, fontWeight: 600, color: '#334155' }}>내담자</span></div>
                   <span style={{ fontWeight: 700 }}>70%</span>
                 </div>
                 <div style={{ padding: '12px 16px', background: '#ecfdf5', borderRadius: 12, border: '1px solid #a7f3d0', marginTop: 8 }}>
                   <p style={{ fontSize: 13, color: '#047857', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>💡 이상적인 비율입니다!<br/>경청 위주의 훌륭한 상담이 진행되었습니다.</p>
                 </div>
               </div>
            </div>
          </div>

          {/* AI 조언 리포트 */}
          <div style={{ flex: 1.5, background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', padding: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: '0 0 24px 0', letterSpacing: '-0.3px' }}>💡 AI 상담 스킬 분석</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Positive */}
              <div style={{ background: '#f8fafc', padding: 20, borderRadius: 16, borderLeft: '4px solid #3b82f6' }}>
                <strong style={{ fontSize: 15, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{fontSize: 18}}>👍</span> 공감적 반응 (Positive)</strong>
                <span style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, display: 'block' }}>내담자가 불안을 호소할 때 "많이 불안하셨겠어요"와 같이 즉각적인 감정 반영을 3회 사용하여 라포(Rapport) 형성에 크게 기여했습니다.</span>
              </div>
              {/* Needs Improvement */}
              <div style={{ background: '#fff1f2', padding: 20, borderRadius: 16, borderLeft: '4px solid #f43f5e' }}>
                <strong style={{ fontSize: 15, color: '#881337', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{fontSize: 18}}>🌱</span> 개선 제안 (Needs Improvement)</strong>
                <span style={{ fontSize: 14, color: '#9f1239', lineHeight: 1.6, display: 'block' }}>15분~20분 구간에서 닫힌 질문("어제는 잘 주무셨나요?")이 연속으로 2회 사용되었습니다. 개방형 질문("어젯밤은 어떠셨나요?")으로 유도하면 더 깊은 대화를 이끌어낼 수 있습니다.</span>
              </div>
            </div>
          </div>
        </div>

        {/* 감정 타임라인 (트렌디한 바 차트) */}
        <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', padding: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: '0 0 32px 0', letterSpacing: '-0.3px' }}>📈 내담자 감정 긍정 지수 추이</h3>
          <div style={{ height: 180, display: 'flex', alignItems: 'flex-end', gap: 12, paddingBottom: 24, borderBottom: '2px solid #f1f5f9' }}>
            {/* 세련된 차트 막대들 */}
            {[40, 30, 20, 50, 60, 75, 80, 65, 85, 90, 80, 95].map((height, i) => (
              <div key={i} style={{ flex: 1, position: 'relative', height: `${height}%`, background: height > 70 ? 'linear-gradient(180deg, #3b82f6 0%, #93c5fd 100%)' : 'linear-gradient(180deg, #94a3b8 0%, #cbd5e1 100%)', borderRadius: 8, transition: 'height 0.5s ease', cursor: 'pointer', opacity: 0.9 }} onMouseOver={e=>e.target.style.opacity=1} onMouseOut={e=>e.target.style.opacity=0.9} title={`긍정 지수: ${height}%`}>
                <div style={{ position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 600, color: height > 70 ? '#2563eb' : '#64748b' }}>{height}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 13, color: '#64748b', fontWeight: 600 }}>
            <span style={{ padding: '6px 12px', background: '#f8fafc', borderRadius: 8 }}>상담 시작 (우울/불안)</span>
            <span style={{ padding: '6px 12px', background: '#f8fafc', borderRadius: 8 }}>중반부 (자기 개방)</span>
            <span style={{ padding: '6px 12px', background: '#eff6ff', color: '#2563eb', borderRadius: 8 }}>상담 종료 (안정/희망)</span>
          </div>
        </div>

      </div>
    </div>
  );
}
