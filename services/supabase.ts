
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HistoryEntry, NewsSummary } from '../types';

const supabaseUrl = 'https://tfarghozogplmnwhzudx.supabase.co';
const supabaseAnonKey = 'sb_publishable_J-aaKJLQVqVuCL-igY1PVw_rpKcCNXH';

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

const STORAGE_KEY = 'brady_score_persistent';
const RATE_STORAGE_KEY = 'brady_federal_rate_cache';

// Federal Funds Rate probability distribution
const RATE_PROBABILITIES = [
  { rate: 0.1, probability: 0.10 },
  { rate: 1.0, probability: 0.15 },
  { rate: 2.0, probability: 0.50 },
  { rate: 3.0, probability: 0.15 },
  { rate: 4.0, probability: 0.10 },
];

// Generate random Federal Funds Rate based on probability distribution
const generateRandomRate = (): number => {
  const random = Math.random();
  let cumulative = 0;
  for (const { rate, probability } of RATE_PROBABILITIES) {
    cumulative += probability;
    if (random < cumulative) return rate;
  }
  return 2.0; // Default to neutral rate
};

// Check if we need to generate a new rate (daily)
const shouldUpdateRate = (lastUpdated: string | null): boolean => {
  if (!lastUpdated) return true;

  const lastDate = new Date(lastUpdated);
  const currentDate = new Date();

  // Compare dates (ignoring time)
  return lastDate.toDateString() !== currentDate.toDateString();
};

export const scoreService = {
  isConfigured(): boolean {
    return !!supabase;
  },

  async getScore(): Promise<number> {
    if (!supabase) {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? parseInt(saved, 10) : 0;
    }

    try {
      const { data, error } = await supabase
        .from('brady_stats')
        .select('score')
        .eq('id', 1)
        .single();

      if (error) {
        // If row doesn't exist, try to create it
        if (error.code === 'PGRST116') {
           await supabase.from('brady_stats').insert([{ id: 1, score: 0 }]);
           return 0;
        }
        throw error;
      }
      return data.score;
    } catch (error) {
      console.warn('Supabase fetch failed:', error);
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? parseInt(saved, 10) : 0;
    }
  },

  async getHistory(limit = 20): Promise<HistoryEntry[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('score_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Failed to fetch history:', err);
      return [];
    }
  },

  async updateScore(delta: number): Promise<number> {
    if (!supabase) {
      const current = await this.getScore();
      const next = current + delta;
      localStorage.setItem(STORAGE_KEY, next.toString());
      return next;
    }

    try {
      let finalScore: number;

      // 1. Try atomic increment via RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('increment_score', { delta_val: delta });
      
      if (!rpcError && rpcData !== null) {
        finalScore = rpcData;
      } else {
        console.warn('RPC failed, falling back to manual update:', rpcError?.message);
        
        const currentScore = await this.getScore();
        const nextScore = currentScore + delta;
        
        const { data: updateData, error: updateError } = await supabase
          .from('brady_stats')
          .update({ score: nextScore, updated_at: new Date().toISOString() })
          .eq('id', 1)
          .select('score')
          .single();
        
        if (updateError) throw new Error(`DB Update Error: ${updateError.message}`);
        finalScore = updateData.score;
      }

      // 2. Log to History (Crucial for the Graph)
      const { error: historyError } = await supabase
        .from('score_history')
        .insert([{ 
          delta: delta, 
          new_score: finalScore 
        }]);

      if (historyError) {
        console.error('History Log Error (Check if columns delta/new_score exist):', historyError.message);
      }

      localStorage.setItem(STORAGE_KEY, finalScore.toString());
      return finalScore;
    } catch (error: any) {
      console.error('CRITICAL: Update failed:', error.message);
      throw error;
    }
  },

  async getNewsSummaries(): Promise<NewsSummary[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('news_summaries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Failed to fetch news summaries:', err);
      return [];
    }
  },

  async getFederalFundsRate(): Promise<{ rate: number; lastUpdated: string }> {
    if (!supabase) {
      const cached = localStorage.getItem(RATE_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return { rate: parsed.rate || 2.0, lastUpdated: parsed.lastUpdated || new Date().toISOString() };
      }
      return { rate: 2.0, lastUpdated: new Date().toISOString() };
    }

    try {
      const { data, error } = await supabase
        .from('federal_funds_rate')
        .select('rate, updated_at')
        .eq('id', 1)
        .single();

      if (error) {
        // If row doesn't exist, create it with a new random rate
        if (error.code === 'PGRST116') {
          const newRate = generateRandomRate();
          const now = new Date().toISOString();
          await supabase.from('federal_funds_rate').insert([{
            id: 1,
            rate: newRate,
            updated_at: now
          }]);
          return { rate: newRate, lastUpdated: now };
        }
        throw error;
      }

      // Check if we need to update the rate (daily check)
      if (shouldUpdateRate(data.updated_at)) {
        const newRate = generateRandomRate();
        const now = new Date().toISOString();
        await supabase
          .from('federal_funds_rate')
          .update({ rate: newRate, updated_at: now })
          .eq('id', 1);

        const rateData = { rate: newRate, lastUpdated: now };
        localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(rateData));
        return rateData;
      }

      const rateData = { rate: data.rate, lastUpdated: data.updated_at };
      localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(rateData));
      return rateData;
    } catch (error) {
      console.warn('Supabase rate fetch failed:', error);
      const cached = localStorage.getItem(RATE_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return { rate: parsed.rate || 2.0, lastUpdated: parsed.lastUpdated || new Date().toISOString() };
      }
      return { rate: 2.0, lastUpdated: new Date().toISOString() };
    }
  },

  subscribeToChanges(
    onScore: (newScore: number) => void,
    onHistory: (entry: HistoryEntry) => void,
    onRateChange?: (rate: number) => void
  ) {
    if (!supabase) return () => {};

    const channel = supabase
      .channel('brady_global_sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'brady_stats', filter: 'id=eq.1' },
        (payload) => {
          if (payload.new && typeof payload.new.score === 'number') {
            onScore(payload.new.score);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'score_history' },
        (payload) => {
          if (payload.new) {
            onHistory(payload.new as HistoryEntry);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'federal_funds_rate', filter: 'id=eq.1' },
        (payload) => {
          if (payload.new && typeof payload.new.rate === 'number' && onRateChange) {
            onRateChange(payload.new.rate);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};
