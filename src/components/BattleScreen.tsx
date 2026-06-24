import { useEffect, useMemo, useRef, useState } from "react";
import * as Phaser from "phaser";
import type { BattleHudState, BattleHudTopState, BattleResult, LaunchData, PlayerConfig } from "../types";
import { BattleScene } from "../game/BattleScene";
import { BATTLE_CONFIG } from "../game/battleConfig";
import { BladeSkinPreview } from "./BladeSkinPreview";

interface BattleScreenProps {
  players: PlayerConfig[];
  launches: LaunchData[];
  localPlayerId: string;
  onFinished: (result: BattleResult) => void;
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getEnergyRatio(status: BattleHudTopState): number {
  return clampRatio(status.maxEnergy > 0 ? status.energy / status.maxEnergy : 0);
}

function getHealthTone(energyRatio: number): "high" | "mid" | "low" {
  if (energyRatio >= 0.6) {
    return "high";
  }

  if (energyRatio >= 0.3) {
    return "mid";
  }

  return "low";
}

export function BattleScreen({ players, launches, localPlayerId, onFinished }: BattleScreenProps) {
  const gameContainerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const finishedRef = useRef(false);
  const [hudState, setHudState] = useState<BattleHudState | null>(null);
  const maxBattleSeconds = Math.round(BATTLE_CONFIG.maxBattleDurationMs / 1000);

  const leaderboardRows = useMemo(() => {
    const liveByPlayerId = new Map((hudState?.tops ?? []).map((status) => [status.playerId, status]));

    return players
      .map<BattleHudTopState>((player, index) => {
        const liveStatus = liveByPlayerId.get(player.id);
        if (liveStatus) {
          return liveStatus;
        }

        return {
          playerId: player.id,
          nickname: player.nickname,
          bladeSkinId: player.bladeSkinId,
          skinName: "",
          selectionOrder: player.selectionOrder ?? index + 1,
          energy: 1,
          maxEnergy: 1,
          stopped: false,
          isLocalPlayerTop: player.id === (localPlayerId || players[0]?.id),
          isCurrentLeader: index === 0,
          isFinalBeverageBuyer: false,
        };
      })
      .sort((a, b) => {
        if (a.stopped !== b.stopped) {
          return a.stopped ? 1 : -1;
        }

        const ratioDiff = getEnergyRatio(b) - getEnergyRatio(a);
        if (ratioDiff !== 0) {
          return ratioDiff;
        }

        return a.selectionOrder - b.selectionOrder;
      });
  }, [hudState, localPlayerId, players]);

  useEffect(() => {
    if (!gameContainerRef.current) {
      return undefined;
    }

    let sceneActive = true;
    let resizeRafId: number | null = null;
    finishedRef.current = false;
    setHudState(null);
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }
    gameContainerRef.current.replaceChildren();

    const getGameSize = () => {
      const rect = gameContainerRef.current?.getBoundingClientRect();
      return {
        width: Math.max(640, Math.round(rect?.width || 1280)),
        height: Math.max(320, Math.round(rect?.height || 560)),
      };
    };
    const initialSize = getGameSize();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: gameContainerRef.current,
      width: initialSize.width,
      height: initialSize.height,
      backgroundColor: "#07111f",
      scale: {
        mode: Phaser.Scale.RESIZE,
      },
      scene: [
        new BattleScene({
          players,
          launches,
          localPlayerId: localPlayerId || players[0]?.id,
          onStateChange: (state) => {
            if (sceneActive) {
              setHudState(state);
            }
          },
          onFinished: (result) => {
            if (finishedRef.current) {
              return;
            }
            if (!sceneActive) {
              return;
            }
            finishedRef.current = true;
            onFinished(result);
          },
        }),
      ],
    });
    gameRef.current = game;

    const refreshScale = () => {
      if (!sceneActive) {
        return;
      }
      const nextSize = getGameSize();
      const currentSize = game.scale.gameSize;
      if (currentSize.width === nextSize.width && currentSize.height === nextSize.height) {
        return;
      }
      game.scale.resize(nextSize.width, nextSize.height);
    };
    const scheduleScaleRefresh = () => {
      if (resizeRafId !== null) {
        window.cancelAnimationFrame(resizeRafId);
      }
      resizeRafId = window.requestAnimationFrame(() => {
        resizeRafId = null;
        refreshScale();
      });
    };
    const resizeObserver = new ResizeObserver(scheduleScaleRefresh);
    resizeObserver.observe(gameContainerRef.current);
    window.addEventListener("resize", scheduleScaleRefresh);
    window.addEventListener("orientationchange", scheduleScaleRefresh);
    scheduleScaleRefresh();

    return () => {
      sceneActive = false;
      finishedRef.current = true;
      if (resizeRafId !== null) {
        window.cancelAnimationFrame(resizeRafId);
        resizeRafId = null;
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleScaleRefresh);
      window.removeEventListener("orientationchange", scheduleScaleRefresh);
      game.destroy(true);
      if (gameRef.current === game) {
        gameRef.current = null;
      }
      gameContainerRef.current?.replaceChildren();
    };
  }, [launches, localPlayerId, onFinished, players]);

  return (
    <main className="battle-screen">
      <header className="battle-hud">
        <span className="battle-hud-kicker">Battle</span>
        <strong>전투 진행 중</strong>
        <span>{maxBattleSeconds}초 제한</span>
      </header>
      <section className="game-shell">
        <div className="battle-arena-wrap">
          <div ref={gameContainerRef} className="game-container" />
        </div>
        <aside className="battle-status-board" aria-label="실시간 생존 현황">
          <div className="battle-status-heading">
            <span>LIVE STATUS</span>
            <strong>생존 현황</strong>
          </div>
          <div className="battle-status-list">
            {leaderboardRows.map((status, index) => {
              const energyRatio = getEnergyRatio(status);
              const hpPercent = Math.round(energyRatio * 100);
              const healthTone = getHealthTone(energyRatio);

              return (
                <article
                  key={status.playerId}
                  className={[
                    "battle-status-card",
                    status.isLocalPlayerTop ? "is-local" : "",
                    status.isCurrentLeader ? "is-leader" : "",
                    status.isFinalBeverageBuyer ? "is-final-buyer" : "",
                    status.stopped ? "is-stopped" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="battle-status-rank">{index + 1}위</span>
                  <BladeSkinPreview
                    skinId={status.bladeSkinId}
                    size="small"
                    showName={false}
                    highlighted={status.isLocalPlayerTop || status.isCurrentLeader}
                    label={status.isLocalPlayerTop ? "내" : undefined}
                    className="battle-status-preview"
                  />
                  <div className="battle-status-main">
                    <div className="battle-status-name-line">
                      <strong>{status.selectionOrder}번</strong>
                      <span>{status.nickname}</span>
                    </div>
                    <div className="battle-status-meta">
                      <span>{hpPercent}%</span>
                      {status.isFinalBeverageBuyer && <b>음료수 담당</b>}
                      {!status.isFinalBeverageBuyer && status.stopped && <b>탈락</b>}
                      {!status.isFinalBeverageBuyer && !status.stopped && status.isCurrentLeader && <b>생존 후보</b>}
                      {!status.isFinalBeverageBuyer && !status.stopped && status.isLocalPlayerTop && <b>내 팽이</b>}
                    </div>
                    <div className="battle-status-hp" aria-label={`체력 ${hpPercent}%`}>
                      <span
                        className={`battle-status-hp-fill is-${healthTone}`}
                        style={{ width: `${hpPercent}%` }}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>
      </section>
    </main>
  );
}
