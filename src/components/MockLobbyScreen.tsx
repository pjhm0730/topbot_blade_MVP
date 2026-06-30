import type { CSSProperties } from "react";
import type { PlayerConfig } from "../types";
import { createRandomNickname, createRandomNicknames } from "../utils/randomNickname";
import { BladeSkinPreview } from "./BladeSkinPreview";
import { pickBladeSkinForNickname, pickRandomBladeSkin } from "../game/bladeSkins";
import { createPlayerIdentityAssignments } from "../game/playerIdentityColors";

interface MockLobbyScreenProps {
  players: PlayerConfig[];
  onPlayersChange: (players: PlayerConfig[]) => void;
  onStartGame: () => void;
}

function createPlayer(index: number, existingNicknames: string[]): PlayerConfig {
  const nickname = createRandomNickname(existingNicknames);
  return {
    id: `player-${index + 1}`,
    nickname,
    bladeSkinId: pickBladeSkinForNickname(nickname).id,
    topType: "Balanced",
  };
}

function normalizeSelectionOrders(players: PlayerConfig[]): PlayerConfig[] {
  const selectedIds = players
    .filter((player) => typeof player.selectionOrder === "number")
    .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0))
    .map((player) => player.id);

  return players.map((player) => {
    const selectedIndex = selectedIds.indexOf(player.id);
    if (selectedIndex < 0) {
      const { selectionOrder: _selectionOrder, ...nextPlayer } = player;
      return nextPlayer;
    }

    return {
      ...player,
      selectionOrder: selectedIndex + 1,
    };
  });
}

export function MockLobbyScreen({ players, onPlayersChange, onStartGame }: MockLobbyScreenProps) {
  const identityByPlayerId = new Map(
    createPlayerIdentityAssignments(players).map((assignment) => [assignment.playerId, assignment]),
  );

  const changePlayerCount = (count: number) => {
    const nextPlayers: PlayerConfig[] = [];

    for (let index = 0; index < count; index += 1) {
      nextPlayers.push(players[index] ?? createPlayer(index, nextPlayers.map((player) => player.nickname)));
    }

    onPlayersChange(normalizeSelectionOrders(nextPlayers));
  };

  const updatePlayer = (playerId: string, patch: Partial<PlayerConfig>) => {
    onPlayersChange(
      players.map((player) =>
        player.id === playerId
          ? {
              ...player,
              ...patch,
            }
          : player,
      ),
    );
  };

  const rerollAllNicknames = () => {
    const nicknames = createRandomNicknames(players.length);
    const usedSkinIds: string[] = [];
    onPlayersChange(
      players.map((player, index) => {
        const nickname = nicknames[index];
        const skin = pickBladeSkinForNickname(nickname, usedSkinIds);
        usedSkinIds.push(skin.id);
        return {
          ...player,
          nickname,
          bladeSkinId: skin.id,
        };
      }),
    );
  };

  const rerollPlayerNickname = (playerId: string) => {
    const otherNicknames = players
      .filter((player) => player.id !== playerId)
      .map((player) => player.nickname);
    const usedSkinIds = players
      .filter((player) => player.id !== playerId)
      .map((player) => player.bladeSkinId);
    const nickname = createRandomNickname(otherNicknames);
    const skin = pickBladeSkinForNickname(nickname, usedSkinIds);

    updatePlayer(playerId, {
      nickname,
      bladeSkinId: skin.id,
    });
  };

  const rerollPlayerSkin = (playerId: string) => {
    const currentPlayer = players.find((player) => player.id === playerId);
    if (!currentPlayer) {
      return;
    }

    const usedSkinIds = players
      .filter((player) => player.id !== playerId)
      .map((player) => player.bladeSkinId);
    const matchedSkin = pickBladeSkinForNickname(currentPlayer.nickname, usedSkinIds);
    const nextSkin =
      matchedSkin.id !== currentPlayer.bladeSkinId ? matchedSkin : pickRandomBladeSkin(usedSkinIds);

    updatePlayer(playerId, {
      bladeSkinId: nextSkin.id,
    });
  };

  const togglePlayerSelection = (playerId: string) => {
    const selectedPlayer = players.find((player) => player.id === playerId);
    if (!selectedPlayer) {
      return;
    }

    if (selectedPlayer.selectionOrder) {
      onPlayersChange(
        normalizeSelectionOrders(
          players.map((player) =>
            player.id === playerId
              ? {
                  ...player,
                  selectionOrder: undefined,
                }
              : player,
          ),
        ),
      );
      return;
    }

    const nextOrder =
      players.reduce((maxOrder, player) => Math.max(maxOrder, player.selectionOrder ?? 0), 0) + 1;
    updatePlayer(playerId, {
      selectionOrder: nextOrder,
    });
  };

  return (
    <main className="screen lobby-screen">
      <header className="page-header">
        <p className="eyebrow">Mock Lobby</p>
        <h1>로컬 테스트 로비</h1>
        <p>실제 멀티플레이 없이 한 브라우저에서 플레이어와 팽이를 설정합니다.</p>
      </header>

      <section className="toolbar">
        <label className="field compact-field">
          <span>플레이어 수</span>
          <select
            value={players.length}
            onChange={(event) => changePlayerCount(Number(event.target.value))}
          >
            {Array.from({ length: 9 }, (_, index) => index + 2).map((count) => (
              <option key={count} value={count}>
                {count}명
              </option>
            ))}
          </select>
        </label>
        <div className="button-row toolbar-actions">
          <button className="secondary-button" type="button" onClick={rerollAllNicknames}>
            ASML 스타일 이름 다시 뽑기
          </button>
          <button className="primary-button" type="button" onClick={onStartGame}>
            게임 시작
          </button>
        </div>
      </section>

      <section className="player-grid">
        {players.map((player, index) => {
          const isSelected = typeof player.selectionOrder === "number";
          const identityAssignment = identityByPlayerId.get(player.id);
          const identityColor = identityAssignment?.identityColor ?? "#f8fafc";
          const identityOrder = identityAssignment?.selectionOrder ?? index + 1;

          return (
            <article className={`player-card ${isSelected ? "is-picked-player-card" : ""}`} key={player.id}>
              <div className="player-card-header">
                <span className="player-number">{index + 1}</span>
                <strong>{player.nickname || `플레이어 ${index + 1}`}</strong>
                <span className={`selection-order-badge ${isSelected ? "is-picked" : ""}`}>
                  {isSelected ? `${player.selectionOrder}번` : "미선택"}
                </span>
                <span
                  className="player-identity-chip"
                  style={{ "--identity-color": identityColor } as CSSProperties}
                >
                  <span className="player-identity-swatch" />
                  식별 {identityOrder}번
                </span>
              </div>
              <button
                className={`selection-button ${isSelected ? "is-picked" : ""}`}
                type="button"
                onClick={() => togglePlayerSelection(player.id)}
              >
                {isSelected ? "선택 해제" : "선택"}
              </button>
              <div className="nickname-row">
                <label className="field">
                  <span>닉네임</span>
                  <input
                    value={player.nickname}
                    maxLength={16}
                    onChange={(event) => updatePlayer(player.id, { nickname: event.target.value })}
                  />
                </label>
                <button className="secondary-button small-button" type="button" onClick={() => rerollPlayerNickname(player.id)}>
                  랜덤
                </button>
              </div>
              <BladeSkinPreview skinId={player.bladeSkinId} />
              <button className="secondary-button full-width" type="button" onClick={() => rerollPlayerSkin(player.id)}>
                팽이 랜덤 선택
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}
