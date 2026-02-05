
import React from 'react';

interface BradyReactionProps {
  text: string;
  isTyping: boolean;
}

export const BradyReaction: React.FC<BradyReactionProps> = ({ text, isTyping }) => {
  if (!text && !isTyping) return null;

  return (
    <div className="relative mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-800/80 backdrop-blur-xl border border-rose-500/30 rounded-2xl px-6 py-3 shadow-[0_0_20px_rgba(233,69,96,0.15)] relative">
        {/* Speech bubble pointer */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-800 border-r border-b border-rose-500/30 rotate-45"></div>
        
        <p className="text-sm md:text-base font-medium text-slate-200 text-center italic">
          {isTyping ? (
            <span className="flex items-center gap-1 justify-center">
              Brady is processing...
              <span className="flex gap-1">
                <span className="w-1 h-1 bg-rose-500 rounded-full animate-bounce"></span>
                <span className="w-1 h-1 bg-rose-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1 h-1 bg-rose-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </span>
            </span>
          ) : (
            `"${text}"`
          )}
        </p>
      </div>
    </div>
  );
};
