import type { TopStats, TopType } from "../types";

export interface TopTypeInfo {
  type: TopType;
  label: string;
  description: string;
  color: number;
  cssColor: string;
  stats: TopStats;
}

export const SHARED_TOP_STATS: TopStats = {
  maxEnergy: 105,
  speed: 138,
  weight: 1.08,
  attack: 1,
  stability: 1.08,
  spinSpeed: 10.4,
  radius: 23,
  drainMultiplier: 1,
};

export const TOP_TYPE_INFOS: TopTypeInfo[] = [
  "Balanced",
  "Attack",
  "Defense",
  "Stamina",
  "Random",
].map((type) => ({
  type: type as TopType,
  label: "동일 성능",
  description: "현재 MVP에서는 모든 팽이가 동일 성능이며 스킨만 다릅니다.",
  color: 0x8ecae6,
  cssColor: "#8ecae6",
  stats: SHARED_TOP_STATS,
}));

export function getTopTypeInfo(topType: TopType): TopTypeInfo {
  return TOP_TYPE_INFOS.find((info) => info.type === topType) ?? TOP_TYPE_INFOS[0];
}

export function getBattleStats(_topType: TopType): TopStats {
  return { ...SHARED_TOP_STATS };
}
