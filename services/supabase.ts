
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HistoryEntry, NewsSummary } from '../types';

const supabaseUrl = 'https://tfarghozogplmnwhzudx.supabase.co';
const supabaseAnonKey = 'sb_publishable_J-aaKJLQVqVuCL-igY1PVw_rpKcCNXH';

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

const STORAGE_KEY = 'brady_score_persistent';
const COOLDOWN_MS = 5 * 60 * 1000;

let cachedIp: string | null = null;

async function getClientIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    cachedIp = data.ip;
    return cachedIp;
  } catch {
    return null;
  }
}

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

  async checkCooldown(): Promise<number> {
    if (!supabase) return 0;
    try {
      const ip = await getClientIp();
      if (!ip) return 0;

      const { data, error } = await supabase
        .from('vote_cooldowns')
        .select('last_voted_at')
        .eq('ip_address', ip)
        .single();

      if (error || !data) return 0;

      const elapsed = Date.now() - new Date(data.last_voted_at).getTime();
      return Math.max(0, COOLDOWN_MS - elapsed);
    } catch {
      return 0;
    }
  },

  async recordVote(): Promise<void> {
    if (!supabase) return;
    try {
      const ip = await getClientIp();
      if (!ip) return;

      const { error } = await supabase
        .from('vote_cooldowns')
        .upsert(
          { ip_address: ip, last_voted_at: new Date().toISOString() },
          { onConflict: 'ip_address' }
        );

      if (error) console.error('Failed to record vote cooldown:', error.message);
    } catch (err) {
      console.error('Failed to record vote cooldown:', err);
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

  subscribeToChanges(onScore: (newScore: number) => void, onHistory: (entry: HistoryEntry) => void) {
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};
