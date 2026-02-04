
import React from 'react';

interface BradyReactionProps {
  text: string;
  isUpdating: boolean;
}

export const BradyReaction: React.FC<BradyReactionProps> = ({ text, isUpdating }) => {
  if (!text) return null;

  return (
    <div className={`mt-8 px-6 py-4 rounded-xl border-2 border-dashed border-rose-500/30 bg-rose-500/5 transition-opacity duration-500 ${isUpdating ? 'opacity-50' : 'opacity-100'}`}>
      <p className="italic text-rose-300 text-center text-lg md:text-xl font-medium">
        &ldquo;{text}&rdquo;
      </p>
    </div>
  );
};
