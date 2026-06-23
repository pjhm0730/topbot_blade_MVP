import type { BattleResult, PlayerConfig } from "../types";
import { BladeSkinPreview } from "./BladeSkinPreview";
import { getBladeSkin } from "../game/bladeSkins";

interface ResultScreenProps {
  result: BattleResult;
  players: PlayerConfig[];
  localPlayerId: string;
  onRetry: () => void;
  onBackToLobby: () => void;
}

function formatSeconds(value: number): string {
  return `${value.toFixed(1)}초`;
}

export function ResultScreen({ result, players, localPlayerId, onRetry, onBackToLobby }: ResultScreenProps) {
  const sortedSummaries = [...result.summaries].sort((a, b) => a.survivalTime - b.survivalTime);
  const loserSummary = sortedSummaries.find((summary) => summary.playerId === result.loserId);
  const loserSkinId =
    loserSummary?.bladeSkinId ?? players.find((player) => player.id === result.loserId)?.bladeSkinId ?? "";
  const loserSkin = getBladeSkin(loserSkinId);

  return (
    <main className="screen result-screen">
      <section className="result-hero result-loser-hero">
        <div className="result-loser-copy">
          <p className="eyebrow">Result</p>
          <h1>오늘의 음료수 담당: {result.loserNickname}</h1>
          <p className="result-skin-line">사용 팽이: {loserSkin.name}</p>
          <p>
            {result.reason === "stopped"
              ? "가장 먼저 팽이가 멈춰서 꼴등으로 결정되었습니다."
              : "제한 시간 종료 시 에너지가 가장 낮았습니다."}
          </p>
        </div>
        <BladeSkinPreview
          skinId={loserSkinId}
          size="large"
          highlighted
          label="꼴등"
          className="result-loser-preview"
        />
      </section>

      <section className="result-table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              <th>닉네임</th>
              <th>팽이 스킨</th>
              <th>생존 시간</th>
              <th>남은 에너지</th>
            </tr>
          </thead>
          <tbody>
            {sortedSummaries.map((summary) => {
              const player = players.find((item) => item.id === summary.playerId);
              const bladeSkin = getBladeSkin(player?.bladeSkinId ?? summary.bladeSkinId);
              const isLoser = summary.playerId === result.loserId;
              const isLocalPlayer = summary.playerId === localPlayerId;

              return (
                <tr key={summary.playerId} className={isLoser ? "loser-row" : undefined}>
                  <td>
                    <span className="result-player-cell">
                      <BladeSkinPreview
                        skinId={player?.bladeSkinId ?? summary.bladeSkinId}
                        size="small"
                        showName={false}
                        highlighted={isLoser || isLocalPlayer}
                        label={isLoser ? "꼴등" : isLocalPlayer ? "나" : undefined}
                      />
                      <span>
                        <strong>{summary.nickname}</strong>
                        {isLocalPlayer && <em>내 결과</em>}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="top-type-cell">
                      <span className="top-dot" style={{ backgroundColor: bladeSkin.primaryColor }} />
                      {bladeSkin.name}
                    </span>
                  </td>
                  <td>{formatSeconds(summary.survivalTime)}</td>
                  <td>{summary.remainingEnergy.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="result-compact-list" aria-label="결과 요약">
        {sortedSummaries.map((summary) => {
          const player = players.find((item) => item.id === summary.playerId);
          const bladeSkin = getBladeSkin(player?.bladeSkinId ?? summary.bladeSkinId);
          const isLoser = summary.playerId === result.loserId;
          const isLocalPlayer = summary.playerId === localPlayerId;

          return (
            <article
              className={`result-compact-card ${isLoser ? "loser-row" : ""} ${isLocalPlayer ? "is-local-result" : ""}`}
              key={summary.playerId}
            >
              <BladeSkinPreview
                skinId={player?.bladeSkinId ?? summary.bladeSkinId}
                size="small"
                showName={false}
                highlighted={isLoser || isLocalPlayer}
                label={isLoser ? "꼴등" : isLocalPlayer ? "나" : undefined}
              />
              <strong>{summary.nickname}</strong>
              <span>{bladeSkin.name}</span>
              <span>{formatSeconds(summary.survivalTime)}</span>
              <span>에너지 {summary.remainingEnergy.toFixed(1)}</span>
              <span className="result-badge-row">
                {isLoser && <b>꼴등</b>}
                {isLocalPlayer && <b>내 결과</b>}
              </span>
            </article>
          );
        })}
      </section>

      <div className="button-row result-actions">
        <button className="primary-button" type="button" onClick={onRetry}>
          다시 하기
        </button>
        <button className="secondary-button" type="button" onClick={onBackToLobby}>
          로비로 돌아가기
        </button>
      </div>
    </main>
  );
}
