
import React from 'react';

interface CooldownButtonProps {
  label: string;
  onClick: () => Promise<void>;
  variant: 'up' | 'down';
  timeLeft: number;
  totalCooldown: number;
  disabledGlobal?: boolean;
  isLoading?: boolean;
}

export const CooldownButton: React.FC<CooldownButtonProps> = ({ 
  label, 
  onClick, 
  variant, 
  timeLeft,
  totalCooldown,
  disabledGlobal,
  isLoading
}) => {
  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isBtnDisabled = timeLeft > 0 || isLoading || disabledGlobal;

  const baseStyles = "relative overflow-hidden group px-8 py-6 rounded-2xl font-bangers text-3xl transition-all duration-300 transform active:scale-95 flex flex-col items-center justify-center min-w-[200px]";
  const activeStyles = variant === 'up' 
    ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]"
    : "bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_20px_rgba(225,29,72,0.4)]";
  const disabledStyles = "bg-slate-800 text-slate-500 cursor-not-allowed opacity-80 grayscale";

  return (
    <button
      onClick={onClick}
      disabled={isBtnDisabled}
      className={`${baseStyles} ${isBtnDisabled ? disabledStyles : activeStyles}`}
    >
      <span className="z-10">{isLoading ? 'UPDATING...' : label}</span>
      {timeLeft > 0 && (
        <span className="z-10 text-sm font-sans mt-2 tracking-widest uppercase">
          Cooldown: {formatTime(timeLeft)}
        </span>
      )}
      
      {/* Visual Cooldown Progress Bar */}
      {timeLeft > 0 && (
        <div 
          className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-1000 ease-linear"
          style={{ width: `${(timeLeft / totalCooldown) * 100}%` }}
        />
      )}
    </button>
  );
};
