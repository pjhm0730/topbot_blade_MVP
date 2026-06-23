import { useCallback, useEffect, useState } from "react";
import { BattleScreen } from "./components/BattleScreen";
import { HomeScreen } from "./components/HomeScreen";
import { LaunchScreen } from "./components/LaunchScreen";
import { MockLobbyScreen } from "./components/MockLobbyScreen";
import { ResultScreen } from "./components/ResultScreen";
import { SoundControls } from "./components/SoundControls";
import { audioManager } from "./audio/audioManager";
import type { BattleResult, LaunchData, PlayerConfig, Screen } from "./types";
import { createRandomNickname, createRandomNicknames } from "./utils/randomNickname";
import { pickBladeSkinForNickname } from "./game/bladeSkins";

function createInitialPlayers(count: number): PlayerConfig[] {
  const nicknames = createRandomNicknames(count);
  const usedSkinIds: string[] = [];
  return nicknames.map((nickname, index) => {
    const skin = pickBladeSkinForNickname(nickname, usedSkinIds);
    usedSkinIds.push(skin.id);
    return {
      id: `player-${index + 1}`,
      nickname,
      bladeSkinId: skin.id,
      topType: "Balanced",
    };
  });
}

const initialPlayers: PlayerConfig[] = [
  ...createInitialPlayers(2),
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [players, setPlayers] = useState<PlayerConfig[]>(initialPlayers);
  const [localPlayerId, setLocalPlayerId] = useState(initialPlayers[0].id);
  const [launches, setLaunches] = useState<LaunchData[]>([]);
  const [result, setResult] = useState<BattleResult | null>(null);

  useEffect(() => {
    audioManager.switchBgm(screen === "battle" ? "battle" : "lobby");
  }, [screen]);

  useEffect(
    () => () => {
      audioManager.stopAll();
    },
    [],
  );

  const updatePlayers = (nextPlayers: PlayerConfig[]) => {
    setPlayers(nextPlayers);
    if (!nextPlayers.some((player) => player.id === localPlayerId)) {
      setLocalPlayerId(nextPlayers[0]?.id ?? initialPlayers[0].id);
    }
  };

  const startLaunch = () => {
    const normalizedPlayers: PlayerConfig[] = [];

    players.forEach((player) => {
      const nickname = player.nickname.trim() || createRandomNickname(normalizedPlayers.map((item) => item.nickname));
      const bladeSkinId = player.bladeSkinId || pickBladeSkinForNickname(nickname).id;
      normalizedPlayers.push({
        ...player,
        nickname,
        bladeSkinId,
      });
    });

    setPlayers(normalizedPlayers);
    if (!normalizedPlayers.some((player) => player.id === localPlayerId)) {
      setLocalPlayerId(normalizedPlayers[0].id);
    }
    setLaunches([]);
    setResult(null);
    setScreen("launch");
  };

  const startBattle = (nextLaunches: LaunchData[]) => {
    setLaunches(nextLaunches);
    setResult(null);
    setScreen("battle");
  };

  const finishBattle = useCallback((battleResult: BattleResult) => {
    setResult(battleResult);
    setScreen("result");
  }, []);

  return (
    <div className="app" onPointerDown={() => void audioManager.unlockAudio()}>
      <SoundControls />
      {screen === "home" && <HomeScreen onStart={() => setScreen("lobby")} />}
      {screen === "lobby" && (
        <MockLobbyScreen players={players} onPlayersChange={updatePlayers} onStartGame={startLaunch} />
      )}
      {screen === "launch" && (
        <LaunchScreen
          players={players}
          localPlayerId={localPlayerId}
          onLocalPlayerChange={setLocalPlayerId}
          onBackToLobby={() => setScreen("lobby")}
          onComplete={startBattle}
        />
      )}
      {screen === "battle" && (
        <BattleScreen
          players={players}
          launches={launches}
          localPlayerId={localPlayerId}
          onFinished={finishBattle}
        />
      )}
      {screen === "result" && result && (
        <ResultScreen
          result={result}
          players={players}
          localPlayerId={localPlayerId}
          onRetry={startLaunch}
          onBackToLobby={() => setScreen("lobby")}
        />
      )}
    </div>
  );
}
