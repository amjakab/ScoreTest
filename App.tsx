import React, { useState, useEffect, useCallback, useRef } from 'react';
import { scoreService } from './services/supabase.ts';
import { CooldownButton } from './components/CooldownButton.tsx';
import { ScoreHistoryChart } from './components/ScoreHistoryChart.tsx';
import { HistoryEntry, NewsSummary } from './types.ts';

const COOLDOWN_MS = 5 * 60 * 1000;
const COOLDOWN_KEY = 'brady_vote_cooldown';
const HISTORY_LIMIT = 20;

const App: React.FC = () => {
  const [score, setScore] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCloud, setIsCloud] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [news, setNews] = useState<NewsSummary[]>([]);
  const [showAllTime, setShowAllTime] = useState(false);
  const [allHistory, setAllHistory] = useState<HistoryEntry[] | null>(null);
  const [loadingAllHistory, setLoadingAllHistory] = useState(false);
  
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

        // Check server-side cooldown (IP-based) and use whichever is longer
        const serverCooldown = await scoreService.checkCooldown();
        const localCooldown = getRemainingTime();
        setTimeLeft(Math.max(serverCooldown, localCooldown));
      } catch (e) {
        setError("Connection error");
      }
    };

    init();

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

  const handleVote = useCallback(async (delta: number) => {
    if (timeLeft > 0 || isUpdating) return;
    setIsUpdating(true);
    try {
      // Double-check server-side cooldown to prevent bypass
      const serverCooldown = await scoreService.checkCooldown();
      if (serverCooldown > 0) {
        setTimeLeft(serverCooldown);
        return;
      }

      await scoreService.updateScore(delta);
      await scoreService.recordVote();
      localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
      setTimeLeft(COOLDOWN_MS);
    } catch (err) {
      console.error("Vote failed:", err);
      setError("Sync failed");
    } finally {
      setIsUpdating(false);
    }
  }, [timeLeft, isUpdating]);

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleToggleAllTime = useCallback(async () => {
    if (showAllTime) {
      setShowAllTime(false);
      return;
    }
    setShowAllTime(true);
    if (!allHistory) {
      setLoadingAllHistory(true);
      try {
        const all = await scoreService.getHistory(1000);
        setAllHistory(all);
      } catch (err) {
        console.error('Failed to fetch all history:', err);
      } finally {
        setLoadingAllHistory(false);
      }
    }
  }, [showAllTime, allHistory]);

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
        
        {(() => {
          const today = new Date().toDateString();
          const dailyChange = history
            .filter(entry => new Date(entry.created_at).toDateString() === today)
            .reduce((sum, entry) => sum + entry.delta, 0);
          return (
            <div className={`mt-2 text-sm font-bold font-mono ${dailyChange > 0 ? 'text-emerald-400' : dailyChange < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
              Today: {dailyChange > 0 ? '+' : ''}{dailyChange}
            </div>
          );
        })()}

        <div className="mt-3 flex items-center gap-2 text-slate-500 text-[10px] font-mono">
          <span className={`w-2 h-2 rounded-full ${error ? 'bg-rose-500' : isCloud ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          {error ? 'SYNC ERROR' : isCloud ? 'CONNECTED' : 'LOCAL'}
        </div>
      </section>

      <section className="flex flex-col md:flex-row gap-6 w-full max-w-2xl justify-center items-center mb-12">
        <CooldownButton 
          label="POINT UP (+5)" 
          variant="up" 
          onClick={() => handleVote(5)}
          timeLeft={timeLeft}
          totalCooldown={COOLDOWN_MS}
          disabledGlobal={isUpdating}
          isLoading={isUpdating}
        />
        
        <CooldownButton 
          label="POINT DOWN (-5)" 
          variant="down" 
          onClick={() => handleVote(-5)}
          timeLeft={timeLeft}
          totalCooldown={COOLDOWN_MS}
          disabledGlobal={isUpdating}
          isLoading={isUpdating}
        />
      </section>

      {/* Analytics Graph */}
      <section className="w-full max-w-md mb-4">
        <div className="flex justify-end mb-2">
          <button
            onClick={handleToggleAllTime}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all duration-200"
            style={{
              color: showAllTime ? '#e94560' : '#64748b',
              borderColor: showAllTime ? '#e9456040' : '#334155',
              backgroundColor: showAllTime ? '#e9456010' : 'transparent',
            }}
          >
            {loadingAllHistory ? (
              <span className="animate-spin inline-block w-3 h-3 border border-rose-500 border-t-transparent rounded-full"></span>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
              </svg>
            )}
            {showAllTime ? 'All Time' : 'Recent'}
          </button>
        </div>
        <ScoreHistoryChart history={showAllTime && allHistory ? allHistory : history} />
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

      {/* News Summaries Section - Today Only */}
      {(() => {
        const today = new Date().toDateString();
        const todaysNews = news.filter(item => new Date(item.created_at).toDateString() === today);

        return todaysNews.length > 0 ? (
          <section className="w-full max-w-md mt-8 bg-slate-900/30 rounded-2xl p-6 border border-slate-800">
            <h3 className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mb-4 flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              Today's News
            </h3>
            <div className="space-y-3">
              {todaysNews.map((item) => (
                <div key={item.id} className="py-2 border-b border-slate-800/50 last:border-0">
                  <p className="text-slate-300 text-xs leading-relaxed">{item.summary}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null;
      })()}

      <footer className="mt-12 text-center text-slate-600 text-[10px] max-w-sm uppercase tracking-tighter">
        Secure Real-time Data Visualization.
      </footer>
    </main>
  );
};

export default App;