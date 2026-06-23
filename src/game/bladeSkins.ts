export type BladePatternType = "core" | "spiral" | "grid" | "offset" | "plasma" | "void" | "shield" | "motion" | "ring" | "sun" | "arrow" | "stripe";

export interface BladeSkin {
  id: string;
  name: string;
  themeKeyword: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  patternType: BladePatternType;
  iconSymbol: string;
  description: string;
  matchKeywords: string[];
}

export const BLADE_SKINS: BladeSkin[] = [
  {
    id: "euv-core",
    name: "EUV Core",
    themeKeyword: "EUV",
    primaryColor: "#1b6fff",
    secondaryColor: "#dff6ff",
    accentColor: "#7df9ff",
    patternType: "core",
    iconSymbol: "✦",
    description: "파란 코어가 빛나는 EUV 테마 스킨",
    matchKeywords: ["euv", "nxe"],
  },
  {
    id: "wafer-spiral",
    name: "Wafer Spiral",
    themeKeyword: "Wafer",
    primaryColor: "#c9d4df",
    secondaryColor: "#8ecae6",
    accentColor: "#f2c94c",
    patternType: "spiral",
    iconSymbol: "◉",
    description: "웨이퍼 링과 미세한 무지개 반사가 보이는 스킨",
    matchKeywords: ["wafer", "웨이퍼"],
  },
  {
    id: "reticle-shadow",
    name: "Reticle Shadow",
    themeKeyword: "Reticle",
    primaryColor: "#32235f",
    secondaryColor: "#151829",
    accentColor: "#b57cff",
    patternType: "grid",
    iconSymbol: "▣",
    description: "레티클 그리드 느낌의 어두운 보라색 스킨",
    matchKeywords: ["reticle", "레티클"],
  },
  {
    id: "overlay-phantom",
    name: "Overlay Phantom",
    themeKeyword: "Overlay",
    primaryColor: "#00d1ff",
    secondaryColor: "#ff4fd8",
    accentColor: "#ffffff",
    patternType: "offset",
    iconSymbol: "◎",
    description: "엇갈린 cyan/magenta 링으로 overlay를 표현한 스킨",
    matchKeywords: ["overlay", "오버레이"],
  },
  {
    id: "tin-plasma",
    name: "Tin Plasma",
    themeKeyword: "Tin",
    primaryColor: "#ff8a2a",
    secondaryColor: "#1947ff",
    accentColor: "#ffd166",
    patternType: "plasma",
    iconSymbol: "⚡",
    description: "주석 플라즈마를 추상적으로 표현한 고대비 스킨",
    matchKeywords: ["tin", "plasma", "플라즈마"],
  },
  {
    id: "vacuum-ghost",
    name: "Vacuum Ghost",
    themeKeyword: "Vacuum",
    primaryColor: "#07111f",
    secondaryColor: "#0db5a4",
    accentColor: "#dff6ff",
    patternType: "void",
    iconSymbol: "◌",
    description: "진공 공간과 청록색 잔광을 표현한 스킨",
    matchKeywords: ["vacuum", "진공"],
  },
  {
    id: "pellicle-guard",
    name: "Pellicle Guard",
    themeKeyword: "Pellicle",
    primaryColor: "#7bdff2",
    secondaryColor: "#eefcff",
    accentColor: "#2f80ed",
    patternType: "shield",
    iconSymbol: "⛨",
    description: "얇은 보호막 패턴의 펠리클 테마 스킨",
    matchKeywords: ["pellicle", "펠리클"],
  },
  {
    id: "stage-rider",
    name: "Stage Rider",
    themeKeyword: "Stage",
    primaryColor: "#1f8f5f",
    secondaryColor: "#8d99ae",
    accentColor: "#b8ffcf",
    patternType: "motion",
    iconSymbol: "◆",
    description: "스테이지 이동선을 표현한 녹색/스틸 스킨",
    matchKeywords: ["stage", "스테이지"],
  },
  {
    id: "dose-hunter",
    name: "Dose Hunter",
    themeKeyword: "Dose",
    primaryColor: "#f2c94c",
    secondaryColor: "#eb5757",
    accentColor: "#fff3b0",
    patternType: "ring",
    iconSymbol: "✚",
    description: "강도 링과 노란 하이라이트가 보이는 dose 테마 스킨",
    matchKeywords: ["dose", "도즈"],
  },
  {
    id: "source-keeper",
    name: "Source Keeper",
    themeKeyword: "Source",
    primaryColor: "#ffcf33",
    secondaryColor: "#ff6b35",
    accentColor: "#ffffff",
    patternType: "sun",
    iconSymbol: "☀",
    description: "밝은 광원 코어를 추상화한 스킨",
    matchKeywords: ["source", "소스"],
  },
  {
    id: "alignment-arrow",
    name: "Alignment Arrow",
    themeKeyword: "Alignment",
    primaryColor: "#4cc9f0",
    secondaryColor: "#14213d",
    accentColor: "#ffffff",
    patternType: "arrow",
    iconSymbol: "➤",
    description: "정렬 타깃과 방향성을 보여주는 스킨",
    matchKeywords: ["alignment", "align", "얼라인먼트"],
  },
  {
    id: "scanner-stripe",
    name: "Scanner Stripe",
    themeKeyword: "Scanner",
    primaryColor: "#14213d",
    secondaryColor: "#f2c94c",
    accentColor: "#eb5757",
    patternType: "stripe",
    iconSymbol: "≋",
    description: "스캐너 움직임을 줄무늬로 표현한 스킨",
    matchKeywords: ["scanner", "twinscan", "스캐너"],
  },
];

export const DEFAULT_BLADE_SKIN_ID = BLADE_SKINS[0].id;

export function getBladeSkin(skinId: string | undefined): BladeSkin {
  return BLADE_SKINS.find((skin) => skin.id === skinId) ?? BLADE_SKINS[0];
}

export function matchBladeSkinForNickname(nickname: string): BladeSkin | null {
  const normalized = nickname.toLocaleLowerCase();
  return (
    BLADE_SKINS.find((skin) =>
      skin.matchKeywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase())),
    ) ?? null
  );
}

export function pickBladeSkinForNickname(nickname: string, usedSkinIds: string[] = []): BladeSkin {
  const matchedSkin = matchBladeSkinForNickname(nickname);
  if (matchedSkin && !usedSkinIds.includes(matchedSkin.id)) {
    return matchedSkin;
  }

  if (matchedSkin && Math.random() < 0.72) {
    return matchedSkin;
  }

  return pickRandomBladeSkin(usedSkinIds);
}

export function pickRandomBladeSkin(usedSkinIds: string[] = []): BladeSkin {
  const availableSkins = BLADE_SKINS.filter((skin) => !usedSkinIds.includes(skin.id));
  const pool = availableSkins.length > 0 ? availableSkins : BLADE_SKINS;
  return pool[Math.floor(Math.random() * pool.length)] ?? BLADE_SKINS[0];
}
