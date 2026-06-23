const MAX_NICKNAME_LENGTH = 16;

const nicknamePool = [
  "EUV Ninja",
  "Overlay Master",
  "Reticle Runner",
  "Tin Dropper",
  "Dose Hunter",
  "Pellicle Guard",
  "Vacuum Ghost",
  "Wafer Wizard",
  "Scanner Rookie",
  "Stage Rider",
  "Focus Fighter",
  "Alignment King",
  "Litho Cat",
  "Source Keeper",
  "NXE Pilot",
  "Twinscan Tiger",
  "EUV고양이",
  "오버레이장인",
  "레티클닌자",
  "웨이퍼요정",
  "진공유령",
  "도즈헌터",
  "스테이지라이더",
  "소스키퍼",
  "얼라인먼트왕",
  "펠리클수호자",
] as const;

const prefixes = [
  "EUV",
  "Overlay",
  "Reticle",
  "Wafer",
  "Scanner",
  "Stage",
  "Focus",
  "Dose",
  "Litho",
  "Vacuum",
  "Pellicle",
  "Source",
] as const;

const suffixes = [
  "Ninja",
  "Master",
  "Runner",
  "Wizard",
  "Hunter",
  "Guard",
  "Ghost",
  "Pilot",
  "Rookie",
  "Tiger",
  "Cat",
  "Keeper",
  "Rider",
  "Fighter",
] as const;

function normalizeNickname(nickname: string): string {
  return nickname.trim().toLocaleLowerCase();
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function buildNicknameCandidates(): string[] {
  const generated = prefixes.flatMap((prefix) => suffixes.map((suffix) => `${prefix} ${suffix}`));
  return [...nicknamePool, ...generated].filter((nickname) => nickname.length <= MAX_NICKNAME_LENGTH);
}

export function createRandomNickname(existingNicknames: string[] = []): string {
  const usedNicknames = new Set(existingNicknames.map(normalizeNickname).filter(Boolean));
  const candidates = shuffle(buildNicknameCandidates());
  const availableNickname = candidates.find((nickname) => !usedNicknames.has(normalizeNickname(nickname)));

  if (availableNickname) {
    return availableNickname;
  }

  const fallbackBase = shuffle([...nicknamePool])[0] ?? "EUV Pilot";
  for (let index = 2; index <= 99; index += 1) {
    const suffix = ` ${index}`;
    const trimmedBase = fallbackBase.slice(0, MAX_NICKNAME_LENGTH - suffix.length).trim();
    const fallbackNickname = `${trimmedBase}${suffix}`;
    if (!usedNicknames.has(normalizeNickname(fallbackNickname))) {
      return fallbackNickname;
    }
  }

  return "EUV Pilot";
}

export function createRandomNicknames(count: number, existingNicknames: string[] = []): string[] {
  const nicknames: string[] = [];

  for (let index = 0; index < count; index += 1) {
    nicknames.push(createRandomNickname([...existingNicknames, ...nicknames]));
  }

  return nicknames;
}
