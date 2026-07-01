import type { PlayerConfig } from "../types";

export const PLAYER_IDENTITY_COLOR_PALETTE = [
  "#00E5FF",
  "#FF3D71",
  "#FFD600",
  "#00E676",
  "#B388FF",
  "#FF9100",
  "#40C4FF",
  "#FF6E40",
  "#64FFDA",
  "#F50057",
] as const;

export const PLAYER_IDENTITY_COLORS = PLAYER_IDENTITY_COLOR_PALETTE;

export interface PlayerIdentityAssignment {
  playerId: string;
  playerIndex: number;
  identityOrder: number;
  selectionOrder: number;
  identityColor: string;
}

export function createPlayerIdentityAssignments(players: readonly PlayerConfig[]): PlayerIdentityAssignment[] {
  return players.map((player, index) => ({
    playerId: player.id,
    playerIndex: index,
    identityOrder: index + 1,
    selectionOrder: index + 1,
    identityColor: getPlayerIdentityColorByIndex(index),
  }));
}

export function getPlayerIdentityColorByIndex(index: number): string {
  const normalizedIndex = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  return PLAYER_IDENTITY_COLOR_PALETTE[normalizedIndex % PLAYER_IDENTITY_COLOR_PALETTE.length];
}

export function getPlayerIdentityColor(selectionOrder: number): string {
  return getPlayerIdentityColorByIndex(selectionOrder - 1);
}

export function getIdentityTextColor(identityColor: string): "#020617" | "#ffffff" {
  const color = parseHexColor(identityColor);
  const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
  return brightness >= 150 ? "#020617" : "#ffffff";
}

function parseHexColor(hexColor: string): { r: number; g: number; b: number } {
  const normalized = hexColor.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : normalized;

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}
