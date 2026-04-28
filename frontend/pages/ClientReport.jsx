import React from 'react';

export default function ClientReport({ navigate }) {
  return (
    <div style={{ height: '100vh', width: '100%', overflowY: 'auto', background: '#f1f5f9', padding: '40px 20px', boxSizing: 'border-box', fontFamily: "'Pretendard', sans-serif" }}>
      
      {/* 상단 컨트롤 바 */}
      <div style={{ maxWidth: 840, margin: '0 auto 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => navigate('sessions')} style={{ background: 'none', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 20 }}>←</span> 돌아가기
        </button>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{ padding: '10px 18px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#334155', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'background 0.2s' }} onMouseOver={e=>e.target.style.background='#f8fafc'} onMouseOut={e=>e.target.style.background='#fff'}>🔗 링크 복사</button>
          <button style={{ padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)', transition: 'all 0.2s' }} onClick={() => alert("PDF 다운로드가 시작됩니다.")} onMouseOver={e=>{e.target.style.transform='translateY(-1px)'; e.target.style.boxShadow='0 6px 16px rgba(37, 99, 235, 0.4)'}} onMouseOut={e=>{e.target.style.transform='translateY(0)'; e.target.style.boxShadow='0 4px 12px rgba(37, 99, 235, 0.3)'}}>📥 PDF 내보내기</button>
        </div>
      </div>

      {/* 📄 A4 용지 스타일 전문 리포트 */}
      <div style={{ maxWidth: 840, margin: '0 auto 60px', background: '#fff', padding: '80px 100px', borderRadius: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.08)', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
        
        {/* 상단 포인트 라인 */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 8, background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)' }} />

        {/* 워터마크 로고 (배경) */}
        <div style={{ position: 'absolute', top: 60, right: 80, fontSize: 120, opacity: 0.03, pointerEvents: 'none' }}>🍀</div>

        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          <span style={{ display: 'inline-block', padding: '6px 16px', background: '#f1f5f9', color: '#475569', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 16, letterSpacing: '1px' }}>CLOVER AI REPORT</span>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', margin: '0 0 12px 0', letterSpacing: '-1px' }}>상담 요약 리포트</h1>
          <p style={{ fontSize: 15, color: '#64748b', margin: 0, fontWeight: 500 }}>AI가 객관적으로 분석한 4회차 상담 결과입니다.</p>
        </div>

        <div style={{ borderTop: '2px solid #0f172a', borderBottom: '1px solid #e2e8f0', padding: '20px 0', marginBottom: 48, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#1e293b' }}>
          <div><strong style={{ color: '#64748b', marginRight: 8 }}>내담자</strong> <span style={{ fontWeight: 600 }}>김지우 님</span></div>
          <div><strong style={{ color: '#64748b', marginRight: 8 }}>상담 일시</strong> <span style={{ fontWeight: 600 }}>2026. 04. 17</span></div>
          <div><strong style={{ color: '#64748b', marginRight: 8 }}>담당 상담사</strong> <span style={{ fontWeight: 600 }}>이예온</span></div>
        </div>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 19, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, fontWeight: 700 }}>
            <span style={{ background: '#ecfdf5', color: '#10b981', padding: 8, borderRadius: 10, fontSize: 16 }}>📌</span> 이번 상담의 핵심 주제
          </h2>
          <div style={{ background: '#f8fafc', padding: 24, borderRadius: 12, fontSize: 16, color: '#334155', lineHeight: 1.8, border: '1px solid #f1f5f9' }}>
            지우님은 현재 <strong style={{ color: '#0f172a', background: '#fef08a', padding: '2px 6px', borderRadius: 4 }}>'타인과의 비교로 인한 불안'</strong>과 이로 파생된 <strong style={{ color: '#0f172a' }}>'수면 장애'</strong>를 주요 어려움으로 겪고 있습니다. 동기들의 취업 준비 과정을 보며 상대적 박탈감을 느끼고 있으나, 이를 극복하고자 상담에 적극적으로 참여하는 긍정적인 회복 의지를 보이고 있습니다.
          </div>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 19, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, fontWeight: 700 }}>
            <span style={{ background: '#eff6ff', color: '#3b82f6', padding: 8, borderRadius: 10, fontSize: 16 }}>📈</span> 감정 및 상태 변화 추이
          </h2>
          <ul style={{ paddingLeft: 0, margin: 0, fontSize: 16, color: '#334155', lineHeight: 2, listStyle: 'none' }}>
            <li style={{ display: 'flex', gap: 12, marginBottom: 12 }}><span style={{ color: '#3b82f6', fontWeight: 800 }}>01.</span> <div><strong>상담 초반:</strong> 비교적 차분했으나, 진로 이야기를 시작하며 호흡이 빨라지고 불안도를 높게 보임.</div></li>
            <li style={{ display: 'flex', gap: 12, marginBottom: 12 }}><span style={{ color: '#3b82f6', fontWeight: 800 }}>02.</span> <div><strong>상담 중반:</strong> 본인의 감정을 억누르지 않고 솔직하게 표현(자기 개방)하며 감정적 해소를 경험함.</div></li>
            <li style={{ display: 'flex', gap: 12 }}><span style={{ color: '#3b82f6', fontWeight: 800 }}>03.</span> <div><strong>상담 후반:</strong> 불안의 실체를 객관화하고, 스스로 할 수 있는 작은 목표를 세우며 안정을 되찾음.</div></li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: 19, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, fontWeight: 700 }}>
            <span style={{ background: '#fdf2f8', color: '#db2777', padding: 8, borderRadius: 10, fontSize: 16 }}>🎯</span> 다음 주까지의 작은 목표 (Action Item)
          </h2>
          <div style={{ borderLeft: '4px solid #10b981', paddingLeft: 20, fontSize: 16, color: '#475569', lineHeight: 1.8, background: '#fafafa', padding: '16px 20px', borderRadius: '0 12px 12px 0' }}>
            <div style={{ marginBottom: 8 }}>✓ 잠들기 30분 전에는 스마트폰을 멀리하고 심호흡 5번 하기</div>
            <div>✓ 남이 아닌 '과거의 나'와 비교했을 때 성장한 점 1가지 매일 기록하기</div>
          </div>
        </section>

        <div style={{ textAlign: 'center', marginTop: 80, paddingTop: 40, borderTop: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
          본 리포트는 Clover AI 분석을 기반으로 작성되었으며,<br />내담자의 객관적 상태 인지를 돕기 위한 참고 자료입니다.
        </div>

      </div>
    </div>
  );
}
