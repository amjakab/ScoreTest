
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Using the credentials you provided
const supabaseUrl = 'https://tfarghozogplmnwhzudx.supabase.co';
const supabaseAnonKey = 'sb_publishable_J-aaKJLQVqVuCL-igY1PVw_rpKcCNXH';

// Initialize the client
export const supabase: SupabaseClient | null = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

const STORAGE_KEY = 'brady_score_persistent';

export const scoreService = {
  /**
   * Checks if Supabase is properly configured.
   */
  isConfigured(): boolean {
    return !!supabase;
  },

  /**
   * Fetches the current score from the 'brady_stats' table.
   */
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

  /**
   * Uses the increment_score RPC function we created in SQL for atomic updates.
   */
  async updateScore(delta: number): Promise<number> {
    if (!supabase) {
      const current = await this.getScore();
      const next = current + delta;
      localStorage.setItem(STORAGE_KEY, next.toString());
      return next;
    }

    try {
      // delta_val matches the parameter name in our SQL function
      const { data, error } = await supabase.rpc('increment_score', { delta_val: delta });
      if (error) throw error;
      
      localStorage.setItem(STORAGE_KEY, data.toString());
      return data;
    } catch (error) {
      console.error('Supabase update failed:', error);
      // Fallback increment logic if RPC fails
      const current = await this.getScore();
      return current + delta;
    }
  },

  /**
   * Subscribe to real-time changes on the brady_stats table.
   * This ensures that when someone else votes, your screen updates.
   */
  subscribeToChanges(callback: (newScore: number) => void) {
    if (!supabase) return () => {};

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'brady_stats',
          filter: 'id=eq.1'
        },
        (payload) => {
          if (payload.new && typeof payload.new.score === 'number') {
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
