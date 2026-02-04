
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env as any).SUPABASE_URL;
const supabaseAnonKey = (process.env as any).SUPABASE_ANON_KEY;

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
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? parseInt(saved, 10) : 0;
    }
  },

  /**
   * Uses the increment_score RPC function for atomic updates.
   */
  async updateScore(delta: number): Promise<number> {
    if (!supabase) {
      const current = await this.getScore();
      const next = current + delta;
      localStorage.setItem(STORAGE_KEY, next.toString());
      return next;
    }

    try {
      const { data, error } = await supabase.rpc('increment_score', { delta_val: delta });
      if (error) throw error;
      
      localStorage.setItem(STORAGE_KEY, data.toString());
      return data;
    } catch (error) {
      console.error('Supabase update failed:', error);
      const current = await this.getScore();
      return current + delta;
    }
  },

  /**
   * Subscribe to real-time changes on the brady_stats table.
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
          callback(payload.new.score);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};
