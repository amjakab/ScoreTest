
export interface ScoreData {
  id: number;
  score: number;
  updated_at: string;
}

export interface HistoryEntry {
  id: string;
  delta: number;
  new_score: number;
  created_at: string;
}

export enum VoteType {
  UP = 'UP',
  DOWN = 'DOWN'
}
