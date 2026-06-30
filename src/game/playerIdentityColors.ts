import type { PlayerConfig } from "../types";

export const PLAYER_IDENTITY_COLOR_PALETTE = [
  "#ff2d55",
  "#00e676",
  "#2979ff",
  "#ffd600",
  "#ff8c00",
  "#bf5af2",
  "#00e5ff",
  "#f8fafc",
  "#ff4fd8",
  "#7cff00",
] as const;

export interface PlayerIdentityAssignment {
  playerId: string;
  selectionOrder: number;
  identityColor: string;
}

export function createPlayerIdentityAssignments(players: readonly PlayerConfig[]): PlayerIdentityAssignment[] {
  const indexedPlayers = players.map((player, sourceIndex) => ({ player, sourceIndex }));
  const selectedPlayers = indexedPlayers
    .filter(({ player }) => isValidSelectionOrder(player.selectionOrder))
    .sort(
      (a, b) =>
        (a.player.selectionOrder ?? 0) - (b.player.selectionOrder ?? 0) ||
        a.sourceIndex - b.sourceIndex,
    );
  const selectionOrderByPlayerId = new Map<string, number>();
  let nextOrder = 1;

  selectedPlayers.forEach(({ player }) => {
    if (selectionOrderByPlayerId.has(player.id)) {
      return;
    }

    selectionOrderByPlayerId.set(player.id, nextOrder);
    nextOrder += 1;
  });

  indexedPlayers.forEach(({ player }) => {
    if (selectionOrderByPlayerId.has(player.id)) {
      return;
    }

    selectionOrderByPlayerId.set(player.id, nextOrder);
    nextOrder += 1;
  });

  return indexedPlayers.map(({ player, sourceIndex }) => {
    const selectionOrder = selectionOrderByPlayerId.get(player.id) ?? sourceIndex + 1;

    return {
      playerId: player.id,
      selectionOrder,
      identityColor: getPlayerIdentityColor(selectionOrder),
    };
  });
}

export function getPlayerIdentityColor(selectionOrder: number): string {
  const paletteIndex = Math.max(0, Math.round(selectionOrder) - 1);
  return PLAYER_IDENTITY_COLOR_PALETTE[paletteIndex] ?? createOverflowIdentityColor(paletteIndex);
}

export function getIdentityTextColor(identityColor: string): "#020617" | "#ffffff" {
  const color = parseHexColor(identityColor);
  const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
  return brightness >= 150 ? "#020617" : "#ffffff";
}

function isValidSelectionOrder(selectionOrder: number | undefined): selectionOrder is number {
  return typeof selectionOrder === "number" && Number.isFinite(selectionOrder) && selectionOrder > 0;
}

function createOverflowIdentityColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return hslToHex(hue, 92, 58);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const match = normalizedLightness - chroma / 2;
  const [r, g, b] =
    huePrime < 1
      ? [chroma, x, 0]
      : huePrime < 2
        ? [x, chroma, 0]
        : huePrime < 3
          ? [0, chroma, x]
          : huePrime < 4
            ? [0, x, chroma]
            : huePrime < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return `#${toHexChannel((r + match) * 255)}${toHexChannel((g + match) * 255)}${toHexChannel((b + match) * 255)}`;
}

function toHexChannel(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
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
