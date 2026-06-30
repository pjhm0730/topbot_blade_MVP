export type TopType = "Balanced" | "Attack" | "Defense" | "Stamina" | "Random";

export type Screen = "home" | "lobby" | "launch" | "battle" | "result";

export interface PlayerConfig {
  id: string;
  nickname: string;
  bladeSkinId: string;
  selectionOrder?: number;
  // Legacy compatibility field. UI and battle stats no longer use top type differences.
  topType: TopType;
}

export interface LaunchData {
  playerId: string;
  launchPower: number;
}

export interface TopStats {
  maxEnergy: number;
  speed: number;
  weight: number;
  attack: number;
  stability: number;
  spinSpeed: number;
  radius: number;
  drainMultiplier: number;
}

export interface BattleTopData {
  id: string;
  playerId: string;
  nickname: string;
  bladeSkinId: string;
  skinName: string;
  identityColor: string;
  topType: TopType;
  selectionOrder: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  energy: number;
  maxEnergy: number;
  speed: number;
  weight: number;
  attack: number;
  stability: number;
  spinSpeed: number;
  stopped: boolean;
  stoppedAt: number | null;
}

export interface BattleHudTopState {
  playerId: string;
  nickname: string;
  bladeSkinId: string;
  skinName: string;
  identityColor: string;
  selectionOrder: number;
  energy: number;
  maxEnergy: number;
  stopped: boolean;
  isLocalPlayerTop: boolean;
  isCurrentLeader: boolean;
  isFinalBeverageBuyer: boolean;
}

export interface BattleHudState {
  elapsedMs: number;
  remainingMs: number;
  tops: BattleHudTopState[];
}

export interface BattleSummary {
  playerId: string;
  nickname: string;
  bladeSkinId: string;
  skinName: string;
  topType: TopType;
  survivalTime: number;
  remainingEnergy: number;
}

export interface BattleResult {
  // Legacy compatibility: these fields point to the beverage buyer in the current rule set.
  loserId: string;
  loserNickname: string;
  beverageBuyerId?: string;
  beverageBuyerNickname?: string;
  reason: "last-survivor" | "time-highest-energy" | "stopped" | "time-lowest-energy";
  duration: number;
  summaries: BattleSummary[];
}
