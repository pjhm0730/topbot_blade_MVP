interface HomeScreenProps {
  onStart: () => void;
}

export function HomeScreen({ onStart }: HomeScreenProps) {
  return (
    <main className="screen home-screen">
      <section className="intro-panel">
        <p className="eyebrow">로컬 목업 MVP</p>
        <h1>탑바텀블레이드</h1>
        <p className="lead">
          2명에서 10명까지 팽이를 고르고 타이밍에 맞춰 발사한 뒤, 가장 먼저 멈춘 사람이
          오늘의 음료수 담당이 되는 짧은 웹게임입니다.
        </p>
        <button className="primary-button" type="button" onClick={onStart}>
          로컬 테스트 시작
        </button>
      </section>
    </main>
  );
}
