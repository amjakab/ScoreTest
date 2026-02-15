import React, { useState, useEffect, useCallback, useRef } from 'react';
import { scoreService } from './services/supabase.ts';
import { CooldownButton } from './components/CooldownButton.tsx';
import { ScoreHistoryChart } from './components/ScoreHistoryChart.tsx';
import { HistoryEntry, NewsSummary } from './types.ts';

const COOLDOWN_MS = 5 * 60 * 1000;
const COOLDOWN_KEY = 'brady_vote_cooldown';
const HISTORY_LIMIT = 20;

// Calculate multipliers based on Federal Funds Rate
const calculateMultipliers = (rate: number) => {
  let posMultiplier: number;
  let negMultiplier: number;

  if (rate <= 2) {
    // From 0.1 to 2: positive goes from 0.5 to 1, negative goes from 2 to 1
    posMultiplier = 0.5 + (rate - 0.1) * (0.5 / 1.9);
    negMultiplier = 2 - (rate - 0.1) * (1 / 1.9);
  } else {
    // From 2 to 4: positive goes from 1 to 2, negative goes from 1 to 0.5
    posMultiplier = 1 + (rate - 2) * (1 / 2);
    negMultiplier = 1 - (rate - 2) * (0.5 / 2);
  }

  return { posMultiplier, negMultiplier };
};

// Calculate normalized point values that always sum to 10
const calculatePointValues = (rate: number) => {
  const { posMultiplier, negMultiplier } = calculateMultipliers(rate);
  const total = posMultiplier + negMultiplier;

  return {
    positivePoints: Math.round((10 * posMultiplier / total) * 10) / 10, // Round to 1 decimal
    negativePoints: Math.round((10 * negMultiplier / total) * 10) / 10,
  };
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
  const [federalFundsRate, setFederalFundsRate] = useState<number>(2.0);

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
        const [currentScore, recentHistory, newsSummaries, rateData] = await Promise.all([
          scoreService.getScore(),
          scoreService.getHistory(HISTORY_LIMIT),
          scoreService.getNewsSummaries(),
          scoreService.getFederalFundsRate()
        ]);
        setScore(currentScore);
        setHistory(recentHistory);
        setNews(newsSummaries);
        setFederalFundsRate(rateData.rate);
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
      (newEntry) => setHistory(prev => [newEntry, ...prev].slice(0, HISTORY_LIMIT)),
      (newRate) => setFederalFundsRate(newRate)
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

  const handleVote = useCallback(async (isPositive: boolean) => {
    if (timeLeft > 0 || isUpdating) return;
    setIsUpdating(true);
    try {
      // Calculate adjusted delta based on Federal Funds Rate
      const { positivePoints, negativePoints } = calculatePointValues(federalFundsRate);
      const delta = isPositive ? positivePoints : -negativePoints;

      await scoreService.updateScore(delta);
      localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
      setTimeLeft(COOLDOWN_MS);
    } catch (err) {
      console.error("Vote failed:", err);
      setError("Sync failed");
    } finally {
      setIsUpdating(false);
    }
  }, [timeLeft, isUpdating, federalFundsRate]);

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
          {score ?? 0}
        </div>
        
        <div className="mt-4 flex items-center gap-2 text-slate-500 text-[10px] font-mono">
          <span className={`w-2 h-2 rounded-full ${error ? 'bg-rose-500' : isCloud ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          {error ? 'SYNC ERROR' : isCloud ? 'CONNECTED' : 'LOCAL'}
        </div>
      </section>

      {/* Federal Funds Rate Display */}
      <section className="w-full max-w-md bg-gradient-to-r from-blue-900/30 to-purple-900/30 backdrop-blur-md rounded-2xl p-6 border border-blue-700/50 shadow-xl mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-blue-300 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Brady Point Federal Funds Rate
          </h3>
          <span className="text-2xl font-bangers text-blue-400">{federalFundsRate.toFixed(1)}%</span>
        </div>
        <div className="text-slate-400 text-xs space-y-1">
          <p>
            {federalFundsRate === 2.0 && "Neutral market conditions. Standard point values apply."}
            {federalFundsRate > 2.0 && federalFundsRate < 4.0 && "Market favors positive momentum. Upvotes strengthened, downvotes weakened."}
            {federalFundsRate === 4.0 && "Maximum bullish conditions! Upvotes at 2x strength, downvotes halved."}
            {federalFundsRate < 2.0 && federalFundsRate > 0.1 && "Market favors corrections. Downvotes strengthened, upvotes weakened."}
            {federalFundsRate === 0.1 && "Maximum bearish conditions! Downvotes at 2x strength, upvotes halved."}
          </p>
          <div className="mt-3 pt-3 border-t border-blue-800/50">
            <div className="flex justify-between text-[10px]">
              <span className="text-emerald-400">Up: +{calculatePointValues(federalFundsRate).positivePoints}</span>
              <span className="text-slate-500">|</span>
              <span className="text-rose-400">Down: -{calculatePointValues(federalFundsRate).negativePoints}</span>
              <span className="text-slate-500">|</span>
              <span className="text-blue-400">Sum: {(calculatePointValues(federalFundsRate).positivePoints + calculatePointValues(federalFundsRate).negativePoints).toFixed(1)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col md:flex-row gap-6 w-full max-w-2xl justify-center items-center mb-12">
        <CooldownButton
          label={`POINT UP (+${calculatePointValues(federalFundsRate).positivePoints})`}
          variant="up"
          onClick={() => handleVote(true)}
          timeLeft={timeLeft}
          totalCooldown={COOLDOWN_MS}
          disabledGlobal={isUpdating}
          isLoading={isUpdating}
        />

        <CooldownButton
          label={`POINT DOWN (-${calculatePointValues(federalFundsRate).negativePoints})`}
          variant="down"
          onClick={() => handleVote(false)}
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
                    {entry.delta > 0 ? '▲' : '▼'} {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </span>
                  <span className="text-slate-400">Score is now {entry.new_score}</span>
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