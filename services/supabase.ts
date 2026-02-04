
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tfarghozogplmnwhzudx.supabase.co';
const supabaseAnonKey = 'sb_publishable_J-aaKJLQVqVuCL-igY1PVw_rpKcCNXH';

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

const STORAGE_KEY = 'brady_score_persistent';

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

      if (error) throw error;
      return data.score;
    } catch (error) {
      console.warn('Supabase fetch failed:', error);
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? parseInt(saved, 10) : 0;
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
      // 1. Try the optimized RPC first (Atomically increments)
      const { data: rpcData, error: rpcError } = await supabase.rpc('increment_score', { delta_val: delta });
      
      if (!rpcError) {
        localStorage.setItem(STORAGE_KEY, rpcData.toString());
        return rpcData;
      }

      console.warn('RPC increment failed, falling back to manual update:', rpcError.message);

      // 2. Fallback: Manual Update (fetch -> calculate -> update)
      // Note: This is less atomic but works without custom SQL functions
      const currentScore = await this.getScore();
      const nextScore = currentScore + delta;

      const { data: updateData, error: updateError } = await supabase
        .from('brady_stats')
        .update({ score: nextScore })
        .eq('id', 1)
        .select('score')
        .single();

      if (updateError) {
        throw new Error(`Manual update failed: ${updateError.message}`);
      }

      localStorage.setItem(STORAGE_KEY, updateData.score.toString());
      return updateData.score;
    } catch (error) {
      console.error('All Supabase update attempts failed:', error);
      // Final fallback to local-only behavior so the UI doesn't break
      const current = await this.getScore();
      const localNext = current + delta;
      localStorage.setItem(STORAGE_KEY, localNext.toString());
      throw error; // Re-throw to let the UI know it was a sync failure
    }
  },

  /**
   * Refined Real-time Subscription
   */
  subscribeToChanges(callback: (newScore: number) => void) {
    if (!supabase) return () => {};

    const channel = supabase
      .channel('brady_global_sync')
      .on(
        'postgres_changes',
        {
          event: '*', 
          schema: 'public',
          table: 'brady_stats'
        },
        (payload) => {
          if (payload.new && payload.new.id === 1 && typeof payload.new.score === 'number') {
            callback(payload.new.score);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};
