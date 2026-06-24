import * as Phaser from "phaser";
import type {
  BattleHudState,
  BattleResult,
  BattleSummary,
  BattleTopData,
  LaunchData,
  PlayerConfig,
  TopType,
} from "../types";
import { BATTLE_CONFIG } from "./battleConfig";
import {
  applyPassiveDrain,
  clamp,
  clampVelocity,
  clampPreEliminationEnergy,
  getMaxTopSpeed,
  getMagnitude,
  resolveArenaWall,
  resolveTopCollision,
} from "./physics";
import { getBattleStats } from "./topTypes";
import { audioManager } from "../audio/audioManager";
import { getBladeSkin, type BladeSkin } from "./bladeSkins";

interface BattleSceneOptions {
  players: PlayerConfig[];
  launches: LaunchData[];
  localPlayerId?: string;
  onFinished: (result: BattleResult) => void;
  onStateChange?: (state: BattleHudState) => void;
}

interface RuntimeTop {
  data: BattleTopData;
  drainMultiplier: number;
  skin: BladeSkin;
  color: number;
  isLocalPlayerTop: boolean;
  isLoserCandidateTop: boolean;
  isFinalLoserTop: boolean;
  aggression: number;
  centerBias: number;
  spinDirection: number;
  targetPlayerId: string | null;
  nextTargetAt: number;
  randomSteerX: number;
  randomSteerY: number;
  nextRandomSteerAt: number;
  lastSampleAt: number;
  sampleX: number;
  sampleY: number;
  stuckSeconds: number;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  marker: Phaser.GameObjects.Rectangle;
  orderBadge: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  energyRing: Phaser.GameObjects.Graphics;
  energyBarBack: Phaser.GameObjects.Rectangle;
  energyBar: Phaser.GameObjects.Rectangle;
  loserHighlightRing: Phaser.GameObjects.Graphics;
  loserBadge: Phaser.GameObjects.Text;
  localHighlightRing?: Phaser.GameObjects.Graphics;
  localMarker?: Phaser.GameObjects.Triangle;
}

interface PairCollisionHistory {
  lastDamageAt: number;
  repeatCount: number;
}

interface LeaderboardRow {
  playerId: string;
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  rankText: Phaser.GameObjects.Text;
  playerText: Phaser.GameObjects.Text;
  barBack: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
}

const FALLBACK_SCENE_WIDTH = 1280;
const FALLBACK_SCENE_HEIGHT = 560;
const PAIR_SOUND_COOLDOWN_MS = 170;
const WALL_SOUND_COOLDOWN_MS = 190;
const GLOBAL_IMPACT_SOUND_COOLDOWN_MS = 62;

export class BattleScene extends Phaser.Scene {
  private readonly options: BattleSceneOptions;
  private tops: RuntimeTop[] = [];
  private sceneWidth = FALLBACK_SCENE_WIDTH;
  private sceneHeight = FALLBACK_SCENE_HEIGHT;
  private arena = {
    cx: FALLBACK_SCENE_WIDTH / 2,
    cy: FALLBACK_SCENE_HEIGHT / 2 + 12,
    radiusX: FALLBACK_SCENE_WIDTH * 0.44,
    radiusY: FALLBACK_SCENE_HEIGHT * 0.4,
  };
  private arenaGraphics?: Phaser.GameObjects.Graphics;
  private startTime = 0;
  private battleClockReady = false;
  private finished = false;
  private cleanedUp = false;
  private timerText?: Phaser.GameObjects.Text;
  private eventText?: Phaser.GameObjects.Text;
  private lastCollisionAt = 0;
  private lastImpactTextAt = 0;
  private loserCandidatePlayerId: string | null = null;
  private finalLoserPlayerId: string | null = null;
  private finishTimeoutId: number | null = null;
  private maxBattleTimeoutId: number | null = null;
  private readonly pairCollisionHistories = new Map<string, PairCollisionHistory>();
  private readonly visualCooldowns = new Map<string, number>();
  private readonly soundCooldowns = new Map<string, number>();
  private lastImpactSoundAt = 0;
  private lastLiveUpdateAt = 0;
  private activeSparkCount = 0;
  private lastElectricArcAt = 0;
  private lastElectricArcX = -Infinity;
  private lastElectricArcY = -Infinity;
  private electricArcGraphics: Phaser.GameObjects.Graphics[] = [];
  private leaderboardPanel?: Phaser.GameObjects.Graphics;
  private leaderboardTitle?: Phaser.GameObjects.Text;
  private leaderboardRows: LeaderboardRow[] = [];

  constructor(options: BattleSceneOptions) {
    super("BattleScene");
    this.options = options;
  }

  create(): void {
    this.configureSceneGeometry(this.scale.width, this.scale.height);
    this.resetRuntimeState();
    this.events.once("shutdown", this.cleanupScene, this);
    this.events.once("destroy", this.cleanupScene, this);
    this.scale.on("resize", this.handleScaleResize, this);

    this.maxBattleTimeoutId = window.setTimeout(() => {
      this.forceFinishByTimeLimit();
    }, BATTLE_CONFIG.maxBattleDurationMs + 250);
    this.drawArena();
    this.createTops();
    this.emitStateChange(0, true);
    this.spawnLaunchBurst();
    this.spawnLocalPlayerFocusCue();
    const maxBattleSeconds = BATTLE_CONFIG.maxBattleDurationMs / 1000;
    this.timerText = this.add.text(24, 20, `남은 시간 ${maxBattleSeconds.toFixed(1)}초`, {
      fontFamily: "Arial, sans-serif",
      fontSize: "20px",
      color: "#dff6ff",
      fontStyle: "700",
    });
    this.eventText = this.add.text(24, 48, "전투 시작", {
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
      color: "#8ecae6",
    });
  }

  update(time: number, delta: number): void {
    if (this.finished || this.cleanedUp) {
      return;
    }

    if (!this.battleClockReady) {
      this.initializeBattleClock(time);
    }

    const elapsedMs = time - this.startTime;
    const elapsed = elapsedMs / 1000;
    const maxBattleSeconds = BATTLE_CONFIG.maxBattleDurationMs / 1000;
    const deltaSeconds = Math.min(delta / 1000, 0.05);
    this.timerText?.setText(`남은 시간 ${Math.max(0, maxBattleSeconds - elapsed).toFixed(1)}초`);

    this.updateTopMovement(time, deltaSeconds, elapsedMs);
    this.resolveCollisions(time, elapsedMs);
    this.updateLoserCandidate(elapsedMs);
    this.syncVisuals(time, deltaSeconds);
    this.emitStateChange(time);

    const aliveTops = this.getAliveTops();
    if (elapsedMs >= BATTLE_CONFIG.minEliminationTimeMs && aliveTops.length <= 1) {
      const beverageBuyerTop = aliveTops[0] ?? this.pickFallbackLastSurvivor();
      this.eventText?.setText(`${beverageBuyerTop.data.nickname} 마지막 생존자 확정!`);
      this.finishBattle("last-survivor", elapsed, beverageBuyerTop.data.playerId, 950);
      return;
    }

    if (elapsedMs >= BATTLE_CONFIG.maxBattleDurationMs) {
      const beverageBuyerTop = this.pickTimeLimitBeverageBuyer();
      this.eventText?.setText("제한 시간 종료. 남은 에너지가 가장 높은 플레이어가 음료수 담당입니다.");
      this.finishBattle("time-highest-energy", maxBattleSeconds, beverageBuyerTop.data.playerId, 850);
    }
  }

  private resetRuntimeState(): void {
    this.tops = [];
    this.startTime = 0;
    this.battleClockReady = false;
    this.finished = false;
    this.cleanedUp = false;
    this.timerText = undefined;
    this.eventText = undefined;
    this.lastCollisionAt = 0;
    this.lastImpactTextAt = 0;
    this.loserCandidatePlayerId = null;
    this.finalLoserPlayerId = null;
    this.lastImpactSoundAt = 0;
    this.lastLiveUpdateAt = 0;
    this.finishTimeoutId = null;
    this.maxBattleTimeoutId = null;
    this.pairCollisionHistories.clear();
    this.visualCooldowns.clear();
    this.soundCooldowns.clear();
    this.electricArcGraphics = [];
    this.leaderboardRows = [];
    this.leaderboardPanel = undefined;
    this.leaderboardTitle = undefined;
    this.activeSparkCount = 0;
    this.lastElectricArcAt = 0;
    this.lastElectricArcX = -Infinity;
    this.lastElectricArcY = -Infinity;
  }

  private initializeBattleClock(time: number): void {
    this.battleClockReady = true;
    this.startTime = time;
    this.lastCollisionAt = time;

    this.tops.forEach((runtimeTop) => {
      runtimeTop.nextTargetAt = time + Phaser.Math.Between(250, 700);
      runtimeTop.nextRandomSteerAt = time;
      runtimeTop.lastSampleAt = time;
    });
  }

  private cleanupScene(): void {
    if (this.cleanedUp) {
      return;
    }

    this.cleanedUp = true;
    this.finished = true;
    this.pairCollisionHistories.clear();
    this.visualCooldowns.clear();
    this.soundCooldowns.clear();
    this.electricArcGraphics.forEach((graphics) => graphics.destroy());
    this.electricArcGraphics = [];
    this.leaderboardRows.forEach((row) => row.container.destroy(true));
    this.leaderboardRows = [];
    this.leaderboardPanel?.destroy();
    this.leaderboardPanel = undefined;
    this.leaderboardTitle?.destroy();
    this.leaderboardTitle = undefined;
    this.activeSparkCount = 0;
    this.scale.off("resize", this.handleScaleResize, this);
    this.arenaGraphics?.destroy();
    this.arenaGraphics = undefined;
    if (this.finishTimeoutId !== null) {
      window.clearTimeout(this.finishTimeoutId);
      this.finishTimeoutId = null;
    }
    if (this.maxBattleTimeoutId !== null) {
      window.clearTimeout(this.maxBattleTimeoutId);
      this.maxBattleTimeoutId = null;
    }
    this.tops = [];
    this.timerText = undefined;
    this.eventText = undefined;
    this.time.removeAllEvents();
    this.tweens.killAll();
  }

  private configureSceneGeometry(width: number, height: number): void {
    this.sceneWidth = Math.max(640, Math.round(width || FALLBACK_SCENE_WIDTH));
    this.sceneHeight = Math.max(320, Math.round(height || FALLBACK_SCENE_HEIGHT));
    this.arena = {
      cx: this.sceneWidth / 2,
      cy: this.sceneHeight / 2 + clamp(this.sceneHeight * 0.02, 6, 16),
      radiusX: this.sceneWidth * 0.44,
      radiusY: this.sceneHeight * 0.4,
    };
  }

  private handleScaleResize(gameSize: Phaser.Structs.Size): void {
    this.configureSceneGeometry(gameSize.width, gameSize.height);
    this.drawArena();
    this.timerText?.setPosition(24, 18);
    this.eventText?.setPosition(24, 44);
    this.tops.forEach((runtimeTop) => this.clampTopInsideArena(runtimeTop.data));
    this.layoutLeaderboard(true);
  }

  private getEllipseRatio(x: number, y: number, padding = 0): number {
    const radiusX = Math.max(1, this.arena.radiusX - padding);
    const radiusY = Math.max(1, this.arena.radiusY - padding);
    const dx = x - this.arena.cx;
    const dy = y - this.arena.cy;
    return Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY));
  }

  private clampTopInsideArena(top: BattleTopData): void {
    const radiusX = Math.max(1, this.arena.radiusX - top.radius);
    const radiusY = Math.max(1, this.arena.radiusY - top.radius);
    const dx = top.x - this.arena.cx;
    const dy = top.y - this.arena.cy;
    const normalized = (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);

    if (normalized <= 1) {
      return;
    }

    const scaleToBoundary = 1 / Math.sqrt(normalized);
    top.x = this.arena.cx + dx * scaleToBoundary;
    top.y = this.arena.cy + dy * scaleToBoundary;
  }

  private drawArena(): void {
    this.cameras.main.setBackgroundColor("#07111f");

    this.arenaGraphics?.destroy();
    const graphics = this.add.graphics();
    graphics.setDepth(-20);
    this.arenaGraphics = graphics;
    graphics.fillGradientStyle(0x0b1d32, 0x0b1d32, 0x07111f, 0x07111f, 1);
    graphics.fillRect(0, 0, this.sceneWidth, this.sceneHeight);

    graphics.lineStyle(1, 0x24405f, 0.22);
    for (let x = 0; x <= this.sceneWidth; x += 44) {
      graphics.lineBetween(x, 0, x, this.sceneHeight);
    }
    for (let y = 0; y <= this.sceneHeight; y += 44) {
      graphics.lineBetween(0, y, this.sceneWidth, y);
    }

    graphics.fillStyle(0x10263f, 1);
    graphics.fillEllipse(
      this.arena.cx,
      this.arena.cy,
      (this.arena.radiusX + 18) * 2,
      (this.arena.radiusY + 18) * 2,
    );
    graphics.fillStyle(0x7df9ff, 0.08);
    graphics.fillEllipse(this.arena.cx, this.arena.cy, this.arena.radiusX * 1.22, this.arena.radiusY * 1.22);
    graphics.lineStyle(7, 0x8ecae6, 0.86);
    graphics.strokeEllipse(this.arena.cx, this.arena.cy, this.arena.radiusX * 2, this.arena.radiusY * 2);
    graphics.lineStyle(2, 0x7df9ff, 0.42);
    graphics.strokeEllipse(this.arena.cx, this.arena.cy, this.arena.radiusX * 1.36, this.arena.radiusY * 1.36);
    graphics.strokeEllipse(this.arena.cx, this.arena.cy, this.arena.radiusX * 0.72, this.arena.radiusY * 0.72);
    graphics.lineStyle(1, 0xffd166, 0.28);
    graphics.strokeEllipse(this.arena.cx, this.arena.cy, this.arena.radiusX * 0.36, this.arena.radiusY * 0.36);

    graphics.lineStyle(1, 0x8ecae6, 0.18);
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      graphics.lineBetween(
        this.arena.cx + Math.cos(angle) * this.arena.radiusX * 0.16,
        this.arena.cy + Math.sin(angle) * this.arena.radiusY * 0.16,
        this.arena.cx + Math.cos(angle) * this.arena.radiusX * 0.96,
        this.arena.cy + Math.sin(angle) * this.arena.radiusY * 0.96,
      );
    }
  }

  private createTops(): void {
    const total = this.options.players.length;

    this.tops = this.options.players.map((player, index) => {
      const launchPower = this.options.launches.find((launch) => launch.playerId === player.id)?.launchPower ?? 0.85;
      const stats = getBattleStats(player.topType);
      const skin = getBladeSkin(player.bladeSkinId);
      const isLocalPlayerTop = player.id === (this.options.localPlayerId ?? this.options.players[0]?.id);
      const primaryColor = hexToNumber(skin.primaryColor);
      const secondaryColor = hexToNumber(skin.secondaryColor);
      const accentColor = hexToNumber(skin.accentColor);
      const angle = total <= 2 ? index * Math.PI : (index / total) * Math.PI * 2 - Math.PI / 2;
      const positionScale = total <= 2 ? 0.38 : 0.52;
      const x = this.arena.cx + Math.cos(angle) * this.arena.radiusX * positionScale + Phaser.Math.FloatBetween(-12, 12);
      const y = this.arena.cy + Math.sin(angle) * this.arena.radiusY * positionScale + Phaser.Math.FloatBetween(-8, 8);
      const centerAngle = Math.atan2(this.arena.cy - y, this.arena.cx - x);
      const launchAngle = centerAngle + Phaser.Math.FloatBetween(-0.55, 0.55);
      const speed = stats.speed * (0.78 + launchPower * 0.58) * BATTLE_CONFIG.battleStartBoost;
      const randomTraits = getAiTraits(player.topType);

      const data: BattleTopData = {
        id: `top-${player.id}-${Date.now()}-${index}`,
        playerId: player.id,
        nickname: player.nickname,
        bladeSkinId: skin.id,
        skinName: skin.name,
        topType: player.topType,
        selectionOrder: player.selectionOrder ?? index + 1,
        x,
        y,
        vx: Math.cos(launchAngle) * speed,
        vy: Math.sin(launchAngle) * speed,
        radius: stats.radius,
        energy: stats.maxEnergy,
        maxEnergy: stats.maxEnergy,
        speed,
        weight: stats.weight,
        attack: stats.attack,
        stability: stats.stability,
        spinSpeed: stats.spinSpeed * (0.8 + launchPower * 0.65),
        stopped: false,
        stoppedAt: null,
      };

      const shadow = this.add.circle(4, 6, data.radius + 3, 0x000000, 0.14);
      const body = this.add.circle(0, 0, data.radius, primaryColor, 1);
      body.setStrokeStyle(3, 0xffffff, 0.95);
      const skinObjects = this.createBladeSkinObjects(skin, data.radius, primaryColor, secondaryColor, accentColor);
      const bladeA = this.add.triangle(
        0,
        0,
        0,
        -data.radius * 0.9,
        data.radius * 0.58,
        data.radius * 0.2,
        -data.radius * 0.16,
        data.radius * 0.48,
        secondaryColor,
        0.44,
      );
      const bladeB = this.add.triangle(
        0,
        0,
        0,
        data.radius * 0.82,
        -data.radius * 0.52,
        -data.radius * 0.12,
        data.radius * 0.2,
        -data.radius * 0.42,
        accentColor,
        0.22,
      );
      const marker = this.add.rectangle(data.radius * 0.52, 0, data.radius * 1.05, 5, accentColor, 0.92);
      const highlight = this.add.circle(data.radius * 0.34, -data.radius * 0.28, data.radius * 0.18, 0xffffff, 0.76);
      const inner = this.add.circle(0, 0, data.radius * 0.34, 0xffffff, 0.24);
      const icon = this.add
        .text(0, 0, skin.iconSymbol, {
          fontFamily: "Arial, sans-serif",
          fontSize: `${Math.round(data.radius * 0.9)}px`,
          color: skin.accentColor,
          fontStyle: "900",
          stroke: "#ffffff",
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      const container = this.add.container(data.x, data.y, [
        shadow,
        body,
        ...skinObjects,
        bladeB,
        bladeA,
        marker,
        highlight,
        inner,
        icon,
      ]);
      container.setDepth(isLocalPlayerTop ? BATTLE_CONFIG.localPlayerHighlightDepth + 1 : 8);
      const orderBadge = this.add
        .text(data.x, data.y - data.radius - 38, getBattleOrderText(data.selectionOrder, isLocalPlayerTop), {
          fontFamily: "Arial, sans-serif",
          fontSize: isLocalPlayerTop ? "12px" : "11px",
          color: isLocalPlayerTop ? "#07111f" : "#f8fafc",
          fontStyle: "900",
          stroke: isLocalPlayerTop ? "#ffffff" : "#020617",
          strokeThickness: isLocalPlayerTop ? 1 : 2,
        })
        .setOrigin(0.5)
        .setPadding(isLocalPlayerTop ? 7 : 6, 2, isLocalPlayerTop ? 7 : 6, 2)
        .setBackgroundColor(isLocalPlayerTop ? "rgba(255, 209, 102, 0.96)" : "rgba(7, 17, 31, 0.86)");
      orderBadge.setDepth(BATTLE_CONFIG.finalLoserHighlightDepth + (isLocalPlayerTop ? 16 : 12));
      const label = this.add
        .text(data.x, data.y + data.radius + 14, player.nickname, {
          fontFamily: "Arial, sans-serif",
          fontSize: "13px",
          color: isLocalPlayerTop ? "#ffd166" : "#14213d",
          fontStyle: "700",
        })
        .setOrigin(0.5)
        .setPadding(6, 2, 6, 2)
        .setBackgroundColor(isLocalPlayerTop ? "rgba(7, 17, 31, 0.9)" : "rgba(255, 255, 255, 0.72)");
      const energyRing = this.add.graphics();
      const energyBarBack = this.add.rectangle(data.x, data.y + data.radius + 32, 54, 5, 0x020617, 0.96);
      energyBarBack.setStrokeStyle(1, 0xdff6ff, 0.6);
      const energyBar = this.add.rectangle(
        data.x - 27,
        data.y + data.radius + 32,
        54,
        5,
        getEnergyColor(1),
        1,
      );
      energyBar.setOrigin(0, 0.5);
      energyBarBack.setDepth(isLocalPlayerTop ? BATTLE_CONFIG.localPlayerHighlightDepth : 1);
      energyBar.setDepth(isLocalPlayerTop ? BATTLE_CONFIG.localPlayerHighlightDepth + 1 : 2);
      label.setDepth(isLocalPlayerTop ? BATTLE_CONFIG.localPlayerHighlightDepth + 3 : 3);
      energyRing.setDepth(isLocalPlayerTop ? BATTLE_CONFIG.localPlayerHighlightDepth : 2);
      const loserHighlightRing = this.add.graphics();
      loserHighlightRing.setDepth(BATTLE_CONFIG.loserCandidateHighlightDepth);
      const loserBadge = this.add
        .text(data.x, data.y - data.radius - 46, "위험!", {
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          color: "#ffffff",
          fontStyle: "900",
          stroke: "#7a1010",
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setPadding(7, 2, 7, 2)
        .setBackgroundColor("rgba(235, 87, 87, 0.92)")
        .setDepth(BATTLE_CONFIG.finalLoserHighlightDepth + 3)
        .setVisible(false);
      const localHighlightRing =
        BATTLE_CONFIG.localPlayerHighlightEnabled && isLocalPlayerTop ? this.add.graphics() : undefined;
      localHighlightRing?.setDepth(BATTLE_CONFIG.localPlayerHighlightDepth);
      const localMarker =
        BATTLE_CONFIG.localPlayerHighlightEnabled && isLocalPlayerTop
          ? this.add.triangle(0, 0, 0, 0, -8, -12, 8, -12, BATTLE_CONFIG.localPlayerMarkerColor, 0.95)
          : undefined;
      localMarker?.setDepth(BATTLE_CONFIG.localPlayerHighlightDepth + 4);

      return {
        data,
        drainMultiplier: stats.drainMultiplier,
        skin,
        color: primaryColor,
        isLocalPlayerTop,
        isLoserCandidateTop: false,
        isFinalLoserTop: false,
        aggression: randomTraits.aggression,
        centerBias: randomTraits.centerBias,
        spinDirection: Math.random() > 0.5 ? 1 : -1,
        targetPlayerId: null,
        nextTargetAt: this.time.now + Phaser.Math.Between(250, 700),
        randomSteerX: 0,
        randomSteerY: 0,
        nextRandomSteerAt: this.time.now,
        lastSampleAt: this.time.now,
        sampleX: data.x,
        sampleY: data.y,
        stuckSeconds: 0,
        container,
        body,
        marker,
        orderBadge,
        label,
        energyRing,
        energyBarBack,
        energyBar,
        loserHighlightRing,
        loserBadge,
        localHighlightRing,
        localMarker,
      };
    });
  }

  private createLeaderboard(): void {
    this.leaderboardPanel?.destroy();
    this.leaderboardTitle?.destroy();
    this.leaderboardRows.forEach((row) => row.container.destroy(true));
    this.leaderboardRows = [];

    this.leaderboardPanel = this.add.graphics();
    this.leaderboardPanel.setDepth(BATTLE_CONFIG.leaderboardDepth);
    this.leaderboardTitle = this.add
      .text(0, 0, "LIVE RANK", {
        fontFamily: "Arial, sans-serif",
        fontSize: "11px",
        color: "#dff6ff",
        fontStyle: "900",
        stroke: "#020617",
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5)
      .setDepth(BATTLE_CONFIG.leaderboardDepth + 2);

    this.leaderboardRows = this.tops.map((runtimeTop) => {
      const rowBackground = this.add.rectangle(0, 0, 10, 18, 0x07111f, 0.62).setOrigin(0, 0.5);
      rowBackground.setStrokeStyle(1, 0x24405f, 0.72);
      const rankText = this.add
        .text(0, 0, "1위", {
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
          color: "#ffd166",
          fontStyle: "900",
        })
        .setOrigin(0, 0.5);
      const playerText = this.add
        .text(0, 0, `${runtimeTop.data.selectionOrder}번`, {
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
          color: runtimeTop.isLocalPlayerTop ? "#ffd166" : "#f8fafc",
          fontStyle: "800",
        })
        .setOrigin(0, 0.5);
      const barBack = this.add.rectangle(0, 0, 54, 5, 0x020617, 0.95).setOrigin(0, 0.5);
      barBack.setStrokeStyle(1, 0xdff6ff, 0.35);
      const barFill = this.add.rectangle(0, 0, 54, 5, getEnergyColor(1), 1).setOrigin(0, 0.5);
      const container = this.add.container(0, 0, [rowBackground, rankText, playerText, barBack, barFill]);
      container.setDepth(BATTLE_CONFIG.leaderboardDepth + 1);

      return {
        playerId: runtimeTop.data.playerId,
        container,
        background: rowBackground,
        rankText,
        playerText,
        barBack,
        barFill,
      };
    });

    this.layoutLeaderboard(true);
    this.syncLeaderboard();
  }

  private getLeaderboardLayout(): { x: number; y: number; width: number; rowHeight: number; barWidth: number } {
    const width = clamp(this.sceneWidth * 0.19, BATTLE_CONFIG.leaderboardMinWidth, BATTLE_CONFIG.leaderboardMaxWidth);
    const rowHeight = this.sceneHeight <= 380 ? 20 : BATTLE_CONFIG.leaderboardRowHeight;
    const x = this.sceneWidth - width - 12;
    const y = this.sceneHeight <= 380 ? 52 : 72;
    const barWidth = Math.max(42, width - 96);

    return { x, y, width, rowHeight, barWidth };
  }

  private layoutLeaderboard(snap = false): void {
    if (!this.leaderboardPanel || !this.leaderboardTitle) {
      return;
    }

    const layout = this.getLeaderboardLayout();
    const panelHeight = 24 + this.leaderboardRows.length * layout.rowHeight + 8;
    this.leaderboardPanel.clear();
    this.leaderboardPanel.fillStyle(0x020617, 0.58);
    this.leaderboardPanel.fillRoundedRect(layout.x - 8, layout.y - 18, layout.width + 16, panelHeight, 9);
    this.leaderboardPanel.lineStyle(1, 0x7df9ff, 0.32);
    this.leaderboardPanel.strokeRoundedRect(layout.x - 8, layout.y - 18, layout.width + 16, panelHeight, 9);
    this.leaderboardTitle.setPosition(layout.x, layout.y - 7);

    this.leaderboardRows.forEach((row, index) => {
      const targetY = layout.y + 18 + index * layout.rowHeight;
      row.container.x = layout.x;
      if (snap) {
        row.container.y = targetY;
      }
      row.background.setSize(layout.width, layout.rowHeight - 4);
      row.rankText.setPosition(8, 0);
      row.playerText.setPosition(42, 0);
      row.barBack.setPosition(layout.width - layout.barWidth - 8, 0);
      row.barBack.setSize(layout.barWidth, 5);
      row.barFill.setPosition(layout.width - layout.barWidth - 8, 0);
    });
  }

  private syncLeaderboard(): void {
    if (!this.leaderboardPanel || this.leaderboardRows.length === 0) {
      return;
    }

    const layout = this.getLeaderboardLayout();
    const rankedTops = [...this.tops].sort((a, b) => b.data.energy / b.data.maxEnergy - a.data.energy / a.data.maxEnergy);
    const rankByPlayerId = new Map(rankedTops.map((runtimeTop, index) => [runtimeTop.data.playerId, index + 1]));
    const topByPlayerId = new Map(this.tops.map((runtimeTop) => [runtimeTop.data.playerId, runtimeTop]));

    this.leaderboardRows.sort((a, b) => (rankByPlayerId.get(a.playerId) ?? 99) - (rankByPlayerId.get(b.playerId) ?? 99));
    this.layoutLeaderboard(false);

    this.leaderboardRows.forEach((row, index) => {
      const runtimeTop = topByPlayerId.get(row.playerId);
      if (!runtimeTop) {
        row.container.setVisible(false);
        return;
      }

      const rank = rankByPlayerId.get(row.playerId) ?? index + 1;
      const energyRatio = clamp(runtimeTop.data.energy / runtimeTop.data.maxEnergy, 0, 1);
      const targetY = layout.y + 18 + index * layout.rowHeight;
      row.container.y += (targetY - row.container.y) * 0.18;
      row.rankText.setText(`${rank}위`);
      row.playerText.setText(`${runtimeTop.data.selectionOrder}번`);
      row.playerText.setColor(runtimeTop.isLocalPlayerTop ? "#ffd166" : "#f8fafc");
      row.barFill.setSize(layout.barWidth * energyRatio, 5);
      row.barFill.setFillStyle(getEnergyColor(energyRatio), runtimeTop.data.stopped ? 0.45 : 1);
      row.background.setFillStyle(runtimeTop.isLocalPlayerTop ? 0x13294b : 0x07111f, runtimeTop.isLocalPlayerTop ? 0.78 : 0.62);
      row.container.setAlpha(runtimeTop.data.stopped ? 0.55 : 1);
      row.container.setVisible(true);
    });
  }

  private createBladeSkinObjects(
    skin: BladeSkin,
    radius: number,
    primaryColor: number,
    secondaryColor: number,
    accentColor: number,
  ): Phaser.GameObjects.GameObject[] {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const ring = this.add.circle(0, 0, radius * 0.74, 0xffffff, 0);
    ring.setStrokeStyle(3, secondaryColor, 0.72);
    objects.push(ring);

    const offsetRing = this.add.circle(radius * 0.16, -radius * 0.12, radius * 0.46, 0xffffff, 0);
    offsetRing.setStrokeStyle(2, accentColor, 0.68);
    objects.push(offsetRing);

    if (skin.patternType === "grid" || skin.patternType === "shield") {
      for (let index = -1; index <= 1; index += 1) {
        const vertical = this.add.rectangle(index * radius * 0.28, 0, 3, radius * 1.45, accentColor, 0.32);
        const horizontal = this.add.rectangle(0, index * radius * 0.28, radius * 1.45, 3, secondaryColor, 0.3);
        objects.push(vertical, horizontal);
      }
    }

    if (skin.patternType === "stripe" || skin.patternType === "motion") {
      for (let index = -2; index <= 2; index += 1) {
        const stripe = this.add.rectangle(index * radius * 0.24, 0, 4, radius * 1.55, accentColor, 0.42);
        stripe.rotation = Math.PI / 5;
        objects.push(stripe);
      }
    }

    if (skin.patternType === "arrow") {
      const arrow = this.add.triangle(
        radius * 0.06,
        0,
        -radius * 0.45,
        -radius * 0.28,
        radius * 0.48,
        0,
        -radius * 0.45,
        radius * 0.28,
        accentColor,
        0.56,
      );
      objects.push(arrow);
    }

    if (skin.patternType === "plasma" || skin.patternType === "sun" || skin.patternType === "core") {
      for (let index = 0; index < 6; index += 1) {
        const ray = this.add.rectangle(0, -radius * 0.36, 4, radius * 0.75, accentColor, 0.36);
        ray.rotation = (Math.PI * 2 * index) / 6;
        objects.push(ray);
      }
    }

    if (skin.patternType === "spiral" || skin.patternType === "offset" || skin.patternType === "ring") {
      const smallRingA = this.add.circle(-radius * 0.22, radius * 0.12, radius * 0.28, 0xffffff, 0);
      const smallRingB = this.add.circle(radius * 0.24, -radius * 0.16, radius * 0.22, 0xffffff, 0);
      smallRingA.setStrokeStyle(2, accentColor, 0.58);
      smallRingB.setStrokeStyle(2, secondaryColor, 0.52);
      objects.push(smallRingA, smallRingB);
    }

    if (skin.patternType === "void") {
      const voidCore = this.add.circle(-radius * 0.08, radius * 0.08, radius * 0.34, primaryColor, 0.72);
      voidCore.setStrokeStyle(3, accentColor, 0.5);
      objects.push(voidCore);
    }

    return objects;
  }

  private updateTopMovement(time: number, deltaSeconds: number, elapsedMs: number): void {
    const elapsed = elapsedMs / 1000;
    const secondsSinceCollision = (time - this.lastCollisionAt) / 1000;
    const noCollisionBoost =
      secondsSinceCollision > BATTLE_CONFIG.noCollisionBoostDelay
        ? 1 +
          Math.min(1, (secondsSinceCollision - BATTLE_CONFIG.noCollisionBoostDelay) / 4) *
            (BATTLE_CONFIG.noCollisionBoostMultiplier - 1)
        : 1;

    this.tops.forEach((runtimeTop, index) => {
      const top = runtimeTop.data;
      if (top.stopped) {
        return;
      }

      applyPassiveDrain(top, deltaSeconds, runtimeTop.drainMultiplier, elapsedMs);
      const frameStartVx = top.vx;
      const frameStartVy = top.vy;
      this.applyCombatSteering(runtimeTop, index, time, deltaSeconds, elapsed, noCollisionBoost);

      const energyRatio = clamp(top.energy / top.maxEnergy, 0, 1);
      const lowEnergyWobble = energyRatio < 0.4 ? (0.4 - energyRatio) * BATTLE_CONFIG.lowEnergyWobbleMultiplier : 0;
      const wobbleAmount = ((1 - energyRatio) * 1.1 + lowEnergyWobble) / top.stability;
      const wobblePhase = time * 0.009 + index * 1.7;

      top.vx += Math.cos(wobblePhase) * wobbleAmount * 44 * deltaSeconds;
      top.vy += Math.sin(wobblePhase * 1.17) * wobbleAmount * 44 * deltaSeconds;
      this.clampFrameAcceleration(top, frameStartVx, frameStartVy);

      const drag = 1 - deltaSeconds * (0.08 + (1 - energyRatio) * 0.27);
      const globalDamping = 1 - BATTLE_CONFIG.velocityDamping * deltaSeconds;
      const frameDamping = clamp(drag * globalDamping, 0.88, 1);
      top.vx *= frameDamping;
      top.vy *= frameDamping;

      this.keepMinimumSpeed(top, elapsed, energyRatio);
      this.clampTopVelocity(top, elapsedMs);

      top.x += top.vx * deltaSeconds;
      top.y += top.vy * deltaSeconds;

      const wallImpact = resolveArenaWall(top, this.arena, elapsedMs, BATTLE_CONFIG);
      this.clampTopVelocity(top, elapsedMs);
      if (wallImpact && wallImpact.force > BATTLE_CONFIG.wallImpactEffectThreshold) {
        this.lastCollisionAt = time;
        const wallVisualKey = `wall-visual:${top.playerId}`;
        const lastWallVisualAt = this.visualCooldowns.get(wallVisualKey) ?? -Infinity;
        if (time - lastWallVisualAt > BATTLE_CONFIG.wallImpactVisualCooldownMs) {
          this.visualCooldowns.set(wallVisualKey, time);
          this.spawnSpark(wallImpact.x, wallImpact.y, 0x8ecae6, wallImpact.intensity, false);
        }
        this.playWallHitSound(top.playerId, time, wallImpact.intensity);
      }

      clampPreEliminationEnergy(top, elapsedMs, BATTLE_CONFIG);
      const speedNow = getMagnitude(top.vx, top.vy);
      if (
        elapsedMs >= BATTLE_CONFIG.minEliminationTimeMs &&
        (top.energy <= 0 || (top.energy < top.maxEnergy * 0.025 && speedNow < 16))
      ) {
        this.stopTop(runtimeTop, elapsed);
      }
    });
  }

  private applyCombatSteering(
    runtimeTop: RuntimeTop,
    index: number,
    time: number,
    deltaSeconds: number,
    elapsed: number,
    noCollisionBoost: number,
  ): void {
    const top = runtimeTop.data;
    const energyRatio = clamp(top.energy / top.maxEnergy, 0, 1);
    const dxCenter = this.arena.cx - top.x;
    const dyCenter = this.arena.cy - top.y;
    const distanceFromCenter = getMagnitude(dxCenter, dyCenter);
    const outerRatio = clamp(this.getEllipseRatio(top.x, top.y, top.radius), 0, 1);
    const centerNx = dxCenter / Math.max(distanceFromCenter, 0.001);
    const centerNy = dyCenter / Math.max(distanceFromCenter, 0.001);
    const boundaryBoost = outerRatio > 0.58 ? 1 + (outerRatio - 0.58) * 2.9 : 1;
    const centerForce =
      (BATTLE_CONFIG.centerAttractionStrength * runtimeTop.centerBias +
        BATTLE_CONFIG.boundaryCorrectionStrength * Math.max(0, outerRatio - 0.72)) *
      boundaryBoost *
      noCollisionBoost;

    top.vx += centerNx * centerForce * deltaSeconds;
    top.vy += centerNy * centerForce * deltaSeconds;

    if (time >= runtimeTop.nextTargetAt || !this.isTargetValid(runtimeTop.targetPlayerId)) {
      runtimeTop.targetPlayerId = this.pickTarget(runtimeTop);
      runtimeTop.nextTargetAt =
        time + Phaser.Math.Between(BATTLE_CONFIG.targetRetargetMinMs, BATTLE_CONFIG.targetRetargetMaxMs);
    }

    const target = this.tops.find((candidate) => candidate.data.playerId === runtimeTop.targetPlayerId);
    if (target && !target.data.stopped) {
      const dx = target.data.x - top.x;
      const dy = target.data.y - top.y;
      const distance = Math.max(0.001, getMagnitude(dx, dy));
      const earlyBoost =
        elapsed < BATTLE_CONFIG.battleStartBoostDuration
          ? 1 + (1 - elapsed / BATTLE_CONFIG.battleStartBoostDuration) * 0.28
          : 1;
      const targetForce =
        BATTLE_CONFIG.targetSeekingStrength *
        runtimeTop.aggression *
        noCollisionBoost *
        earlyBoost *
        (0.78 + energyRatio * 0.28);
      top.vx += (dx / distance) * targetForce * deltaSeconds;
      top.vy += (dy / distance) * targetForce * deltaSeconds;
    }

    if (time >= runtimeTop.nextRandomSteerAt) {
      const randomAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const stuckBoost = runtimeTop.stuckSeconds > 1.2 ? 1.9 : 1;
      runtimeTop.randomSteerX = Math.cos(randomAngle) * stuckBoost;
      runtimeTop.randomSteerY = Math.sin(randomAngle) * stuckBoost;
      runtimeTop.nextRandomSteerAt = time + Phaser.Math.Between(620, 1150);
    }

    if (time - runtimeTop.lastSampleAt > 850) {
      const moved = getMagnitude(top.x - runtimeTop.sampleX, top.y - runtimeTop.sampleY);
      runtimeTop.stuckSeconds = moved < 18 ? runtimeTop.stuckSeconds + 0.85 : 0;
      runtimeTop.sampleX = top.x;
      runtimeTop.sampleY = top.y;
      runtimeTop.lastSampleAt = time;
    }

    const randomForce =
      BATTLE_CONFIG.randomSteeringStrength *
      (runtimeTop.stuckSeconds > 0 ? 1.3 : 1) *
      (noCollisionBoost > 1 ? 1.18 : 1);
    top.vx += runtimeTop.randomSteerX * randomForce * deltaSeconds;
    top.vy += runtimeTop.randomSteerY * randomForce * deltaSeconds;

    if (index % 2 === 0 && energyRatio < 0.25) {
      top.vx += Math.sin(time * 0.01 + index) * 12 * deltaSeconds;
      top.vy += Math.cos(time * 0.011 + index) * 12 * deltaSeconds;
    }
  }

  private keepMinimumSpeed(top: BattleTopData, elapsed: number, energyRatio: number): void {
    if (energyRatio < 0.16) {
      return;
    }

    const currentSpeed = getMagnitude(top.vx, top.vy);
    const startBoost =
      elapsed < BATTLE_CONFIG.battleStartBoostDuration
        ? 1 + (1 - elapsed / BATTLE_CONFIG.battleStartBoostDuration) * 0.18
        : 1;
    const minSpeed = BATTLE_CONFIG.minMoveSpeed * startBoost * clamp(0.72 + energyRatio * 0.38, 0.72, 1.1);

    if (currentSpeed <= 0.001 || currentSpeed >= minSpeed) {
      return;
    }

    const multiplier = minSpeed / currentSpeed;
    top.vx *= multiplier;
    top.vy *= multiplier;
  }

  private clampFrameAcceleration(top: BattleTopData, startVx: number, startVy: number): void {
    if (top.stopped) {
      top.vx = 0;
      top.vy = 0;
      return;
    }

    const deltaVx = top.vx - startVx;
    const deltaVy = top.vy - startVy;
    const accelerationThisFrame = getMagnitude(deltaVx, deltaVy);
    if (accelerationThisFrame <= BATTLE_CONFIG.maxAccelerationPerFrame || accelerationThisFrame <= 0.001) {
      return;
    }

    const scale = BATTLE_CONFIG.maxAccelerationPerFrame / accelerationThisFrame;
    top.vx = startVx + deltaVx * scale;
    top.vy = startVy + deltaVy * scale;
  }

  private clampTopVelocity(top: BattleTopData, elapsedMs: number): void {
    clampVelocity(top, getMaxTopSpeed(top, elapsedMs, BATTLE_CONFIG));
  }

  private resolveCollisions(time: number, elapsedMs: number): void {
    const aliveCount = this.getAliveCount();

    for (let i = 0; i < this.tops.length; i += 1) {
      for (let j = i + 1; j < this.tops.length; j += 1) {
        const pairKey = getPairKey(this.tops[i].data.playerId, this.tops[j].data.playerId);
        const history = this.pairCollisionHistories.get(pairKey);
        const lastDamageAt = history?.lastDamageAt ?? -Infinity;
        const lastVisualAt = this.visualCooldowns.get(pairKey) ?? -Infinity;
        const canApplyDamage = time - lastDamageAt > BATTLE_CONFIG.damageCooldownMs;
        const nextRepeatCount =
          history && time - history.lastDamageAt < BATTLE_CONFIG.repeatedCollisionWindowMs
            ? history.repeatCount + 1
            : 0;
        const repeatedCollisionPenalty = clamp(
          BATTLE_CONFIG.repeatedCollisionPenaltyMultiplier ** nextRepeatCount,
          BATTLE_CONFIG.repeatedCollisionMinMultiplier,
          1,
        );

        const impact = resolveTopCollision(this.tops[i].data, this.tops[j].data, {
          applyDamage: canApplyDamage,
          elapsedMs,
          aliveCount,
          repeatedCollisionPenalty,
          spinDirectionA: this.tops[i].spinDirection,
          spinDirectionB: this.tops[j].spinDirection,
          config: BATTLE_CONFIG,
        });
        if (!impact) {
          continue;
        }

        this.clampTopVelocity(this.tops[i].data, elapsedMs);
        this.clampTopVelocity(this.tops[j].data, elapsedMs);
        this.lastCollisionAt = time;
        this.tops[i].stuckSeconds = 0;
        this.tops[j].stuckSeconds = 0;
        this.playCollisionSound(pairKey, time, impact.intensity);
        clampPreEliminationEnergy(this.tops[i].data, elapsedMs, BATTLE_CONFIG);
        clampPreEliminationEnergy(this.tops[j].data, elapsedMs, BATTLE_CONFIG);

        if (canApplyDamage) {
          this.pairCollisionHistories.set(pairKey, {
            lastDamageAt: time,
            repeatCount: nextRepeatCount,
          });
        }

        if (time - lastVisualAt > BATTLE_CONFIG.collisionVisualCooldownMs) {
          this.visualCooldowns.set(pairKey, time);
          const isStrong = impact.intensity >= BATTLE_CONFIG.strongImpactThreshold;
          const hasElectricArc = isStrong && impact.intensity >= BATTLE_CONFIG.electricArcImpactThreshold;
          this.spawnSpark(impact.x, impact.y, 0xffd166, impact.intensity, isStrong);
          this.flashTop(this.tops[i], isStrong);
          this.flashTop(this.tops[j], isStrong);
          if (hasElectricArc) {
            this.spawnElectricArc(impact.x, impact.y, impact.intensity);
          }
          if (isStrong) {
            this.spawnImpactText(impact.x, impact.y, impact.intensity, time);
            this.cameras.main.shake(120, clamp(BATTLE_CONFIG.cameraShakeIntensity * (impact.intensity / 100), 0.0015, 0.007));
          }
        }
      }
    }
  }

  private updateLoserCandidate(elapsedMs: number): void {
    if (!BATTLE_CONFIG.loserCandidateHighlightEnabled || this.finalLoserPlayerId) {
      return;
    }

    const aliveTops = this.tops.filter((runtimeTop) => !runtimeTop.data.stopped);
    if (elapsedMs < BATTLE_CONFIG.loserCandidateStartDelayMs || aliveTops.length <= 1) {
      this.setLoserCandidate(null);
      return;
    }

    const highestEnergyTop = aliveTops.reduce((highest, current) => {
      const currentRatio = current.data.energy / current.data.maxEnergy;
      const highestRatio = highest.data.energy / highest.data.maxEnergy;
      return currentRatio > highestRatio ? current : highest;
    });

    this.setLoserCandidate(highestEnergyTop.data.playerId);
  }

  private setLoserCandidate(playerId: string | null): void {
    this.loserCandidatePlayerId = playerId;
    this.tops.forEach((runtimeTop) => {
      runtimeTop.isLoserCandidateTop = runtimeTop.data.playerId === playerId;
    });
  }

  private emitStateChange(time: number, force = false): void {
    if (!this.options.onStateChange) {
      return;
    }

    if (!force && time - this.lastLiveUpdateAt < 120) {
      return;
    }

    this.lastLiveUpdateAt = time;
    const elapsedMs = this.battleClockReady ? Math.max(0, time - this.startTime) : 0;
    const remainingMs = Math.max(0, BATTLE_CONFIG.maxBattleDurationMs - elapsedMs);
    const currentLeaderId = this.getCurrentLeader()?.data.playerId ?? null;

    this.options.onStateChange({
      elapsedMs,
      remainingMs,
      tops: this.tops.map((runtimeTop) => ({
        playerId: runtimeTop.data.playerId,
        nickname: runtimeTop.data.nickname,
        bladeSkinId: runtimeTop.data.bladeSkinId,
        skinName: runtimeTop.data.skinName,
        selectionOrder: runtimeTop.data.selectionOrder,
        energy: Math.max(0, runtimeTop.data.energy),
        maxEnergy: runtimeTop.data.maxEnergy,
        stopped: runtimeTop.data.stopped,
        isLocalPlayerTop: runtimeTop.isLocalPlayerTop,
        isCurrentLeader: runtimeTop.data.playerId === currentLeaderId,
        isFinalBeverageBuyer: runtimeTop.isFinalLoserTop,
      })),
    });
  }

  private syncVisuals(time: number, deltaSeconds: number): void {
    this.tops.forEach((runtimeTop, index) => {
      const top = runtimeTop.data;
      const energyRatio = clamp(top.energy / top.maxEnergy, 0, 1);
      const lowEnergyWobble = energyRatio < 0.4 ? (0.4 - energyRatio) * BATTLE_CONFIG.lowEnergyWobbleMultiplier : 0;
      const wobble = ((1 - energyRatio) * 0.12 + lowEnergyWobble * 0.08) / top.stability;
      const scaleX = top.stopped ? 0.96 : 1 + Math.sin(time * 0.025 + index) * wobble;
      const scaleY = top.stopped ? 0.9 : 1 - Math.sin(time * 0.021 + index) * wobble;
      const spinEnergyFactor = top.stopped ? 0 : clamp(0.26 + energyRatio * 0.9, 0, 1.16);
      const visualSpin =
        (BATTLE_CONFIG.baseSpinVisualSpeed + top.spinSpeed * BATTLE_CONFIG.spinVisualSpeedMultiplier) *
        spinEnergyFactor *
        deltaSeconds;

      runtimeTop.container.setPosition(top.x, top.y);
      runtimeTop.container.setScale(scaleX, scaleY);
      runtimeTop.container.rotation += runtimeTop.spinDirection * visualSpin;
      runtimeTop.container.setAlpha(top.stopped ? 0.42 : 1);
      runtimeTop.marker.setAlpha(top.stopped ? 0.25 : 0.9);
      const orderBadgeX = clamp(top.x, runtimeTop.isLocalPlayerTop ? 58 : 36, this.sceneWidth - (runtimeTop.isLocalPlayerTop ? 58 : 36));
      const orderBadgeY = clamp(top.y - top.radius - 38, 14, this.sceneHeight - 18);
      const labelX = clamp(top.x, 50, this.sceneWidth - 50);
      const labelY = clamp(top.y + top.radius + 15, 18, this.sceneHeight - 24);
      const energyBarX = clamp(top.x, 30, this.sceneWidth - 30);
      const energyBarY = clamp(top.y + top.radius + 33, 28, this.sceneHeight - 8);
      runtimeTop.orderBadge.setPosition(orderBadgeX, orderBadgeY);
      runtimeTop.orderBadge.setAlpha(top.stopped ? 0.62 : 0.94);
      runtimeTop.label.setPosition(labelX, labelY);
      runtimeTop.label.setAlpha(top.stopped ? 0.55 : 1);
      runtimeTop.energyBarBack.setPosition(energyBarX, energyBarY);
      runtimeTop.energyBarBack.setFillStyle(0x020617, top.stopped ? 0.58 : 0.96);
      runtimeTop.energyBarBack.setStrokeStyle(1, 0xdff6ff, top.stopped ? 0.32 : 0.6);
      runtimeTop.energyBar.setPosition(energyBarX - 27, energyBarY);
      runtimeTop.energyBar.width = 54 * energyRatio;
      runtimeTop.energyBar.setFillStyle(getEnergyColor(energyRatio), 1);
      runtimeTop.energyBar.setAlpha(top.stopped ? 0.35 : 1);
      this.drawEnergyRing(runtimeTop, energyRatio);
      this.syncLoserHighlight(runtimeTop, time);
      this.syncLocalPlayerHighlight(runtimeTop, time);
    });
  }

  private drawEnergyRing(runtimeTop: RuntimeTop, energyRatio: number): void {
    const top = runtimeTop.data;
    const ring = runtimeTop.energyRing;
    ring.clear();
    ring.setPosition(top.x, top.y);
    ring.lineStyle(3, 0x020617, top.stopped ? 0.28 : 0.58);
    ring.strokeCircle(0, 0, top.radius + 7);
    ring.lineStyle(4, getEnergyColor(energyRatio), top.stopped ? 0.24 : 0.92);
    ring.beginPath();
    ring.arc(0, 0, top.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * energyRatio, false);
    ring.strokePath();
  }

  private syncLoserHighlight(runtimeTop: RuntimeTop, time: number): void {
    const shouldShow = runtimeTop.isLoserCandidateTop || runtimeTop.isFinalLoserTop;
    const ring = runtimeTop.loserHighlightRing;
    const badge = runtimeTop.loserBadge;

    if (!shouldShow) {
      ring.clear();
      badge.setVisible(false);
      return;
    }

    const top = runtimeTop.data;
    const isFinal = runtimeTop.isFinalLoserTop;
    const pulse = (Math.sin(time * BATTLE_CONFIG.loserCandidatePulseSpeed) + 1) / 2;
    const baseRadius = top.radius + (isFinal ? 23 : 17);
    const pulseRadius = baseRadius + pulse * (isFinal ? 8 : 5);
    const glowAlpha = isFinal ? 0.42 + pulse * 0.3 : 0.24 + pulse * 0.22;
    const ringAlpha = isFinal ? 0.9 : 0.58 + pulse * 0.34;

    ring.clear();
    ring.setPosition(top.x, top.y);
    ring.setDepth(isFinal ? BATTLE_CONFIG.finalLoserHighlightDepth : BATTLE_CONFIG.loserCandidateHighlightDepth);
    ring.lineStyle(isFinal ? 14 : 9, BATTLE_CONFIG.loserCandidateGlowColor, glowAlpha);
    ring.strokeCircle(0, 0, pulseRadius + (isFinal ? 7 : 5));
    ring.lineStyle(isFinal ? 6 : 4, isFinal ? BATTLE_CONFIG.finalLoserRingColor : BATTLE_CONFIG.loserCandidateRingColor, ringAlpha);
    ring.strokeCircle(0, 0, pulseRadius);
    ring.lineStyle(2, 0xfff1d0, isFinal ? 0.8 : 0.52);
    ring.strokeCircle(0, 0, baseRadius - 4);

    badge
      .setText(isFinal ? "담당!" : "생존 후보")
      .setPosition(
        clamp(top.x, 44, this.sceneWidth - 44),
        clamp(
          top.y - top.radius - 62 - pulse * 2,
          14,
          this.sceneHeight - 18,
        ),
      )
      .setAlpha(top.stopped ? 0.86 : 0.9 + pulse * 0.1)
      .setBackgroundColor(isFinal ? "rgba(255, 209, 102, 0.96)" : "rgba(45, 212, 191, 0.9)")
      .setVisible(true);
  }

  private syncLocalPlayerHighlight(runtimeTop: RuntimeTop, time: number): void {
    if (!runtimeTop.isLocalPlayerTop || !runtimeTop.localHighlightRing) {
      return;
    }

    const top = runtimeTop.data;
    const pulse = (Math.sin(time * BATTLE_CONFIG.localPlayerPulseSpeed) + 1) / 2;
    const stoppedAlphaMultiplier = top.stopped ? 0.45 : 1;
    const ringAlpha = (0.4 + pulse * 0.6) * stoppedAlphaMultiplier;
    const glowAlpha = (0.2 + pulse * 0.25) * stoppedAlphaMultiplier;
    const baseRadius = top.radius + (runtimeTop.isLoserCandidateTop || runtimeTop.isFinalLoserTop ? 31 : 14);
    const pulseRadius = baseRadius + pulse * 5;

    runtimeTop.localHighlightRing.clear();
    runtimeTop.localHighlightRing.setPosition(top.x, top.y);
    runtimeTop.localHighlightRing.lineStyle(9, BATTLE_CONFIG.localPlayerGlowColor, glowAlpha);
    runtimeTop.localHighlightRing.strokeCircle(0, 0, pulseRadius + 6);
    runtimeTop.localHighlightRing.lineStyle(4, BATTLE_CONFIG.localPlayerRingColor, ringAlpha);
    runtimeTop.localHighlightRing.strokeCircle(0, 0, pulseRadius);
    runtimeTop.localHighlightRing.lineStyle(2, 0xffffff, ringAlpha * 0.82);
    runtimeTop.localHighlightRing.strokeCircle(0, 0, top.radius + 8);

    const markerY = clamp(top.y - top.radius - 23 - pulse * 3, 16, this.sceneHeight - 20);
    runtimeTop.localMarker?.setPosition(clamp(top.x, 18, this.sceneWidth - 18), markerY);
    runtimeTop.localMarker?.setAlpha(top.stopped ? 0.5 : 0.86 + pulse * 0.14);
    runtimeTop.localMarker?.setScale(1 + pulse * 0.1);
  }

  private markFinalLoser(playerId: string): void {
    if (this.finalLoserPlayerId === playerId) {
      return;
    }

    this.finalLoserPlayerId = playerId;
    this.setLoserCandidate(playerId);

    const finalLoser = this.tops.find((runtimeTop) => runtimeTop.data.playerId === playerId);
    this.tops.forEach((runtimeTop) => {
      runtimeTop.isFinalLoserTop = runtimeTop.data.playerId === playerId;
    });

    if (!finalLoser) {
      return;
    }

    const now = this.time.now;
    this.syncLoserHighlight(finalLoser, now);
    this.syncLocalPlayerHighlight(finalLoser, now);
    this.spawnFinalLoserShockwave(finalLoser);
    this.flashTop(finalLoser, true);
    this.emitStateChange(now, true);
  }

  private spawnFinalLoserShockwave(runtimeTop: RuntimeTop): void {
    const top = runtimeTop.data;
    const shockwave = this.add.circle(top.x, top.y, top.radius + 18, 0xffffff, 0);
    shockwave.setStrokeStyle(8, BATTLE_CONFIG.finalLoserRingColor, 0.92);
    shockwave.setDepth(BATTLE_CONFIG.finalLoserHighlightDepth + 1);

    const redFlash = this.add.circle(top.x, top.y, top.radius + 10, BATTLE_CONFIG.finalLoserGlowColor, 0.34);
    redFlash.setDepth(BATTLE_CONFIG.finalLoserHighlightDepth);

    const finalText = this.add
      .text(top.x, top.y + top.radius + 54, runtimeTop.isLocalPlayerTop ? "내 팽이 · 담당!" : "음료수 담당!", {
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        color: "#07111f",
        fontStyle: "900",
        stroke: "#ffffff",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setPadding(10, 3, 10, 3)
      .setBackgroundColor("rgba(255, 209, 102, 0.96)")
      .setDepth(BATTLE_CONFIG.finalLoserHighlightDepth + 4);
    finalText.setPosition(clamp(finalText.x, 76, this.sceneWidth - 76), clamp(finalText.y, 24, this.sceneHeight - 20));

    this.tweens.add({
      targets: shockwave,
      alpha: 0,
      scaleX: 3.4,
      scaleY: 3.4,
      duration: 760,
      ease: "Cubic.easeOut",
      onComplete: () => shockwave.destroy(),
    });
    this.tweens.add({
      targets: redFlash,
      alpha: 0,
      scaleX: 2.25,
      scaleY: 2.25,
      duration: 520,
      ease: "Quad.easeOut",
      onComplete: () => redFlash.destroy(),
    });
    this.tweens.add({
      targets: finalText,
      y: finalText.y - 18,
      alpha: 0,
      duration: 880,
      ease: "Quad.easeOut",
      onComplete: () => finalText.destroy(),
    });
  }

  private stopTop(runtimeTop: RuntimeTop, elapsed: number): void {
    const top = runtimeTop.data;
    if (top.stopped) {
      return;
    }

    top.stopped = true;
    top.stoppedAt = elapsed;
    top.vx = 0;
    top.vy = 0;
    top.energy = Math.max(0, top.energy);
    runtimeTop.body.setFillStyle(0x9aa6b2, 1);
    runtimeTop.body.setStrokeStyle(3, 0x516070, 0.8);
    this.eventText?.setText(`${top.nickname} 탈락. 마지막 생존자를 가리는 중입니다.`);
  }

  private flashTop(runtimeTop: RuntimeTop, isStrong: boolean): void {
    this.tweens.add({
      targets: [runtimeTop.body, runtimeTop.marker],
      scaleX: isStrong ? 1.3 : 1.16,
      scaleY: isStrong ? 1.3 : 1.16,
      yoyo: true,
      duration: isStrong ? 95 : 70,
      ease: "Quad.easeOut",
    });
  }

  private spawnSpark(x: number, y: number, color: number, intensity: number, isStrong: boolean): void {
    const perImpactMax = isStrong
      ? BATTLE_CONFIG.maxSparkParticlesPerImpact
      : BATTLE_CONFIG.maxWeakSparkParticlesPerImpact;
    const availableSparkSlots = BATTLE_CONFIG.maxActiveSparkParticles - this.activeSparkCount;
    const particleCount = Math.min(
      availableSparkSlots,
      Math.round(clamp(intensity / 22, 3, perImpactMax)),
    );
    if (particleCount <= 0) {
      return;
    }

    const baseRadius = clamp(intensity * 0.045, 5, isStrong ? 16 : 11);

    for (let i = 0; i < particleCount; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.FloatBetween(14, isStrong ? 46 : 30);
      const spark = this.add.circle(
        x + Math.cos(angle) * Phaser.Math.FloatBetween(0, 5),
        y + Math.sin(angle) * Phaser.Math.FloatBetween(0, 5),
        Phaser.Math.FloatBetween(2.5, baseRadius),
        color,
        Phaser.Math.FloatBetween(0.58, 0.95),
      );
      this.activeSparkCount += 1;
      spark.setDepth(56);
      spark.setStrokeStyle(1, 0xffffff, 0.55);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scaleX: isStrong ? 2.3 : 1.8,
        scaleY: isStrong ? 2.3 : 1.8,
        duration: Phaser.Math.Between(180, isStrong ? 380 : 260),
        ease: "Quad.easeOut",
        onComplete: () => {
          this.activeSparkCount = Math.max(0, this.activeSparkCount - 1);
          spark.destroy();
        },
      });
    }

    if (isStrong) {
      const flash = this.add.circle(x, y, baseRadius * 1.35, 0xffffff, 0.5);
      flash.setStrokeStyle(3, color, 0.85);
      flash.setDepth(57);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scaleX: 3.1,
        scaleY: 3.1,
        duration: 260,
        ease: "Cubic.easeOut",
        onComplete: () => flash.destroy(),
      });
    }
  }

  private spawnLaunchBurst(): void {
    this.cameras.main.shake(180, 0.0022);

    const burst = this.add.circle(this.arena.cx, this.arena.cy, 26, 0xffffff, 0.44);
    burst.setStrokeStyle(4, 0x8ecae6, 0.78);
    burst.setDepth(8);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scaleX: 9,
      scaleY: 9,
      duration: 520,
      ease: "Cubic.easeOut",
      onComplete: () => burst.destroy(),
    });

    const launchText = this.add
      .text(this.arena.cx, this.arena.cy - 10, "고~~ 슛!", {
        fontFamily: "Arial, sans-serif",
        fontSize: "42px",
        color: "#eb5757",
        fontStyle: "900",
        stroke: "#ffffff",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(9);
    this.tweens.add({
      targets: launchText,
      y: this.arena.cy - 64,
      alpha: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 720,
      ease: "Quad.easeOut",
      onComplete: () => launchText.destroy(),
    });
  }

  private spawnLocalPlayerFocusCue(): void {
    const localTop = this.tops.find((runtimeTop) => runtimeTop.isLocalPlayerTop);
    if (!localTop || !BATTLE_CONFIG.localPlayerHighlightEnabled) {
      return;
    }

    const { data: top } = localTop;
    const focusRing = this.add.circle(top.x, top.y, top.radius + 18, 0xffffff, 0);
    focusRing.setStrokeStyle(6, BATTLE_CONFIG.localPlayerRingColor, 0.95);
    focusRing.setDepth(BATTLE_CONFIG.localPlayerHighlightDepth + 12);

    const focusGlow = this.add.circle(top.x, top.y, top.radius + 28, BATTLE_CONFIG.localPlayerGlowColor, 0.16);
    focusGlow.setStrokeStyle(4, BATTLE_CONFIG.localPlayerGlowColor, 0.68);
    focusGlow.setDepth(BATTLE_CONFIG.localPlayerHighlightDepth + 11);

    const focusText = this.add
      .text(top.x, top.y - top.radius - 58, "내 팽이 출격!", {
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        color: "#07111f",
        fontStyle: "900",
        stroke: "#ffffff",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setPadding(10, 3, 10, 3)
      .setBackgroundColor("rgba(255, 209, 102, 0.96)")
      .setDepth(BATTLE_CONFIG.localPlayerHighlightDepth + 13);

    this.tweens.add({
      targets: [focusRing, focusGlow],
      alpha: 0,
      scaleX: 2.6,
      scaleY: 2.6,
      duration: 1200,
      ease: "Cubic.easeOut",
      onComplete: () => {
        focusRing.destroy();
        focusGlow.destroy();
      },
    });
    this.tweens.add({
      targets: focusText,
      y: focusText.y - 18,
      alpha: 0,
      duration: 1350,
      ease: "Quad.easeOut",
      onComplete: () => focusText.destroy(),
    });
  }

  private spawnElectricArc(x: number, y: number, intensity: number): void {
    if (this.electricArcGraphics.length >= BATTLE_CONFIG.maxActiveElectricArcs) {
      return;
    }

    const now = this.time.now;
    const distanceFromLastArc = getMagnitude(x - this.lastElectricArcX, y - this.lastElectricArcY);
    if (
      now - this.lastElectricArcAt < BATTLE_CONFIG.electricArcCooldownMs &&
      distanceFromLastArc < BATTLE_CONFIG.electricArcMinDistance
    ) {
      return;
    }

    this.lastElectricArcAt = now;
    this.lastElectricArcX = x;
    this.lastElectricArcY = y;

    const graphics = this.add.graphics();
    graphics.setDepth(58);

    const normalized = clamp(intensity / 180, 0.45, 1.35);
    const arcCount = Math.round(clamp(intensity / 34, 3, 7));
    const maxLength = clamp(intensity * 0.34 * BATTLE_CONFIG.electricArcScaleMultiplier, 30, 72);
    const glowAlpha = clamp(0.28 + normalized * 0.22, 0.36, 0.68);

    for (let arcIndex = 0; arcIndex < arcCount; arcIndex += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const segments = Phaser.Math.Between(4, 7);
      const points: Array<{ x: number; y: number }> = [];
      let currentX = x + Math.cos(angle) * Phaser.Math.FloatBetween(3, 10);
      let currentY = y + Math.sin(angle) * Phaser.Math.FloatBetween(3, 10);
      points.push({ x: currentX, y: currentY });

      for (let segment = 1; segment <= segments; segment += 1) {
        const progress = segment / segments;
        const jitter = Phaser.Math.FloatBetween(-16, 16) * normalized;
        currentX = x + Math.cos(angle) * maxLength * progress + Math.cos(angle + Math.PI / 2) * jitter;
        currentY = y + Math.sin(angle) * maxLength * progress + Math.sin(angle + Math.PI / 2) * jitter;
        points.push({ x: currentX, y: currentY });
      }

      graphics.lineStyle(Phaser.Math.Between(4, 6), 0x4cc9f0, glowAlpha);
      graphics.beginPath();
      graphics.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
      graphics.strokePath();

      graphics.lineStyle(Phaser.Math.Between(1, 3), 0xffffff, 0.86);
      graphics.beginPath();
      graphics.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
      graphics.strokePath();

      const sparkPoint = points[points.length - 1];
      graphics.fillStyle(0xffd166, 0.92);
      graphics.fillCircle(sparkPoint.x, sparkPoint.y, Phaser.Math.FloatBetween(2.5, 5.5));
    }

    const flash = this.add.circle(x, y, clamp(intensity * 0.12, 14, 30), 0xe8fbff, 0.24);
    flash.setStrokeStyle(4, 0x4cc9f0, 0.42);
    flash.setDepth(57);

    this.electricArcGraphics.push(graphics);
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: Phaser.Math.Between(190, 340),
      ease: "Quad.easeOut",
      onComplete: () => {
        this.electricArcGraphics = this.electricArcGraphics.filter((item) => item !== graphics);
        graphics.destroy();
      },
    });
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 2.8,
      scaleY: 2.8,
      duration: 260,
      ease: "Cubic.easeOut",
      onComplete: () => flash.destroy(),
    });
  }

  private playCollisionSound(pairKey: string, time: number, intensity: number): void {
    const lastPairSoundAt = this.soundCooldowns.get(`pair:${pairKey}`) ?? -Infinity;
    if (time - lastPairSoundAt < PAIR_SOUND_COOLDOWN_MS || time - this.lastImpactSoundAt < GLOBAL_IMPACT_SOUND_COOLDOWN_MS) {
      return;
    }

    this.soundCooldowns.set(`pair:${pairKey}`, time);
    this.lastImpactSoundAt = time;
    audioManager.playMetalImpact(intensity);
  }

  private playWallHitSound(playerId: string, time: number, intensity: number): void {
    const key = `wall:${playerId}`;
    const lastWallSoundAt = this.soundCooldowns.get(key) ?? -Infinity;
    if (time - lastWallSoundAt < WALL_SOUND_COOLDOWN_MS || time - this.lastImpactSoundAt < GLOBAL_IMPACT_SOUND_COOLDOWN_MS) {
      return;
    }

    this.soundCooldowns.set(key, time);
    this.lastImpactSoundAt = time;
    audioManager.playWallHit(intensity);
  }

  private spawnImpactText(x: number, y: number, intensity: number, time: number): void {
    if (intensity < BATTLE_CONFIG.impactTextMinIntensity || time - this.lastImpactTextAt < BATTLE_CONFIG.impactTextCooldownMs) {
      return;
    }
    this.lastImpactTextAt = time;

    const text = this.add
      .text(x, y - 18, intensity > 140 ? "쾅!" : "탕!", {
        fontFamily: "Arial, sans-serif",
        fontSize: intensity > 140 ? "28px" : "22px",
        color: "#eb5757",
        fontStyle: "900",
        stroke: "#ffffff",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(80);
    this.tweens.add({
      targets: text,
      y: y - 50,
      alpha: 0,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 430,
      ease: "Quad.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  private finishBattle(
    reason: BattleResult["reason"],
    duration: number,
    beverageBuyerId: string,
    delayMs: number,
  ): void {
    if (this.finished || this.cleanedUp) {
      return;
    }
    this.markFinalLoser(beverageBuyerId);
    this.finished = true;
    if (this.maxBattleTimeoutId !== null) {
      window.clearTimeout(this.maxBattleTimeoutId);
      this.maxBattleTimeoutId = null;
    }

    const deliverResult = () => {
      if (this.cleanedUp) {
        return;
      }
      this.finishTimeoutId = null;

      const summaries = this.createSummaries(duration);
      const beverageBuyer = summaries.find((summary) => summary.playerId === beverageBuyerId) ?? summaries[0];

      this.options.onFinished({
        loserId: beverageBuyer.playerId,
        loserNickname: beverageBuyer.nickname,
        beverageBuyerId: beverageBuyer.playerId,
        beverageBuyerNickname: beverageBuyer.nickname,
        reason,
        duration,
        summaries,
      });
    };

    if (delayMs <= 0) {
      deliverResult();
      return;
    }

    this.finishTimeoutId = window.setTimeout(deliverResult, delayMs);
  }

  private forceFinishByTimeLimit(): void {
    if (this.finished || this.cleanedUp || this.tops.length === 0) {
      return;
    }

    const beverageBuyerTop = this.pickTimeLimitBeverageBuyer();
    this.eventText?.setText("제한 시간 종료. 남은 에너지가 가장 높은 플레이어가 음료수 담당입니다.");
    this.finishBattle(
      "time-highest-energy",
      BATTLE_CONFIG.maxBattleDurationMs / 1000,
      beverageBuyerTop.data.playerId,
      850,
    );
  }

  private createSummaries(duration: number): BattleSummary[] {
    return this.tops
      .map((runtimeTop) => ({
        playerId: runtimeTop.data.playerId,
        nickname: runtimeTop.data.nickname,
        bladeSkinId: runtimeTop.data.bladeSkinId,
        skinName: runtimeTop.data.skinName,
        topType: runtimeTop.data.topType,
        survivalTime: runtimeTop.data.stoppedAt ?? duration,
        remainingEnergy: Math.max(0, runtimeTop.data.energy),
      }))
      .sort((a, b) => b.survivalTime - a.survivalTime || b.remainingEnergy - a.remainingEnergy);
  }

  private getAliveCount(): number {
    return this.tops.filter((top) => !top.data.stopped).length;
  }

  private getAliveTops(): RuntimeTop[] {
    return this.tops.filter((top) => !top.data.stopped);
  }

  private getCurrentLeader(): RuntimeTop | null {
    const aliveTops = this.getAliveTops();
    if (aliveTops.length === 0) {
      return null;
    }

    return aliveTops.reduce((leader, current) => {
      const leaderRatio = leader.data.energy / leader.data.maxEnergy;
      const currentRatio = current.data.energy / current.data.maxEnergy;
      return currentRatio > leaderRatio ? current : leader;
    });
  }

  private pickTimeLimitBeverageBuyer(): RuntimeTop {
    return this.getCurrentLeader() ?? this.pickFallbackLastSurvivor();
  }

  private pickFallbackLastSurvivor(): RuntimeTop {
    return [...this.tops].sort((a, b) => {
      const stoppedAtDiff = (b.data.stoppedAt ?? -Infinity) - (a.data.stoppedAt ?? -Infinity);
      if (stoppedAtDiff !== 0) {
        return stoppedAtDiff;
      }

      return b.data.energy - a.data.energy;
    })[0];
  }

  private isTargetValid(playerId: string | null): boolean {
    return !!playerId && this.tops.some((candidate) => candidate.data.playerId === playerId && !candidate.data.stopped);
  }

  private pickTarget(runtimeTop: RuntimeTop): string | null {
    const candidates = this.tops.filter(
      (candidate) => candidate.data.playerId !== runtimeTop.data.playerId && !candidate.data.stopped,
    );
    if (candidates.length === 0) {
      return null;
    }

    if (Math.random() < 0.42) {
      return Phaser.Utils.Array.GetRandom(candidates).data.playerId;
    }

    return candidates
      .sort(
        (a, b) =>
          getMagnitude(a.data.x - runtimeTop.data.x, a.data.y - runtimeTop.data.y) -
          getMagnitude(b.data.x - runtimeTop.data.x, b.data.y - runtimeTop.data.y),
      )[0].data.playerId;
  }
}

function getAiTraits(topType: TopType): { aggression: number; centerBias: number } {
  void topType;
  return {
    aggression: Phaser.Math.FloatBetween(0.94, 1.08),
    centerBias: Phaser.Math.FloatBetween(0.96, 1.08),
  };
}

function getPairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function getBattleOrderText(selectionOrder: number, isLocalPlayerTop: boolean): string {
  return isLocalPlayerTop ? `${selectionOrder}번 내 팽이` : `${selectionOrder}번`;
}

function getEnergyColor(energyRatio: number): number {
  if (energyRatio >= 0.6) {
    return 0x2dd4bf;
  }

  if (energyRatio >= 0.3) {
    return 0xf59e0b;
  }

  return 0xef4444;
}

function hexToNumber(hexColor: string): number {
  return Phaser.Display.Color.HexStringToColor(hexColor).color;
}
