import type { RoundPhase } from '../state/types';
import type { RoundPlan } from './difficulty';

export interface RoundTimings {
  readyDelay: number;
  roundStarting: number;
  roundComplete: number;
  intermission: number;
}

export const DEFAULT_TIMINGS: RoundTimings = {
  readyDelay: 2.5,
  roundStarting: 3,
  roundComplete: 2.4,
  intermission: 9,
};

export interface RoundSnapshot {
  phase: RoundPhase;
  round: number;
  total: number;
  spawned: number;
  killed: number;
  remaining: number;
  alive: number;
  countdown: number;
  plan: RoundPlan;
}

export interface RoundEvents {
  onRoundStart?: (plan: RoundPlan) => void;
  onRoundComplete?: (plan: RoundPlan) => void;
  onIntermissionStart?: (nextRound: number) => void;
  onPhaseChange?: (phase: RoundPhase, previous: RoundPhase) => void;
  onGameOver?: (round: number) => void;
}
