import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { LaunchData, PlayerConfig } from "../types";
import { audioManager } from "../audio/audioManager";
import { BladeSkinPreview } from "./BladeSkinPreview";
import { getBladeSkin } from "../game/bladeSkins";
import { createPlayerIdentityAssignments } from "../game/playerIdentityColors";

interface LaunchScreenProps {
  players: PlayerConfig[];
  localPlayerId: string;
  onLocalPlayerChange: (playerId: string) => void;
  onBackToLobby: () => void;
  onComplete: (launches: LaunchData[]) => void;
}

export function LaunchScreen({
  players,
  localPlayerId,
  onLocalPlayerChange,
  onBackToLobby,
  onComplete,
}: LaunchScreenProps) {
  const [timingValue, setTimingValue] = useState(0.5);
  const [launches, setLaunches] = useState<Record<string, LaunchData>>({});
  const [launchCue, setLaunchCue] = useState("");
  const [isStartingBattle, setIsStartingBattle] = useState(false);
  const startBattleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let animationFrame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      setTimingValue((Math.sin(elapsed * 3.8) + 1) / 2);
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(
    () => () => {
      if (startBattleTimeoutRef.current !== null) {
        window.clearTimeout(startBattleTimeoutRef.current);
        startBattleTimeoutRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!launchCue) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setLaunchCue(""), 950);
    return () => window.clearTimeout(timeoutId);
  }, [launchCue]);

  const currentPower = useMemo(() => 0.6 + timingValue * 0.6, [timingValue]);
  const identityByPlayerId = useMemo(
    () => new Map(createPlayerIdentityAssignments(players).map((assignment) => [assignment.playerId, assignment])),
    [players],
  );
  const allLaunched = players.every((player) => launches[player.id]);
  const launchList = players
    .map((player) => launches[player.id])
    .filter((launch): launch is LaunchData => Boolean(launch));

  const setMyLaunchPower = (playerId: string, launchPower: number) => {
    if (playerId !== localPlayerId) {
      return;
    }

    void audioManager.initAudio().then(() => audioManager.playLaunchCharge());
    setLaunchCue("고~~");
    setLaunches((previous) => ({
      ...previous,
      [playerId]: {
        playerId,
        launchPower: Number(launchPower.toFixed(2)),
      },
    }));
  };

  const autoLaunchAllForMockTest = () => {
    void audioManager.initAudio().then(() => audioManager.playLaunchCharge());
    setLaunchCue("고~~");
    const nextLaunches: Record<string, LaunchData> = {};
    players.forEach((player, index) => {
      const alreadyLaunched = launches[player.id];
      const wave = (Math.sin(index * 1.37 + performance.now() * 0.002) + 1) / 2;
      nextLaunches[player.id] =
        alreadyLaunched ??
        {
          playerId: player.id,
          launchPower: Number((0.74 + wave * 0.44).toFixed(2)),
        };
    });
    setLaunches(nextLaunches);
  };

  const startBattleWithLaunchCue = () => {
    if (!allLaunched || isStartingBattle) {
      return;
    }

    setIsStartingBattle(true);
    setLaunchCue("고~~ 슛!");
    void audioManager.initAudio().then(() => audioManager.playLaunchShoot());
    startBattleTimeoutRef.current = window.setTimeout(() => onComplete(launchList), 560);
  };

  const localPlayer = players.find((player) => player.id === localPlayerId) ?? players[0];

  return (
    <main className="screen launch-screen">
      <header className="page-header">
        <p className="eyebrow">Launch</p>
        <h1>발사 타이밍</h1>
        <p>
          실제 멀티플레이에서는 각 기기에서 자기 팽이만 발사합니다. 현재는 local mock mode라
          테스트할 플레이어를 선택할 수 있습니다.
        </p>
      </header>

      <section className="launch-panel">
        <label className="field compact-field">
          <span>현재 테스트 플레이어</span>
          <select value={localPlayer?.id} onChange={(event) => onLocalPlayerChange(event.target.value)}>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.nickname}
              </option>
            ))}
          </select>
        </label>

        <div className="timing-readout">
          <strong>현재 발사 파워</strong>
          <span>{currentPower.toFixed(2)}</span>
        </div>
        <div className="timing-bar" aria-label="발사 타이밍 바">
          <div className="sweet-zone" />
          <div className="timing-marker" style={{ left: `${timingValue * 100}%` }} />
        </div>
        {launchCue && <div className="launch-cue" aria-live="polite">{launchCue}</div>}
        <p className="helper-text">
          내 팽이만 직접 발사할 수 있습니다. 나머지 플레이어는 실제 멀티플레이에서 각자 기기에서
          발사하게 됩니다.
        </p>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onBackToLobby}>
            로비로 돌아가기
          </button>
          <button className="secondary-button" type="button" onClick={autoLaunchAllForMockTest}>
            개발 테스트용: 모든 플레이어 자동 발사
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!allLaunched || isStartingBattle}
            onClick={startBattleWithLaunchCue}
          >
            {isStartingBattle ? "고~~ 슛!" : "전투 시작"}
          </button>
        </div>
      </section>

      <section className="player-grid launch-grid">
        {players.map((player, index) => {
          const bladeSkin = getBladeSkin(player.bladeSkinId);
          const launch = launches[player.id];
          const isLocalPlayer = player.id === localPlayerId;
          const identityAssignment = identityByPlayerId.get(player.id);
          const identityColor = identityAssignment?.identityColor ?? "#f8fafc";
          const identityOrder = identityAssignment?.selectionOrder ?? index + 1;
          const statusText = launch ? "발사 완료" : isLocalPlayer ? "내 차례" : "다른 플레이어 대기 중";

          return (
            <article className={`player-card ${isLocalPlayer ? "my-player-card" : ""}`} key={player.id}>
              <div className="player-card-header">
                <span className="top-dot" style={{ backgroundColor: bladeSkin.primaryColor }} />
                <strong>{player.nickname}</strong>
                <span
                  className="player-identity-chip is-compact"
                  style={{ "--identity-color": identityColor } as CSSProperties}
                >
                  <span className="player-identity-swatch" />
                  {identityOrder}번
                </span>
                {isLocalPlayer && <span className="status-pill">내 팽이</span>}
              </div>
              <BladeSkinPreview skinId={player.bladeSkinId} size={isLocalPlayer ? "medium" : "small"} />
              <p className="muted-text">스킨: {bladeSkin.name}</p>
              <p className={`launch-status ${launch ? "is-complete" : isLocalPlayer ? "is-my-turn" : ""}`}>
                {statusText}
              </p>
              <p className="launch-power">
                {launch ? `확정 파워 ${launch.launchPower.toFixed(2)}` : "아직 발사하지 않음"}
              </p>
              <button
                className="primary-button full-width"
                type="button"
                disabled={!isLocalPlayer}
                onClick={() => setMyLaunchPower(player.id, currentPower)}
              >
                {isLocalPlayer ? "내 팽이 Launch" : "다른 플레이어 대기 중"}
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}
