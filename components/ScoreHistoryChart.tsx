
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

  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  const width = 500;
  const height = 220;

  const minScore = Math.min(...data.map(d => d.new_score));
  const maxScore = Math.max(...data.map(d => d.new_score));
  const scoreRange = Math.max(maxScore - minScore, 10);

  const yScale = (score: number) =>
    height - paddingBottom - ((score - minScore) / scoreRange) * (height - paddingTop - paddingBottom);

  const xScale = (index: number) =>
    paddingLeft + (index / (data.length - 1)) * (width - paddingLeft - paddingRight);

  // Y-axis ticks
  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) =>
    Math.round(minScore + (scoreRange * i) / yTickCount)
  );

  // X-axis ticks - pick evenly spaced data points for time labels
  const xTickCount = Math.min(data.length, 5);
  const xTickStep = Math.max(1, Math.floor((data.length - 1) / (xTickCount - 1)));
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const idx = Math.min(i * xTickStep, data.length - 1);
    return idx;
  });
  // Always include last point
  if (xTicks[xTicks.length - 1] !== data.length - 1) {
    xTicks[xTicks.length - 1] = data.length - 1;
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const points = data.map((d, i) => `${xScale(i)},${yScale(d.new_score)}`).join(' ');
  
  const areaPoints = [
    `${xScale(0)},${height - paddingBottom}`,
    ...data.map((d, i) => `${xScale(i)},${yScale(d.new_score)}`),
    `${xScale(data.length - 1)},${height - paddingBottom}`
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

        {/* Y-axis ticks and grid lines */}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={paddingLeft}
              y1={yScale(tick)}
              x2={width - paddingRight}
              y2={yScale(tick)}
              stroke="#1e293b"
              strokeWidth="1"
              strokeDasharray="4"
            />
            <text
              x={paddingLeft - 8}
              y={yScale(tick) + 3}
              textAnchor="end"
              fill="#64748b"
              fontSize="9"
              fontFamily="monospace"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* X-axis ticks */}
        {xTicks.map((idx) => (
          <g key={`x-${idx}`}>
            <line
              x1={xScale(idx)}
              y1={height - paddingBottom}
              x2={xScale(idx)}
              y2={height - paddingBottom + 4}
              stroke="#334155"
              strokeWidth="1"
            />
            <text
              x={xScale(idx)}
              y={height - paddingBottom + 16}
              textAnchor="middle"
              fill="#64748b"
              fontSize="8"
              fontFamily="monospace"
            >
              {formatTime(data[idx].created_at)}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#334155" strokeWidth="1" />

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
    </div>
  );
};
