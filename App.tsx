import React, { useState, useEffect, useCallback, useRef } from 'react';
import { scoreService } from './services/supabase.ts';
import { CooldownButton } from './components/CooldownButton.tsx';
import { ScoreHistoryChart } from './components/ScoreHistoryChart.tsx';
import { HistoryEntry, NewsSummary } from './types.ts';

const COOLDOWN_MS = 5 * 60 * 1000;
const COOLDOWN_KEY = 'brady_vote_cooldown';
const HISTORY_LIMIT = 20;
const BASE_DELTA = 5;

const RATE_MIN = 0.1;
const RATE_NEUTRAL = 2;
const RATE_MAX = 4;

const seededUnitValue = (seed: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
};

const interpolate = (value: number, x1: number, y1: number, x2: number, y2: number): number => {
  const ratio = (value - x1) / (x2 - x1);
  return y1 + (y2 - y1) * ratio;
};

const getVoteDeltasForRate = (rate: number) => {
  const clampedRate = Math.min(RATE_MAX, Math.max(RATE_MIN, rate));

  const upDelta = clampedRate <= RATE_NEUTRAL
    ? interpolate(clampedRate, RATE_MIN, BASE_DELTA * 2, RATE_NEUTRAL, BASE_DELTA)
    : interpolate(clampedRate, RATE_NEUTRAL, BASE_DELTA, RATE_MAX, 0);

  const downMagnitude = 10 - upDelta;

  return {
    upDelta,
    downMagnitude
  };
};

const formatPoints = (value: number): string => {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
};

const todayKey = (): string => new Date().toISOString().split('T')[0];

const rateFromSeededValue = (unitValue: number): number => {
  const c = (RATE_NEUTRAL - RATE_MIN) / (RATE_MAX - RATE_MIN);
  const rate = unitValue < c
    ? RATE_MIN + Math.sqrt(unitValue * (RATE_MAX - RATE_MIN) * (RATE_NEUTRAL - RATE_MIN))
    : RATE_MAX - Math.sqrt((1 - unitValue) * (RATE_MAX - RATE_MIN) * (RATE_MAX - RATE_NEUTRAL));

  return parseFloat(rate.toFixed(2));
};

const getDailyFederalFundsRate = (): number => {
  const seed = `brady-fed-rate-${todayKey()}`;
  return rateFromSeededValue(seededUnitValue(seed));
};

const App: React.FC = () => {
  const [score, setScore] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCloud, setIsCloud] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [news, setNews] = useState<NewsSummary[]>([]);
  const [federalFundsRate, setFederalFundsRate] = useState<number>(() => getDailyFederalFundsRate());
  
  const prevScoreRef = useRef<number | null>(null);

  const getRemainingTime = useCallback(() => {
    const lastVoted = localStorage.getItem(COOLDOWN_KEY);
    if (!lastVoted) return 0;
    const diff = Date.now() - parseInt(lastVoted, 10);
    return Math.max(0, COOLDOWN_MS - diff);
  }, []);

  // Fetch initial data
  useEffect(() => {
    const init = async () => {
      try {
        const [currentScore, recentHistory, newsSummaries] = await Promise.all([
          scoreService.getScore(),
          scoreService.getHistory(HISTORY_LIMIT),
          scoreService.getNewsSummaries()
        ]);
        setScore(currentScore);
        setHistory(recentHistory);
        setNews(newsSummaries);
        prevScoreRef.current = currentScore;
        setIsCloud(scoreService.isConfigured());
      } catch (e) {
        setError("Connection error");
      }
    };

    init();
    setTimeLeft(getRemainingTime());

    const unsubscribe = scoreService.subscribeToChanges(
      (newScore) => setScore(newScore),
      (newEntry) => setHistory(prev => [newEntry, ...prev].slice(0, HISTORY_LIMIT))
    );

    return () => unsubscribe();
  }, [getRemainingTime]);

  // Handle cooldown timer
  useEffect(() => {
    if (timeLeft > 0) {
      const interval = setInterval(() => {
        const next = getRemainingTime();
        setTimeLeft(next);
        if (next <= 0) clearInterval(interval);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timeLeft, getRemainingTime]);

  // Refresh federal funds rate once per new day if tab remains open
  useEffect(() => {
    const interval = setInterval(() => {
      const nextRate = getDailyFederalFundsRate();
      setFederalFundsRate(prev => (prev === nextRate ? prev : nextRate));
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Pulse Effect on score change
  useEffect(() => {
    if (score !== null && prevScoreRef.current !== null && score !== prevScoreRef.current) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 400);
      prevScoreRef.current = score;
      return () => clearTimeout(timer);
    }
    prevScoreRef.current = score;
  }, [score]);

  const handleVote = useCallback(async (direction: 'up' | 'down') => {
    if (timeLeft > 0 || isUpdating) return;

    const currentRate = federalFundsRate;
    const { upDelta, downMagnitude } = getVoteDeltasForRate(currentRate);
    const adjustedDelta = direction === 'up' ? upDelta : -downMagnitude;

    setIsUpdating(true);
    try {
      await scoreService.updateScore(adjustedDelta);
      localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
      setTimeLeft(COOLDOWN_MS);
    } catch (err) {
      console.error("Vote failed:", err);
      setError("Sync failed");
    } finally {
      setIsUpdating(false);
    }
  }, [timeLeft, isUpdating, federalFundsRate]);

  const { upDelta, downMagnitude } = getVoteDeltasForRate(federalFundsRate);
  const dailyPointsTotal = history
    .filter((entry) => new Date(entry.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, entry) => sum + entry.delta, 0);

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (score === null && !error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1a1a2e]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center min-h-screen">
      <header className="text-center mb-12">
        <h1 className="text-6xl md:text-8xl font-bangers tracking-wider text-rose-500 drop-shadow-[0_0_15px_rgba(233,69,96,0.3)]">
          BRADY&apos;S POINTS
        </h1>
        <p className="mt-4 text-slate-400 font-semibold tracking-widest uppercase text-xs">
          Global Real-time Analytics
        </p>
      </header>

      <section className={`relative w-full max-w-md bg-slate-900/50 backdrop-blur-md rounded-[3rem] p-10 border border-slate-700 shadow-2xl mb-12 flex flex-col items-center transition-all duration-300 ${isPulsing ? 'scale-105 border-emerald-500/50 shadow-emerald-500/20' : 'scale-100'}`}>
        <div className="absolute -top-4 bg-slate-800 px-4 py-1 rounded-full border border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse`}></span>
          Live Score
        </div>
        
        <div className={`text-9xl font-bangers transition-all duration-500 ${score !== null && score >= 0 ? 'text-emerald-400' : 'text-rose-500'} ${isUpdating ? 'opacity-50' : 'opacity-100'}`}>
          {formatPoints(score ?? 0)}
        </div>
        
        <div className="mt-4 flex items-center gap-2 text-slate-500 text-[10px] font-mono">
          <span className={`w-2 h-2 rounded-full ${error ? 'bg-rose-500' : isCloud ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          {error ? 'SYNC ERROR' : isCloud ? 'CONNECTED' : 'LOCAL'}
        </div>

        <div className="mt-5 bg-slate-800/80 rounded-xl px-4 py-3 border border-slate-700 text-center w-full max-w-xs">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Brady Point Federal Funds Rate</p>
          <p className="text-2xl text-amber-300 font-bold mt-1">{federalFundsRate.toFixed(2)}%</p>
          <p className="text-[10px] text-slate-500 mt-2">2.00% is neutral. Lower rates boost positives, higher rates boost negatives. Same global daily rate for everyone.</p>
        </div>

        <div className="mt-3 bg-slate-800/60 rounded-xl px-4 py-2 border border-slate-700 text-center w-full max-w-xs">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Daily Points Total</p>
          <p className={`text-xl font-bold mt-1 ${dailyPointsTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {dailyPointsTotal >= 0 ? '+' : ''}{formatPoints(dailyPointsTotal)}
          </p>
        </div>
      </section>

      <section className="flex flex-col md:flex-row gap-6 w-full max-w-2xl justify-center items-center mb-12">
        <CooldownButton 
          label={`POINT UP (+${formatPoints(upDelta)})`} 
          variant="up" 
          onClick={() => handleVote('up')}
          timeLeft={timeLeft}
          totalCooldown={COOLDOWN_MS}
          disabledGlobal={isUpdating}
          isLoading={isUpdating}
        />
        
        <CooldownButton 
          label={`POINT DOWN (-${formatPoints(downMagnitude)})`} 
          variant="down" 
          onClick={() => handleVote('down')}
          timeLeft={timeLeft}
          totalCooldown={COOLDOWN_MS}
          disabledGlobal={isUpdating}
          isLoading={isUpdating}
        />
      </section>

      {/* Analytics Graph */}
      <section className="w-full max-w-md mb-4">
        <ScoreHistoryChart history={history} />
      </section>

      {/* Activity Log Section */}
      <section className="w-full max-w-md bg-slate-900/30 rounded-2xl p-6 border border-slate-800">
        <h3 className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mb-4 flex items-center gap-2">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Recent Activity
        </h3>
        <div className="space-y-3">
          {history.length === 0 ? (
            <p className="text-slate-600 text-xs italic py-2">No recent activity detected.</p>
          ) : (
            history.slice(0, 5).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-800/50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`font-bold ${entry.delta > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {entry.delta > 0 ? '▲' : '▼'} {entry.delta > 0 ? `+${formatPoints(entry.delta)}` : `-${formatPoints(Math.abs(entry.delta))}`}
                  </span>
                  <span className="text-slate-400">Score is now {formatPoints(entry.new_score)}</span>
                </div>
                <span className="text-slate-600 text-[10px]">{formatRelativeTime(entry.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* News Summaries Section */}
      {news.length > 0 && (
        <section className="w-full max-w-md mt-8 bg-slate-900/30 rounded-2xl p-6 border border-slate-800">
          <h3 className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mb-4 flex items-center gap-2">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            News
          </h3>
          <div className="space-y-3">
            {news.map((item) => (
              <div key={item.id} className="py-2 border-b border-slate-800/50 last:border-0">
                <p className="text-slate-300 text-xs leading-relaxed">{item.summary}</p>
                <span className="text-slate-600 text-[10px] mt-1 block">
                  {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-12 text-center text-slate-600 text-[10px] max-w-sm uppercase tracking-tighter">
        Secure Real-time Data Visualization.
      </footer>
    </main>
  );
};

export default App;
