
import React, { useMemo } from 'react';
import { HistoryEntry } from '../types';

interface ScoreHistoryChartProps {
  history: HistoryEntry[];
}

export const ScoreHistoryChart: React.FC<ScoreHistoryChartProps> = ({ history }) => {
  // We need to reverse the history because it comes in newest-first
  const data = useMemo(() => [...history].reverse(), [history]);

  if (data.length < 2) {
    return (
      <div className="w-full h-48 flex items-center justify-center bg-slate-900/20 rounded-2xl border border-slate-800/50 italic text-slate-600 text-xs">
        Collecting more data points for the trend graph...
      </div>
    );
  }

  const padding = 40;
  const width = 500;
  const height = 200;

  const minScore = Math.min(...data.map(d => d.new_score));
  const maxScore = Math.max(...data.map(d => d.new_score));
  const scoreRange = Math.max(maxScore - minScore, 10); // Ensure some vertical scale if scores are flat
  
  const yScale = (score: number) => 
    height - padding - ((score - minScore) / scoreRange) * (height - 2 * padding);
  
  const xScale = (index: number) => 
    padding + (index / (data.length - 1)) * (width - 2 * padding);

  const points = data.map((d, i) => `${xScale(i)},${yScale(d.new_score)}`).join(' ');
  
  const areaPoints = [
    `${xScale(0)},${height - padding}`,
    ...data.map((d, i) => `${xScale(i)},${yScale(d.new_score)}`),
    `${xScale(data.length - 1)},${height - padding}`
  ].join(' ');

  return (
    <div className="w-full bg-slate-900/30 rounded-2xl p-6 border border-slate-800 mb-8 overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-slate-500 font-bold uppercase tracking-widest text-[10px] flex items-center gap-2">
          <svg className="w-3 h-3 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M3 4v16M3 4l18 16" />
          </svg>
          Point Velocity
        </h3>
        <div className="text-[10px] font-mono text-slate-400">
          Range: <span className={minScore < 0 ? 'text-rose-400' : 'text-emerald-400'}>{minScore}</span> 
          {" → "} 
          <span className={maxScore < 0 ? 'text-rose-400' : 'text-emerald-400'}>{maxScore}</span>
        </div>
      </div>

      <svg 
        viewBox={`0 0 ${width} ${height}`} 
        className="w-full h-auto drop-shadow-[0_0_10px_rgba(233,69,96,0.1)]"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e94560" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#e94560" stopOpacity="0" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Grid Lines */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#334155" strokeWidth="1" strokeDasharray="4" />
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#1e293b" strokeWidth="1" />

        {/* Area Fill */}
        <polyline
          points={areaPoints}
          fill="url(#chartGradient)"
          className="transition-all duration-700 ease-in-out"
        />

        {/* Data Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#e94560"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#glow)"
          className="transition-all duration-700 ease-in-out"
        />

        {/* Data Points */}
        {data.map((d, i) => (
          <circle
            key={d.id}
            cx={xScale(i)}
            cy={yScale(d.new_score)}
            r="4"
            fill="#1a1a2e"
            stroke={d.delta > 0 ? '#10b981' : '#e94560'}
            strokeWidth="2"
            className="hover:r-6 cursor-pointer transition-all duration-200"
          >
            <title>Score: {d.new_score} ({d.delta > 0 ? '+' : ''}{d.delta})</title>
          </circle>
        ))}
      </svg>
      
      <div className="flex justify-between mt-2 text-[8px] text-slate-600 uppercase tracking-widest font-bold">
        <span>Earlier</span>
        <span>Latest Activity</span>
      </div>
    </div>
  );
};
