
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { scoreService } from './services/supabase.ts';
import { CooldownButton } from './components/CooldownButton.tsx';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const COOLDOWN_KEY = 'brady_vote_cooldown';

const App: React.FC = () => {
  const [score, setScore] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCloud, setIsCloud] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  
  const prevScoreRef = useRef<number | null>(null);

  // Helper to calculate remaining cooldown
  const getRemainingTime = useCallback(() => {
    const lastVoted = localStorage.getItem(COOLDOWN_KEY);
    if (!lastVoted) return 0;
    const diff = Date.now() - parseInt(lastVoted, 10);
    return Math.max(0, COOLDOWN_MS - diff);
  }, []);

  // Initialize Score, Subscription, and Cooldown Timer
  useEffect(() => {
    const init = async () => {
      try {
        const currentScore = await scoreService.getScore();
        setScore(currentScore);
        prevScoreRef.current = currentScore;
        setIsCloud(scoreService.isConfigured());
      } catch (e) {
        setError("Connection error");
      }
    };

    init();

    // Setup initial cooldown state
    const remaining = getRemainingTime();
    setTimeLeft(remaining);

    // Setup Realtime Subscription
    const unsubscribe = scoreService.subscribeToChanges((newScore) => {
      setScore(newScore);
    });

    return () => {
      unsubscribe();
    };
  }, [getRemainingTime]);

  // Global Tick for the Cooldown Timer
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

  // Visual pulse whenever the score changes from anywhere
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
    // Safety check for cooldown
    if (timeLeft > 0 || isUpdating) return;

    setIsUpdating(true);
    try {
      const newScore = await scoreService.updateScore(delta);
      setScore(newScore);
      
      // Set the shared cooldown for both buttons
      const now = Date.now();
      localStorage.setItem(COOLDOWN_KEY, now.toString());
      setTimeLeft(COOLDOWN_MS);
    } catch (err) {
      console.error("Failed to update score:", err);
      setError("Failed to sync");
    } finally {
      setIsUpdating(false);
    }
  }, [timeLeft, isUpdating]);

  if (score === null && !error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center min-h-screen">
      <header className="text-center mb-16">
        <h1 className="text-6xl md:text-8xl font-bangers tracking-wider text-rose-500 drop-shadow-[0_0_15px_rgba(233,69,96,0.3)]">
          BRADY&apos;S POINTS
        </h1>
        <p className="mt-4 text-slate-400 font-semibold tracking-widest uppercase text-sm">
          Global Real-time Ranking
        </p>
      </header>

      <section className={`relative w-full max-w-md bg-slate-900/50 backdrop-blur-md rounded-[3rem] p-12 border border-slate-700 shadow-2xl mb-12 flex flex-col items-center transition-all duration-300 ${isPulsing ? 'scale-105 border-emerald-500/50 shadow-emerald-500/20' : 'scale-100'}`}>
        <div className="absolute -top-6 bg-slate-800 px-6 py-2 rounded-full border border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full bg-emerald-500 animate-pulse`}></span>
          Live Scoreboard
        </div>
        
        <div className={`text-9xl font-bangers transition-all duration-500 ${score !== null && score >= 0 ? 'text-emerald-400' : 'text-rose-500'} ${isUpdating ? 'opacity-50' : 'opacity-100'}`}>
          {score ?? 0}
        </div>
        
        <div className="mt-4 flex items-center gap-2 text-slate-500 text-sm font-mono">
          <span className={`w-2 h-2 rounded-full ${error ? 'bg-rose-500' : isCloud ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          {error ? 'SYNC ERROR' : isCloud ? 'CONNECTED & SYNCED' : 'LOCAL MODE'}
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

      <footer className="mt-auto pt-16 text-center text-slate-600 text-xs max-w-sm">
        <p>
          {isCloud 
            ? "Connected to Supabase. Everyone sees these points update instantly." 
            : "Connection error. Points are temporary."}
        </p>
      </footer>
    </main>
  );
};

export default App;
