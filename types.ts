
export interface ScoreData {
  id: number;
  score: number;
  updated_at: string;
}

export interface HistoryEvent {
  id: string;
  change: number;
  timestamp: number;
}

export enum VoteType {
  UP = 'UP',
  DOWN = 'DOWN'
}
