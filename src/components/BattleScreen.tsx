import { useEffect, useRef } from "react";
import * as Phaser from "phaser";
import type { BattleResult, LaunchData, PlayerConfig } from "../types";
import { BattleScene } from "../game/BattleScene";

interface BattleScreenProps {
  players: PlayerConfig[];
  launches: LaunchData[];
  localPlayerId: string;
  onFinished: (result: BattleResult) => void;
}

export function BattleScreen({ players, launches, localPlayerId, onFinished }: BattleScreenProps) {
  const gameContainerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!gameContainerRef.current) {
      return undefined;
    }

    let sceneActive = true;
    let resizeRafId: number | null = null;
    finishedRef.current = false;
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
        <span>30초 제한</span>
      </header>
      <section className="game-shell">
        <div ref={gameContainerRef} className="game-container" />
      </section>
    </main>
  );
}
