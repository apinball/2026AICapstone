import React, { useState } from 'react';

// 공통 로고 컴포넌트
function CloverLogo({ size = 48 }) {
  return (
    <div style={{ fontSize: size, marginBottom: 16 }}>🍀</div>
  );
}

export default function Landing({ onLogin }) {
  // 모드 상태: 'login' 또는 'signup'
  const [mode, setMode] = useState('login');
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // 회원가입일 때는 입력한 이름을, 로그인일 때는 기존 저장된 이름을 사용
    const finalName = mode === 'signup' ? name : (localStorage.getItem('counselor_name') || "이예온");
    onLogin(finalName);
  };

  return (
    <div style={{
      width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0fdf4 0%, #e2e8f0 100%)',
      fontFamily: "'Pretendard', sans-serif"
    }}>
      
      <div style={{
        background: '#fff', padding: '50px 40px', borderRadius: 24,
        boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
        width: '100%', maxWidth: 380, textAlign: 'center'
      }}>
        
        <CloverLogo />
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Clover AI</h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 32px 0', lineHeight: 1.5 }}>
          상담사의 업무를 돕는<br/>스마트한 분석 플랫폼
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 회원가입 모드일 때만 이름 입력창 표시 */}
          {mode === 'signup' && (
            <input 
              type="text" 
              placeholder="상담사 이름" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={inputStyle} 
            />
          )}
          
          <input 
            type="email" 
            placeholder="이메일 주소" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle} 
          />
          
          <input 
            type="password" 
            placeholder="비밀번호" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle} 
          />

          <button type="submit" style={buttonStyle}>
            {mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>

        {/* 하단 모드 전환 링크 */}
        <div style={{ marginTop: 24 }}>
          {mode === 'login' ? (
            <p style={{ fontSize: 13, color: '#64748b' }}>
              아직 계정이 없으신가요?{' '}
              <span 
                onClick={() => setMode('signup')}
                style={linkStyle}
                onMouseOver={handleMouseOver}
                onMouseOut={handleMouseOut}
              >
                회원가입
              </span>
            </p>
          ) : (
            <p style={{ fontSize: 13, color: '#64748b' }}>
              이미 계정이 있으신가요?{' '}
              <span 
                onClick={() => setMode('login')}
                style={linkStyle}
                onMouseOver={handleMouseOver}
                onMouseOut={handleMouseOut}
              >
                로그인
              </span>
            </p>
          )}
        </div>

      </div>
    </div>
  );
}

// --- 인라인 스타일 정의 ---

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
  background: '#fcfcfc'
};

const buttonStyle = {
  width: '100%',
  padding: '16px',
  background: '#10b981',
  color: '#fff',
  border: 'none',
  borderRadius: '12px',
  fontSize: '16px',
  fontWeight: '700',
  cursor: 'pointer',
  marginTop: '12px',
  transition: 'all 0.2s'
};

const linkStyle = {
  color: '#10b981',
  fontWeight: '600',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: '6px',
  transition: 'all 0.2s',
  marginLeft: '4px'
};

// 호버 이벤트 핸들러
const handleMouseOver = (e) => {
  e.target.style.background = '#f0fdf4'; // 옅은 초록색 배경
  e.target.style.color = '#059669'; // 글자색 좀 더 진하게
};

const handleMouseOut = (e) => {
  e.target.style.background = 'transparent';
  e.target.style.color = '#10b981';
};
