import type { BattleTopData } from "../types";
import { BATTLE_CONFIG, type BattleConfig } from "./battleConfig";

export interface Arena {
  cx: number;
  cy: number;
  radiusX: number;
  radiusY: number;
}

export interface CollisionImpact {
  x: number;
  y: number;
  force: number;
  intensity: number;
  damageApplied: boolean;
}

export interface CollisionDamageInput {
  attacker: BattleTopData;
  defender: BattleTopData;
  impactForce: number;
  elapsedMs: number;
  aliveCount: number;
  repeatedCollisionPenalty: number;
  config?: BattleConfig;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getMagnitude(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function getMaxTopSpeed(
  top: BattleTopData,
  elapsedMs: number,
  config: BattleConfig = BATTLE_CONFIG,
): number {
  const baseMaxSpeed =
    elapsedMs < config.battleStartBoostDuration * 1000 ? config.maxTopSpeedDuringBoost : config.maxTopSpeed;
  const energyRatio = clamp(top.energy / top.maxEnergy, 0, 1);
  const energyMultiplier =
    config.lowEnergyMaxSpeedMultiplier + (1 - config.lowEnergyMaxSpeedMultiplier) * energyRatio;

  return baseMaxSpeed * energyMultiplier;
}

export function clampVelocity(top: BattleTopData, maxSpeed: number): void {
  if (top.stopped) {
    top.vx = 0;
    top.vy = 0;
    return;
  }

  const speed = getMagnitude(top.vx, top.vy);
  if (speed <= maxSpeed || speed <= 0.001) {
    return;
  }

  const scale = maxSpeed / speed;
  top.vx *= scale;
  top.vy *= scale;
}

export function getElapsedDamageMultiplier(elapsedMs: number, config: BattleConfig = BATTLE_CONFIG): number {
  if (elapsedMs < 5000) {
    return config.earlyPhaseDamageMultiplier;
  }

  if (elapsedMs < config.softProtectionEndMs) {
    const progress = (elapsedMs - 5000) / Math.max(1, config.softProtectionEndMs - 5000);
    return config.earlyPhaseDamageMultiplier + (config.midPhaseDamageMultiplier - config.earlyPhaseDamageMultiplier) * progress;
  }

  return config.latePhaseDamageMultiplier;
}

export function getAliveCountDamageMultiplier(aliveCount: number, config: BattleConfig = BATTLE_CONFIG): number {
  if (!config.aliveCountDamageScaling) {
    return 1;
  }

  const count = clamp(Math.round(aliveCount), 2, 10) as keyof typeof config.aliveCountDamageMultiplierByCount;
  return config.aliveCountDamageMultiplierByCount[count] ?? 1;
}

export function clampPreEliminationEnergy(
  top: BattleTopData,
  elapsedMs: number,
  config: BattleConfig = BATTLE_CONFIG,
): void {
  if (elapsedMs >= config.minEliminationTimeMs || top.stopped) {
    return;
  }

  const floor = top.maxEnergy * config.preEliminationEnergyFloorRatio;
  top.energy = clamp(Math.max(top.energy, floor), 0, top.maxEnergy);
}

export function calculateCollisionDamage({
  attacker,
  defender,
  impactForce,
  elapsedMs,
  aliveCount,
  repeatedCollisionPenalty,
  config = BATTLE_CONFIG,
}: CollisionDamageInput): number {
  const baseCollisionDamage = 1.1 + impactForce * 0.014;
  const timeMultiplier = getElapsedDamageMultiplier(elapsedMs, config);
  const aliveMultiplier = getAliveCountDamageMultiplier(aliveCount, config);

  return (
    (baseCollisionDamage *
      attacker.attack *
      timeMultiplier *
      aliveMultiplier *
      repeatedCollisionPenalty *
      config.collisionEnergyLossMultiplier) /
    defender.stability
  );
}

export function resolveArenaWall(
  top: BattleTopData,
  arena: Arena,
  elapsedMs: number,
  config: BattleConfig = BATTLE_CONFIG,
): CollisionImpact | null {
  const dx = top.x - arena.cx;
  const dy = top.y - arena.cy;
  const radiusX = Math.max(1, arena.radiusX - top.radius);
  const radiusY = Math.max(1, arena.radiusY - top.radius);
  const normalized = (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);

  if (normalized <= 1) {
    return null;
  }

  const scaleToBoundary = 1 / Math.sqrt(normalized);
  const boundaryDx = dx * scaleToBoundary;
  const boundaryDy = dy * scaleToBoundary;
  top.x = arena.cx + boundaryDx;
  top.y = arena.cy + boundaryDy;

  // Ellipse boundary normal: gradient of x^2/rx^2 + y^2/ry^2 = 1.
  const normalX = boundaryDx / (radiusX * radiusX);
  const normalY = boundaryDy / (radiusY * radiusY);
  const normalLength = Math.max(0.001, getMagnitude(normalX, normalY));
  const nx = normalX / normalLength;
  const ny = normalY / normalLength;

  const velocityIntoWall = top.vx * nx + top.vy * ny;
  if (velocityIntoWall > 0) {
    const bounce = 1 + config.wallBounceMultiplier;
    top.vx -= bounce * velocityIntoWall * nx;
    top.vy -= bounce * velocityIntoWall * ny;
  }

  const speed = getMagnitude(top.vx, top.vy);
  const impactForce = Math.max(Math.abs(velocityIntoWall), speed * 0.18);
  top.vx *= config.postWallBounceVelocityDamping;
  top.vy *= config.postWallBounceVelocityDamping;
  clampVelocity(top, getMaxTopSpeed(top, elapsedMs, config));

  const wallDamage =
    ((0.12 + impactForce * 0.0025) *
      config.collisionEnergyLossMultiplier *
      getElapsedDamageMultiplier(elapsedMs, config)) /
    top.stability;
  top.energy = clamp(top.energy - wallDamage, 0, top.maxEnergy);
  clampPreEliminationEnergy(top, elapsedMs, config);

  return {
    x: top.x,
    y: top.y,
    force: impactForce,
    intensity: impactForce,
    damageApplied: true,
  };
}

export function resolveTopCollision(
  a: BattleTopData,
  b: BattleTopData,
  options: {
    applyDamage: boolean;
    elapsedMs: number;
    aliveCount: number;
    repeatedCollisionPenalty: number;
    spinDirectionA?: number;
    spinDirectionB?: number;
    config?: BattleConfig;
  },
): CollisionImpact | null {
  if (a.stopped || b.stopped) {
    return null;
  }

  const config = options.config ?? BATTLE_CONFIG;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.max(0.001, getMagnitude(dx, dy));
  const minDistance = a.radius + b.radius;

  if (distance >= minDistance) {
    return null;
  }

  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minDistance - distance;
  const inverseWeightA = 1 / a.weight;
  const inverseWeightB = 1 / b.weight;
  const inverseWeightTotal = inverseWeightA + inverseWeightB;

  // 겹친 원을 확실히 분리한다. 현재 MVP에서는 모든 팽이가 동일 base weight를 사용한다.
  const correction = overlap * 1.06 + 0.4;
  a.x -= nx * correction * (inverseWeightA / inverseWeightTotal);
  a.y -= ny * correction * (inverseWeightA / inverseWeightTotal);
  b.x += nx * correction * (inverseWeightB / inverseWeightTotal);
  b.y += ny * correction * (inverseWeightB / inverseWeightTotal);

  const relativeVelocityX = b.vx - a.vx;
  const relativeVelocityY = b.vy - a.vy;
  const velocityAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;
  const speedA = getMagnitude(a.vx, a.vy);
  const speedB = getMagnitude(b.vx, b.vy);
  const averageAttack = (a.attack + b.attack) * 0.5;
  const attackImpulseBonus = 0.94 + averageAttack * 0.11;
  const spinDirectionA = options.spinDirectionA ?? 1;
  const spinDirectionB = options.spinDirectionB ?? -1;
  const isOpposedSpin = spinDirectionA * spinDirectionB < 0;
  const spinImpulseMultiplier = isOpposedSpin
    ? config.opposedSpinImpulseMultiplier
    : config.sameSpinImpulseMultiplier;
  const spinDamageMultiplier = isOpposedSpin
    ? config.opposedSpinDamageMultiplier
    : config.sameSpinDamageMultiplier;
  const baseImpulse =
    velocityAlongNormal < 0
      ? (-(1 + config.collisionRestitution) * velocityAlongNormal) / inverseWeightTotal
      : Math.max(12, overlap * 4.6);
  const repeatedImpulsePenalty = clamp(0.62 + options.repeatedCollisionPenalty * 0.38, 0.62, 1);
  const unclampedImpulse =
    Math.max(22, baseImpulse) *
    config.collisionImpulseMultiplier *
    attackImpulseBonus *
    spinImpulseMultiplier *
    repeatedImpulsePenalty;
  const impulse = Math.min(config.maxImpulsePerCollision, unclampedImpulse);

  a.vx -= nx * impulse * inverseWeightA;
  a.vy -= ny * impulse * inverseWeightA;
  b.vx += nx * impulse * inverseWeightB;
  b.vy += ny * impulse * inverseWeightB;

  // Spin direction changes the side-scrape after contact. It adds readable variation without breaking the simple 2D physics.
  const spinShear = (spinDirectionA - spinDirectionB) * 0.5;
  const tangentSign = spinShear === 0 ? 1 : Math.sign(spinShear);
  const tangentialNudge = Math.min(13.5, (overlap * 0.78 + Math.abs(spinShear) * 3.6) * config.spinTangentialNudgeMultiplier);
  a.vx += -ny * tangentialNudge * inverseWeightA * tangentSign;
  a.vy += nx * tangentialNudge * inverseWeightA * tangentSign;
  b.vx += ny * tangentialNudge * inverseWeightB * tangentSign;
  b.vy += -nx * tangentialNudge * inverseWeightB * tangentSign;
  a.vx *= config.postCollisionVelocityDamping;
  a.vy *= config.postCollisionVelocityDamping;
  b.vx *= config.postCollisionVelocityDamping;
  b.vy *= config.postCollisionVelocityDamping;
  clampVelocity(a, getMaxTopSpeed(a, options.elapsedMs, config));
  clampVelocity(b, getMaxTopSpeed(b, options.elapsedMs, config));

  const impactForce =
    Math.max(28, Math.abs(velocityAlongNormal) + (speedA + speedB) * 0.18 + overlap * 2.7) * spinImpulseMultiplier;

  // 충돌 데미지는 공격력, 방어 안정성, 시간대, 살아 있는 팽이 수, 반복 충돌 패널티를 모두 반영한다.
  if (options.applyDamage) {
    const damageToA = calculateCollisionDamage({
      attacker: b,
      defender: a,
      impactForce: impactForce * spinDamageMultiplier,
      elapsedMs: options.elapsedMs,
      aliveCount: options.aliveCount,
      repeatedCollisionPenalty: options.repeatedCollisionPenalty,
      config,
    });
    const damageToB = calculateCollisionDamage({
      attacker: a,
      defender: b,
      impactForce: impactForce * spinDamageMultiplier,
      elapsedMs: options.elapsedMs,
      aliveCount: options.aliveCount,
      repeatedCollisionPenalty: options.repeatedCollisionPenalty,
      config,
    });
    a.energy = clamp(a.energy - damageToA, 0, a.maxEnergy);
    b.energy = clamp(b.energy - damageToB, 0, b.maxEnergy);
    clampPreEliminationEnergy(a, options.elapsedMs, config);
    clampPreEliminationEnergy(b, options.elapsedMs, config);
  }

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    force: impactForce,
    intensity: impactForce * config.sparkIntensityMultiplier,
    damageApplied: options.applyDamage,
  };
}

export function applyPassiveDrain(
  top: BattleTopData,
  deltaSeconds: number,
  drainMultiplier: number,
  elapsedMs: number,
): void {
  if (top.stopped) {
    return;
  }

  // 시간 경과 에너지 감소량이다. 초반 보호 시간 전에는 floor 아래로 내려가지 않는다.
  const drainPerSecond = 2.45 * drainMultiplier * BATTLE_CONFIG.passiveDrainMultiplier;
  top.energy = clamp(top.energy - drainPerSecond * deltaSeconds, 0, top.maxEnergy);
  clampPreEliminationEnergy(top, elapsedMs);
}
