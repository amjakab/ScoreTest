
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
   * Refined Real-time Subscription
   */
  subscribeToChanges(callback: (newScore: number) => void) {
    if (!supabase) return () => {};

    // Use a unique channel name to avoid collisions
    const channel = supabase
      .channel('brady_global_sync')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT/UPDATE)
          schema: 'public',
          table: 'brady_stats'
        },
        (payload) => {
          // Only trigger if it's our specific record (ID 1)
          if (payload.new && payload.new.id === 1 && typeof payload.new.score === 'number') {
            callback(payload.new.score);
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime Status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }
};
