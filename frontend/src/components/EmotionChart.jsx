/**
 * 감정 시각화 차트
 * type="timeline" — X축: 시간, Y축: 감정 발랑스 (-1 ~ 1)
 * type="pie"      — 감정 분포 파이 차트
 */
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const EMOTION_VALENCE = {
  joy: 1.0, surprise: 0.5, neutral: 0.0,
  sadness: -0.5, fear: -0.7, disgust: -0.8, anger: -1.0, sarcasm: -0.3,
};

const EMOTION_COLORS = {
  joy: "#f59e0b", surprise: "#3b82f6", neutral: "#6b7280",
  sadness: "#60a5fa", fear: "#8b5cf6", disgust: "#ec4899",
  anger: "#ef4444", sarcasm: "#f97316",
};

export default function EmotionChart({ segments, type = "timeline", summary }) {
  if (type === "pie" && summary) {
    return <EmotionPie summary={summary} />;
  }
  return <EmotionTimeline segments={segments} />;
}

function EmotionTimeline({ segments }) {
  const data = segments.map((seg) => ({
    time: seg.start.toFixed(1),
    valence: EMOTION_VALENCE[seg.text_emotion] ?? 0,
    emotion: seg.text_emotion,
    speaker: seg.speaker,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" tick={{ fontSize: 11 }} label={{ value: "초(s)", position: "insideRight", offset: 10, fontSize: 11 }} />
        <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v, _, props) => [props.payload.emotion, "감정"]}
          labelFormatter={(l) => `${l}s`}
        />
        <Line
          type="monotone"
          dataKey="valence"
          stroke="#667eea"
          strokeWidth={2}
          dot={{ r: 3, fill: "#667eea" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function EmotionPie({ summary }) {
  const data = Object.entries(summary).map(([name, value]) => ({
    name,
    value: Math.round(value * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} ${value}%`}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={EMOTION_COLORS[entry.name] ?? "#888"} />
          ))}
        </Pie>
        <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
