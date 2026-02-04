
import React, { useState, useEffect, useCallback } from 'react';

interface CooldownButtonProps {
  label: string;
  onClick: () => Promise<void>;
  variant: 'up' | 'down';
  cooldownKey: string;
  disabledGlobal?: boolean;
}

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export const CooldownButton: React.FC<CooldownButtonProps> = ({ 
  label, 
  onClick, 
  variant, 
  cooldownKey,
  disabledGlobal 
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const getRemainingTime = useCallback(() => {
    const lastVoted = localStorage.getItem(cooldownKey);
    if (!lastVoted) return 0;
    const diff = Date.now() - parseInt(lastVoted, 10);
    return Math.max(0, COOLDOWN_MS - diff);
  }, [cooldownKey]);

  useEffect(() => {
    const remaining = getRemainingTime();
    setTimeLeft(remaining);

    if (remaining > 0) {
      const interval = setInterval(() => {
        const next = getRemainingTime();
        setTimeLeft(next);
        if (next <= 0) clearInterval(interval);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [getRemainingTime]);

  const handleAction = async () => {
    if (timeLeft > 0 || loading || disabledGlobal) return;
    
    setLoading(true);
    try {
      await onClick();
      localStorage.setItem(cooldownKey, Date.now().toString());
      setTimeLeft(COOLDOWN_MS);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const baseStyles = "relative overflow-hidden group px-8 py-6 rounded-2xl font-bangers text-3xl transition-all duration-300 transform active:scale-95 flex flex-col items-center justify-center min-w-[200px]";
  const activeStyles = variant === 'up' 
    ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]"
    : "bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_20px_rgba(225,29,72,0.4)]";
  const disabledStyles = "bg-slate-800 text-slate-500 cursor-not-allowed opacity-80 grayscale";

  const isBtnDisabled = timeLeft > 0 || loading || disabledGlobal;

  return (
    <button
      onClick={handleAction}
      disabled={isBtnDisabled}
      className={`${baseStyles} ${isBtnDisabled ? disabledStyles : activeStyles}`}
    >
      <span className="z-10">{loading ? 'UPDATING...' : label}</span>
      {timeLeft > 0 && (
        <span className="z-10 text-sm font-sans mt-2 tracking-widest uppercase">
          Cooldown: {formatTime(timeLeft)}
        </span>
      )}
      
      {/* Visual Cooldown Progress Bar */}
      {timeLeft > 0 && (
        <div 
          className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-1000 ease-linear"
          style={{ width: `${(timeLeft / COOLDOWN_MS) * 100}%` }}
        />
      )}
    </button>
  );
};
