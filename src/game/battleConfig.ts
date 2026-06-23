export const BATTLE_CONFIG = {
  // 전투 시간 제한. 10초 전에는 실제 탈락을 막고, 30초에는 반드시 결과를 냅니다.
  minEliminationTimeMs: 10000,
  softProtectionEndMs: 10000,
  maxBattleDurationMs: 30000,
  preEliminationEnergyFloorRatio: 0.07,

  // 시간대별 충돌 데미지. 초반은 화려하게 부딪히지만 에너지는 천천히 깎입니다.
  earlyPhaseDamageMultiplier: 0.4,
  midPhaseDamageMultiplier: 0.7,
  latePhaseDamageMultiplier: 1,

  // 살아 있는 팽이가 많을수록 충돌 빈도가 높으므로 개별 충돌 데미지를 낮춥니다.
  aliveCountDamageScaling: true,
  aliveCountDamageMultiplierByCount: {
    2: 1,
    3: 0.85,
    4: 0.8,
    5: 0.65,
    6: 0.6,
    7: 0.55,
    8: 0.48,
    9: 0.44,
    10: 0.4,
  },

  // 이동 AI. 충돌이 적으면 중앙/타겟 유도가 자연스럽게 강해집니다.
  centerAttractionStrength: 100, //52
  targetSeekingStrength: 57, //48
  randomSteeringStrength: 26, //19
  boundaryCorrectionStrength: 78,
  battleStartBoost: 1.22,
  battleStartBoostDuration: 4.5,
  minMoveSpeed: 64,
  noCollisionBoostDelay: 2,
  noCollisionBoostMultiplier: 1.45,
  targetRetargetMinMs: 1000,
  targetRetargetMaxMs: 2000,

  // 속도 안정화. 박진감은 유지하되 위치를 추적할 수 있는 범위로 제한합니다.
  maxTopSpeed: 300,
  maxTopSpeedDuringBoost: 370,
  lowEnergyMaxSpeedMultiplier: 0.56,
  velocityDamping: 0.08,
  postCollisionVelocityDamping: 10,
  postWallBounceVelocityDamping: 0.84,
  maxImpulsePerCollision: 72,
  maxAccelerationPerFrame: 18,

  // 반동 조정값. 반동이 너무 강하면 아래 세 값을 먼저 낮추세요.
  collisionRestitution: 4, //1.2
  collisionImpulseMultiplier: 1.5, //1.2
  wallBounceMultiplier: 0.66,

  // 에너지 감소 조정값. 게임이 너무 빨리 끝나면 아래 값을 낮추세요.
  collisionEnergyLossMultiplier: 0.78,
  passiveDrainMultiplier: 0.82,

  // 같은 두 팽이가 짧게 반복 충돌할 때 energy damage를 제한합니다.
  damageCooldownMs: 560,
  repeatedCollisionWindowMs: 2400,
  repeatedCollisionPenaltyMultiplier: 0.55, //0.55
  repeatedCollisionMinMultiplier: 0.25,
  collisionVisualCooldownMs: 90,

  // 충돌 임팩트는 velocity보다 이펙트로 보강합니다.
  cameraShakeIntensity: 0.0035,
  sparkIntensityMultiplier: 1.35,
  strongImpactThreshold: 120,
  electricArcImpactThreshold: 145,
  electricArcScaleMultiplier: 0.95,
  maxSparkParticlesPerImpact: 12,
  maxWeakSparkParticlesPerImpact: 7,
  maxActiveSparkParticles: 72,
  maxActiveElectricArcs: 2,
  electricArcCooldownMs: 520,
  electricArcMinDistance: 92,
  wallImpactEffectThreshold: 54,
  wallImpactVisualCooldownMs: 220,
  impactTextMinIntensity: 132,
  impactTextCooldownMs: 680,

  // 회전 시각화와 저에너지 흔들림.
  baseSpinVisualSpeed: 0.22,
  spinVisualSpeedMultiplier: 3.1,
  lowEnergyWobbleMultiplier: 2.35,

  // localPlayerId에 해당하는 내 팽이 시각 하이라이트.
  localPlayerHighlightEnabled: true,
  localPlayerRingColor: 0xffd166,
  localPlayerGlowColor: 0x7df9ff,
  localPlayerMarkerColor: 0xffffff,
  localPlayerPulseSpeed: 0.006,
  localPlayerHighlightDepth: 42,

  // 현재 꼴등 후보와 최종 꼴등 시각 하이라이트.
  loserCandidateHighlightEnabled: true,
  loserCandidateStartDelayMs: 3000,
  loserCandidateEnergyRatioThreshold: 0.5,
  loserCandidateRingColor: 0xeb5757,
  loserCandidateGlowColor: 0xff7a1a,
  finalLoserRingColor: 0xff1f3d,
  finalLoserGlowColor: 0xff5a3d,
  loserCandidatePulseSpeed: 0.008,
  loserCandidateHighlightDepth: 38,
  finalLoserHighlightDepth: 46,
} as const;

export type BattleConfig = typeof BATTLE_CONFIG;
