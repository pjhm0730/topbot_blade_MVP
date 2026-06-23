# 탑바텀블레이드

탑바텀블레이드는 2~10명이 짧게 즐기고, 가장 먼저 팽이가 멈춘 사람을 "오늘의 음료수 담당"으로 정하는 웹게임 MVP입니다.

현재 버전은 실제 멀티플레이가 아닌 **local mock mode**입니다. 한 브라우저 안에서 여러 플레이어를 설정하고, 팽이 스킨과 발사 파워를 테스트할 수 있습니다.

## 사용 기술

- React
- Vite
- TypeScript
- Phaser
- Plain CSS
- Web Audio API

Supabase, 로그인, 서버, 유료 외부 에셋은 아직 사용하지 않습니다.

## Codex Windows 앱에서 실행하는 방법

프로젝트 폴더:

```powershell
cd C:\Users\USER\Documents\top_blade_MVP
```

의존성이 아직 설치되지 않았다면:

```powershell
npm.cmd install
```

개발 서버 실행:

```powershell
npm.cmd run dev
```

빌드 확인:

```powershell
npm.cmd run build
```

PowerShell 실행 정책 때문에 `npm` 명령이 막히는 환경에서는 `npm.cmd`를 사용하면 됩니다.

## 현재 동작 방식

1. Home screen에서 로컬 테스트를 시작합니다.
2. Mock Lobby screen에서 2~10명의 플레이어를 설정합니다.
3. 한 기기를 돌려 쓰는 local mock mode에서는 플레이어 카드의 `선택` 버튼을 누른 순서대로 `1번`, `2번` 같은 선택 순번을 지정할 수 있습니다.
4. 각 플레이어의 닉네임과 팽이 스킨을 선택합니다.
5. Launch screen에서 현재 테스트 플레이어를 선택하고 자기 팽이만 직접 발사합니다.
6. local mock mode 편의를 위해 `개발 테스트용: 모든 플레이어 자동 발사` 버튼으로 나머지 플레이어를 채울 수 있습니다.
7. Battle screen에서 Phaser가 원형 경기장, 이동, 회전, 충돌, 튕김, 에너지 감소를 렌더링하고 각 팽이의 선택 순번을 표시합니다.
8. Result screen에서 꼴등과 각 플레이어의 선택 순번을 표시합니다.

결과 화면에는 다음 문구가 표시됩니다.

```text
오늘의 음료수 담당: {nickname}
```

## 랜덤 닉네임

- local mock mode에서 기본 플레이어 이름은 ASML/EUV/반도체 느낌의 랜덤 닉네임으로 생성됩니다.
- Mock Lobby에서 `ASML 스타일 이름 다시 뽑기` 버튼으로 전체 이름을 다시 만들 수 있습니다.
- 각 플레이어 카드의 `랜덤` 버튼으로 개별 닉네임만 다시 뽑을 수 있습니다.
- 닉네임 input은 그대로 유지되므로 사용자가 직접 수정할 수 있습니다.
- 닉네임 후보는 회사 내부 기밀, 실제 고객사명, 실제 장비 serial, 내부 프로젝트명, 내부 에러코드가 아니라 공개적으로 알려진 일반 반도체/리소그래피 용어 느낌만 사용합니다.

## 모바일 가로모드

- UI는 iPhone/Galaxy 같은 모바일 가로모드 사용을 우선으로 조정되어 있습니다.
- 세로모드에서는 `가로모드로 돌리면 더 잘 보여요` 안내가 표시됩니다.
- safe-area-inset을 고려해 가로모드에서 버튼과 게임 화면이 화면 가장자리에 붙지 않도록 했습니다.
- Mock Lobby는 모바일 가로모드에서 10명 카드가 한 화면에 들어오도록 5 x 2 compact grid를 사용합니다.
- Battle 화면은 왼쪽 설명 패널을 compact HUD로 줄이고, arena canvas가 화면 대부분을 차지하도록 배치됩니다.
- 실제 iPhone/Galaxy 가로모드에서는 기기별 주소창/노치 영역이 달라질 수 있으므로 최종 체감 테스트가 권장됩니다.

## 팽이 스킨

- Attack / Defense / Stamina 같은 능력치 타입 차이는 제거되었습니다.
- 모든 팽이는 동일한 base stats를 사용하며, 승패는 발사 타이밍, 충돌 상황, 이동 흐름으로 결정됩니다.
- 플레이어별 차이는 순수 cosmetic 스킨/이미지뿐입니다.
- Lobby에서 각 플레이어 카드의 `팽이 랜덤 선택` 버튼으로 스킨을 바꿀 수 있습니다.
- 닉네임에 `EUV`, `Wafer`, `Reticle`, `Overlay`, `Tin`, `Vacuum`, `Pellicle`, `Stage`, `Dose`, `Source`, `Alignment`, `Scanner` 같은 키워드가 있으면 관련 스킨이 우선 매칭됩니다.
- 스킨 이미지는 외부 이미지, 공식 로고, 저작권 에셋 없이 CSS와 Phaser Graphics로 만든 procedural pattern입니다.

## 사운드와 연출

- 발사음, 충돌음, 벽 충돌음, 전투 배경음은 Web Audio API로 브라우저에서 직접 합성합니다.
- BGM은 mp3 같은 파일 에셋이 아니라 Web Audio API oscillator, noise, filter, gain node로 실시간 생성됩니다.
- 외부 저작권 음원, 유료 에셋, 실제 애니메이션 원본 음원이나 공식 효과음은 사용하지 않습니다.
- `고~~ 슛!`은 텍스트와 오리지널 synth sound로 연출합니다.
- 브라우저 자동재생 정책 때문에 접속 직후에는 소리가 나지 않을 수 있고, 첫 클릭/터치 이후 AudioContext가 unlock되면서 BGM이 시작됩니다.
- Home / Lobby / Launch / Result 화면에서는 대기실 느낌의 로비 BGM이 계속 재생됩니다.
- Battle 화면에 들어가면 로비 BGM이 fade out되고 빠른 전투 BGM이 fade in됩니다.
- Battle이 끝나 Result 화면으로 이동하면 전투 BGM이 fade out되고 로비 BGM으로 돌아갑니다.
- 화면 오른쪽 위의 `사운드 켜짐/꺼짐` 버튼으로 전체 음소거를 전환할 수 있습니다.
- 같은 패널에서 `효과음`과 `배경음` 슬라이더로 볼륨을 조절할 수 있습니다.
- 사운드 패널에는 현재 BGM 상태가 `BGM: 로비`, `BGM: 전투`, `BGM: 꺼짐`, `BGM: 로비 · 첫 터치 대기`처럼 표시됩니다.
- 사운드 패널은 기본적으로 작은 floating 버튼만 표시되고, 필요할 때만 작은 팝오버로 펼쳐집니다.
- 팝오버 안에서 사운드 On/Off, `효과음`, `배경음` 슬라이더를 조절할 수 있습니다.
- 강한 충돌에서만 더 두껍고 밝아진 electric arc 번개 이펙트가 추가로 표시됩니다.

## Launch 구조

현재 local mock mode에서는 한 브라우저에서 여러 플레이어를 테스트할 수 있습니다. 하지만 실제 모바일 멀티플레이에서는 각 사용자가 자기 `localPlayerId`에 해당하는 팽이만 발사할 수 있어야 합니다.

이를 위해 Launch 화면은 `localPlayerId` 개념을 사용합니다.

- 내 플레이어만 `내 팽이 Launch` 버튼을 누를 수 있습니다.
- 다른 플레이어는 `다른 플레이어 대기 중`으로 표시됩니다.
- 모든 플레이어가 `launchPower`를 가진 경우에만 전투를 시작할 수 있습니다.
- `개발 테스트용: 모든 플레이어 자동 발사` 버튼은 실제 모바일 멀티플레이에서는 제거하거나 host/debug 전용으로 제한할 예정입니다.

나중에 Supabase를 붙일 때는 `setMyLaunchPower(playerId, launchPower)` 성격의 업데이트만 서버에 저장하면 됩니다.

## 내 팽이 표시와 결과 화면

- Battle 화면에서는 `localPlayerId`에 해당하는 팽이에 `N번 내 팽이` 배지, 펄스 링, 시작 포커스 연출이 표시됩니다.
- 다른 팽이는 `1번`, `2번`처럼 Lobby에서 지정한 선택 순번만 compact하게 표시됩니다.
- energy bar와 energy ring은 체력 단계별 초록/주황/빨강 색상으로 표시되며, 어두운 배경에서도 구분되도록 대비를 높였습니다.
- 이 하이라이트는 전투 능력치나 충돌 판정에는 영향을 주지 않는 시각 효과입니다.
- Battle 화면에서는 현재 살아 있는 팽이 중 energy 비율이 가장 낮은 꼴등 후보에 빨간 `위험!` 링과 배지가 표시됩니다.
- 최종 꼴등이 확정되면 해당 팽이에 더 강한 빨간 링, shockwave, `꼴등!`/`음료수 담당!` 라벨이 표시됩니다.
- 내 팽이가 꼴등 후보이거나 최종 꼴등인 경우에도 `내 팽이` 하이라이트와 빨간 위험/꼴등 하이라이트가 함께 보입니다.
- Result 화면에서는 꼴등 팽이를 크게 보여주고, 순위 목록에도 각 플레이어의 팽이 스킨 미리보기를 표시합니다.
- Result 화면에서 꼴등은 `꼴등`, 현재 테스트 플레이어는 `내 결과` 배지로 구분됩니다.
- 실제 모바일 멀티플레이에서는 각 기기의 인증/방 참가 정보로 `localPlayerId`를 결정해 자기 팽이만 강조하면 됩니다.

## 전투 박진감 개선

현재 Battle screen에는 더 자주 충돌하고 더 강하게 튕겨 보이도록 다음 로직이 적용되어 있습니다.

- center attraction: 팽이가 경기장 중앙으로 약하게 모입니다.
- target seeking: 각 팽이가 일정 시간마다 상대 목표를 선택하고 접근합니다.
- random steering: 오래 충돌하지 않거나 멈춘 듯한 상황에서 방향을 조금 바꿉니다.
- boundary correction: 경기장 외곽에 가까워지면 중앙 복귀 힘이 강해집니다.
- collision restitution: 팽이끼리 부딪혔을 때 더 탱탱하게 튕깁니다.
- faster spin visual: 회전 패턴과 빠른 시각 회전으로 팽이가 강하게 도는 느낌을 줍니다.
- impact effect: 강한 충돌에는 spark, 더 밝아진 electric arc, flash, camera shake, `쾅!` 텍스트가 표시됩니다.
- speed clamp: AI 가속, 충돌 반발, 벽 반발이 누적되어도 팽이가 추적 가능한 최대 속도 안에 머무르도록 제한합니다.
- effect cap: spark와 electric arc가 너무 많이 쌓여 전투 상황을 덮지 않도록 동시 표시 개수와 쿨다운을 둡니다.

전투 밸런스 값은 [src/game/battleConfig.ts](</C:/Users/USER/Documents/top_blade_MVP/src/game/battleConfig.ts>)에서 조정할 수 있습니다.

## 전투 종료 밸런스

- 전투 초반 10초 동안은 충돌이 많아도 energy가 너무 빨리 0이 되지 않도록 보호됩니다.
- 10초 이전에는 일반 충돌 데미지로 실제 탈락이 발생하지 않습니다.
- 10초 이후부터 실제 stopped 처리와 꼴등 판정이 가능합니다.
- 목표 게임 길이는 대략 12~25초입니다.
- 최대 전투 시간은 30초이며, 30초가 지나면 남은 energy가 가장 낮은 플레이어가 꼴등입니다.
- 살아 있는 팽이 수가 많을수록 충돌 빈도가 높아지므로 alive top count 기반 damage scaling이 적용됩니다.
- 충돌 반동은 이전보다 줄이고, 타격감은 spark, scale pop, flash, camera shake, impact text 같은 이펙트로 보강했습니다.

## 게임이 너무 빨리 끝날 때 조정할 값

[src/game/battleConfig.ts](</C:/Users/USER/Documents/top_blade_MVP/src/game/battleConfig.ts>)에서 아래 값을 먼저 조정하세요.

- `minEliminationTimeMs`: 실제 탈락이 가능해지는 최소 시간
- `preEliminationEnergyFloorRatio`: 10초 전 energy 최저 보호 비율
- `collisionEnergyLossMultiplier`: 충돌 energy 감소량
- `passiveDrainMultiplier`: 시간 경과 energy 감소량
- `earlyPhaseDamageMultiplier`: 0~5초 충돌 데미지
- `midPhaseDamageMultiplier`: 5~10초 충돌 데미지
- `latePhaseDamageMultiplier`: 10초 이후 충돌 데미지
- `aliveCountDamageMultiplierByCount`: 살아 있는 팽이 수별 데미지 계수
- `damageCooldownMs`: 같은 두 팽이의 반복 데미지 쿨다운
- `repeatedCollisionPenaltyMultiplier`: 같은 pair 반복 충돌 데미지 감소율

## 반동이 너무 강할 때 조정할 값

[src/game/battleConfig.ts](</C:/Users/USER/Documents/top_blade_MVP/src/game/battleConfig.ts>)에서 아래 값을 낮추면 됩니다.

- `collisionRestitution`: 팽이끼리 튕기는 반발 계수
- `collisionImpulseMultiplier`: 충돌 impulse 전체 배율
- `wallBounceMultiplier`: 벽 충돌 반발 배율
- `maxImpulsePerCollision`: 한 번의 충돌에서 추가될 수 있는 impulse 상한
- `postCollisionVelocityDamping`: 팽이끼리 충돌한 직후 속도 감쇠
- `postWallBounceVelocityDamping`: 벽에 튕긴 직후 속도 감쇠

반동을 낮추더라도 `sparkIntensityMultiplier`, `cameraShakeIntensity`, `strongImpactThreshold`를 조정하면 타격감은 이펙트로 유지할 수 있습니다.

## 속도와 이펙트가 과할 때 조정할 값

[src/game/battleConfig.ts](</C:/Users/USER/Documents/top_blade_MVP/src/game/battleConfig.ts>)에서 아래 값을 조정하세요.

- `maxTopSpeed`: 일반 전투 중 팽이 최대 이동 속도
- `maxTopSpeedDuringBoost`: 전투 시작 boost 구간에서만 허용되는 최대 이동 속도
- `lowEnergyMaxSpeedMultiplier`: 에너지가 낮을 때 최대 속도를 낮추는 배율
- `velocityDamping`: 매 프레임 누적 속도를 줄이는 약한 감쇠
- `maxAccelerationPerFrame`: AI steering이 한 프레임에 추가할 수 있는 velocity 변화량 상한
- `maxActiveElectricArcs`: 동시에 보일 수 있는 electric arc 최대 개수
- `electricArcCooldownMs`: 가까운 위치에서 electric arc가 반복 표시되는 것을 막는 쿨다운
- `maxSparkParticlesPerImpact`, `maxWeakSparkParticlesPerImpact`: 충돌 1회당 spark 개수 상한
- `maxActiveSparkParticles`: 화면에 동시에 살아 있을 수 있는 spark 개수 상한
- `impactTextCooldownMs`, `impactTextMinIntensity`: `쾅!`/`탕!` 텍스트 표시 빈도와 강도 기준

## 동일 성능 규칙

- 모든 팽이는 같은 `maxEnergy`, `speed`, `weight`, `attack`, `stability`, `spinSpeed`, `drainMultiplier`를 사용합니다.
- 스킨은 능력치에 영향을 주지 않습니다.
- 이전 타입 필드는 내부 호환용으로만 남아 있고, 사용자 UI에서는 팽이 스킨만 표시합니다.

## 다음 단계

다음 큰 작업은 Supabase를 사용한 방 만들기, 입장, 실시간 상태 동기화입니다. 현재는 네트워크 없이 로컬 브라우저에서만 테스트하는 MVP입니다.
