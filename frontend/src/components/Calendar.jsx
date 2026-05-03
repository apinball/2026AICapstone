import React, { useState } from 'react';

export function Calendar({ selectedDate, onSelectDate }) {
  // 1. 현재 표시할 달력의 연도와 월 상태 관리 (방향키 작동을 위함)
  const [viewDate, setViewDate] = useState(new Date(2026, 3)); // 초기값: 2026년 4월 (Month는 0부터 시작)

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.toLocaleString('en-US', { month: '2-digit' });

  // 월 변경 함수
  const changeMonth = (offset) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset));
  };

  // 달력 데이터 생성 (해당 월의 날짜 및 이전/다음 달 채우기)
  const generateCalendarData = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    
    // 이전 달 날짜들 (회색)
    const prevMonthLastDate = new Date(year, month, 0).getDate();
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      days.push({ day: prevMonthLastDate - i, isCurrentMonth: false });
    }
    
    // 현재 달 날짜들
    for (let i = 1; i <= lastDateOfMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        // 실제 데이터와 연동되는 세션 표시 로직 (예시: 8~17일)
        hasSession: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17].includes(i),
        isToday: i === 17 && month === 3 && year === 2026
      });
    }
    
    // 다음 달 날짜들 (초록색 원 예시 유지)
    const remainingSlots = 42 - days.length;
    for (let i = 1; i <= remainingSlots; i++) {
      days.push({ day: i, isCurrentMonth: false, isGreen: true });
    }
    
    return days;
  };

  const calendarDays = generateCalendarData();
  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0" }}>
      
      {/* 1. 달력 헤더: 방향키 클릭 시 changeMonth 함수 실행 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
          {currentYear}.{currentMonth}
        </div>
        <div style={{ display: "flex", gap: "12px", color: "#94a3b8", fontSize: "12px" }}>
          <span 
            onClick={() => changeMonth(-1)} 
            style={arrowStyle}
            onMouseOver={(e) => e.target.style.color = "#059669"}
            onMouseOut={(e) => e.target.style.color = "#94a3b8"}
          >
            &lt;
          </span>
          <span 
            onClick={() => changeMonth(1)} 
            style={arrowStyle}
            onMouseOver={(e) => e.target.style.color = "#059669"}
            onMouseOut={(e) => e.target.style.color = "#94a3b8"}
          >
            &gt;
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", textAlign: "center", fontSize: "12px" }}>
        {weekDays.map((wd, i) => (
          <div key={wd} style={{ fontWeight: 600, color: i === 0 ? "#ef4444" : (i === 6 ? "#2563eb" : "#94a3b8"), marginBottom: "8px" }}>
            {wd}
          </div>
        ))}

        {calendarDays.map((day, index) => {
          const isSelected = selectedDate === day.day && day.isCurrentMonth;
          
          let style = {
            width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "50%", cursor: "pointer", transition: "all 0.2s", position: "relative", margin: "0 auto"
          };
          
          let baseColor = day.isCurrentMonth ? (index % 7 === 0 ? "#ef4444" : (index % 7 === 6 ? "#2563eb" : "#475569")) : "#cbd5e1";

          if (day.isGreen) {
            style.background = "#22c55e"; baseColor = "#fff";
          } else if (isSelected) {
            style.background = "#dcfce7"; style.border = "1px solid #86efac"; baseColor = "#166534"; style.fontWeight = "700";
          }

          return (
            <div 
              key={index} 
              style={style}
              // ⭐ 날짜 클릭 시 부모 컴포넌트의 데이터 필터링 함수 호출
              onClick={() => {
                if (day.isCurrentMonth) onSelectDate(day.day);
              }}
              onMouseOver={(e) => {
                if (!day.isGreen && day.isCurrentMonth && !isSelected) {
                  const textEl = e.currentTarget.querySelector('span');
                  if (textEl) textEl.style.color = "#064e3b"; 
                  e.currentTarget.style.background = "#f0fdf4"; 
                  e.currentTarget.style.fontWeight = "700";
                }
              }}
              onMouseOut={(e) => {
                if (!day.isGreen && day.isCurrentMonth && !isSelected) {
                  const textEl = e.currentTarget.querySelector('span');
                  if (textEl) textEl.style.color = baseColor; 
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.fontWeight = "400";
                }
              }}
            >
              <span style={{ color: baseColor, transition: "color 0.2s" }}>{day.day}</span>
              
              {/* 세션 도트: 세션이 있는 날에만 표시 */}
              {day.hasSession && !isSelected && !day.isGreen && day.isCurrentMonth && (
                <div style={{ position: "absolute", bottom: "2px", width: "3px", height: "3px", borderRadius: "50%", background: "#22c55e" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const arrowStyle = {
  cursor: "pointer", 
  transition: "color 0.2s", 
  fontWeight: "bold",
  padding: "0 4px"
};
