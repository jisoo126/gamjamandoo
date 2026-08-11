const appMarkup = `
  <main class="app">
    <!-- 로그인 화면 -->
    <section id="loginPage" class="center-page">
      <div class="auth-card">
        <p class="eyebrow">AI 집중 스터디</p>
        <h1>AlGAMJA</h1>

        <p class="description">
          로그인하고 함께 집중하는 스터디를 시작하세요.
        </p>

        <form id="loginForm" class="form">
          <label for="loginNickname">닉네임</label>
          <input
            id="loginNickname"
            type="text"
            placeholder="닉네임을 입력하세요"
            maxlength="20"
            autocomplete="username"
            required
          />

          <label for="loginPassword">비밀번호</label>
          <input
            id="loginPassword"
            type="password"
            placeholder="비밀번호를 입력하세요"
            minlength="4"
            autocomplete="current-password"
            required
          />

          <button class="primary-button" type="submit">
            로그인
          </button>
        </form>

        <p id="loginMessage" class="message"></p>

        <p class="switch-text">
          계정이 없나요?

          <button
            id="openSignupButton"
            class="text-button"
            type="button"
          >
            회원가입
          </button>
        </p>
      </div>
    </section>

    <!-- 회원가입 화면 -->
    <section id="signupPage" class="center-page" hidden>
      <div class="auth-card">
        <p class="eyebrow">AlGAMJA 시작하기</p>
        <h1>회원가입</h1>

        <p class="description">
          사용할 닉네임과 비밀번호를 등록하세요.
        </p>

        <form id="signupForm" class="form">
          <label for="signupNickname">닉네임</label>
          <input
            id="signupNickname"
            type="text"
            placeholder="2~20자의 닉네임"
            minlength="2"
            maxlength="20"
            autocomplete="username"
            required
          />

          <label for="signupPassword">비밀번호</label>
          <input
            id="signupPassword"
            type="password"
            placeholder="4자 이상 입력하세요"
            minlength="4"
            autocomplete="new-password"
            required
          />

          <label for="signupPasswordConfirm">
            비밀번호 확인
          </label>
          <input
            id="signupPasswordConfirm"
            type="password"
            placeholder="비밀번호를 다시 입력하세요"
            minlength="4"
            autocomplete="new-password"
            required
          />

          <button class="primary-button" type="submit">
            가입하기
          </button>
        </form>

        <p id="signupMessage" class="message"></p>

        <p class="switch-text">
          이미 계정이 있나요?

          <button
            id="openLoginButton"
            class="text-button"
            type="button"
          >
            로그인
          </button>
        </p>
      </div>
    </section>

    <!-- 방 선택 로비 -->
    <section id="lobbyPage" class="center-page" hidden>
      <div class="lobby-card room-lobby-card">
        <div class="lobby-header">
          <div>
            <p class="eyebrow">안녕하세요</p>
            <h1 id="welcomeText">사용자님</h1>
          </div>

          <button
            id="logoutButton"
            class="secondary-button"
            type="button"
          >
            로그아웃
          </button>
        </div>

        <!-- 새 방 / 기존 방 선택 -->
        <section id="lobbyChoicePanel">
          <div class="lobby-title-area">
            <h2>어떻게 시작할까요?</h2>

            <p class="description">
              새로운 스터디 방을 만들거나,
              전달받은 방 코드로 참여하세요.
            </p>
          </div>

          <div class="room-choice-grid">
            <button
              id="createRoomChoiceButton"
              class="room-choice-card"
              type="button"
            >
              <span class="choice-icon">＋</span>

              <strong>새 방 만들기</strong>

              <small>
                새로운 방 코드를 만들고
                스터디를 시작합니다.
              </small>
            </button>

            <button
              id="joinRoomChoiceButton"
              class="room-choice-card"
              type="button"
            >
              <span class="choice-icon">→</span>

              <strong>기존 방 들어가기</strong>

              <small>
                전달받은 방 코드를 입력해
                스터디에 참여합니다.
              </small>
            </button>
          </div>
        </section>

        <!-- 새 방 만들기 -->
        <section id="createRoomPanel" hidden>
          <button
            id="backFromCreateButton"
            class="back-button"
            type="button"
          >
            ← 이전
          </button>

          <h2>새 스터디 방 만들기</h2>

          <p class="description">
            방 제목을 정하고 생성된 코드를 팀원에게 공유하세요.
          </p>

          <form id="createRoomForm" class="form">
            <label for="newRoomTitle">방 제목</label>
            <input
              id="newRoomTitle"
              type="text"
              placeholder="예: 알고리즘 시험 공부"
              maxlength="40"
              required
            />

            <label for="generatedRoomCode">
              생성된 방 코드
            </label>

            <div class="room-code-box">
              <input
                id="generatedRoomCode"
                type="text"
                readonly
              />

              <button
                id="regenerateRoomCodeButton"
                class="code-action-button"
                type="button"
              >
                새 코드
              </button>

              <button
                id="copyRoomCodeButton"
                class="code-action-button"
                type="button"
              >
                복사
              </button>
            </div>

            <button
              id="createRoomButton"
              class="primary-button"
              type="submit"
            >
              입장 준비하기
            </button>
          </form>

          <p id="createRoomMessage" class="message"></p>
        </section>

        <!-- 기존 방 입장 -->
        <section id="joinRoomPanel" hidden>
          <button
            id="backFromJoinButton"
            class="back-button"
            type="button"
          >
            ← 이전
          </button>

          <h2>기존 스터디 방 들어가기</h2>

          <p class="description">
            방을 만든 사람에게 받은 코드를 입력하세요.
          </p>

          <form id="joinRoomForm" class="form">
            <label for="joinRoomCode">방 코드</label>
            <input
              id="joinRoomCode"
              type="text"
              placeholder="예: CAM-7K2P9Q"
              maxlength="20"
              autocomplete="off"
              required
            />

            <button
              id="joinRoomButton"
              class="primary-button"
              type="submit"
            >
              입장 준비하기
            </button>
          </form>

          <p id="joinRoomMessage" class="message"></p>
        </section>
      </div>
    </section>

    <!-- 입장 준비 화면 -->
    <section id="previewPage" class="preview-page" hidden>
      <div class="preview-shell">
        <header class="preview-header">
          <div>
            <p class="eyebrow">Before joining</p>
            <h2>입장 준비</h2>

            <p class="preview-description">
              카메라와 마이크 상태를 확인한 뒤
              스터디 방에 입장하세요.
            </p>
          </div>

          <button
            id="previewBackButton"
            class="secondary-button"
            type="button"
          >
            이전으로
          </button>
        </header>

        <div class="preview-layout">
          <!-- 카메라 미리보기 -->
          <section class="preview-video-section">
            <div class="preview-video-wrapper">
              <video
                id="previewVideo"
                class="preview-video"
                autoplay
                playsinline
                muted
              ></video>

              <div
                id="previewCameraOffOverlay"
                class="preview-camera-off-overlay"
                hidden
              >
                <span class="preview-camera-off-icon">⌁</span>
                <strong>카메라가 꺼져 있습니다</strong>
              </div>

              <div class="preview-video-bottom">
                <span id="previewNicknameLabel">
                  사용자
                </span>

                <span
                  id="previewDeviceStatus"
                  class="preview-device-status"
                >
                  장치 확인 중
                </span>
              </div>
            </div>

            <div class="preview-control-row">
              <button
                id="previewCameraButton"
                class="preview-control-button"
                type="button"
              >
                카메라 끄기
              </button>

              <button
                id="previewMicrophoneButton"
                class="preview-control-button"
                type="button"
              >
                마이크 끄기
              </button>
            </div>
          </section>

          <!-- 입장 정보 -->
          <aside class="preview-side-panel">
            <section class="preview-info-card">
              <p class="preview-card-label">입장 정보</p>

              <div class="preview-info-row">
                <span>방 제목</span>
                <strong id="previewRoomTitle">
                  스터디 방
                </strong>
              </div>

              <div class="preview-info-row">
                <span>방 코드</span>

                <div class="preview-code-row">
                  <strong id="previewRoomCode">
                    CAM-000000
                  </strong>

                  <button
                    id="previewCopyCodeButton"
                    class="mini-text-button"
                    type="button"
                  >
                    복사
                  </button>
                </div>
              </div>

              <div class="preview-info-row">
                <span>닉네임</span>
                <strong id="previewNickname">
                  사용자
                </strong>
              </div>
            </section>

            <section class="preview-device-card">
              <p class="preview-card-label">장치 설정</p>

              <label for="cameraSelect">
                카메라
              </label>

              <select
                id="cameraSelect"
                class="device-select"
              >
                <option value="">
                  카메라 불러오는 중
                </option>
              </select>

              <label for="microphoneSelect">
                마이크
              </label>

              <select
                id="microphoneSelect"
                class="device-select"
              >
                <option value="">
                  마이크 불러오는 중
                </option>
              </select>

              <div class="microphone-test">
                <div class="microphone-test-header">
                  <span>마이크 입력</span>
                  <strong id="microphoneLevelText">
                    0%
                  </strong>
                </div>

                <div class="microphone-level-track">
                  <div
                    id="microphoneLevelBar"
                    class="microphone-level-bar"
                  ></div>
                </div>
              </div>
            </section>

            <p id="previewMessage" class="message"></p>

            <button
              id="confirmJoinButton"
              class="primary-button preview-join-button"
              type="button"
            >
              스터디 입장
            </button>
          </aside>
        </div>
      </div>
    </section>

    <!-- 실제 LiveKit 스터디 방 -->
    <section id="studyPage" class="study-page" hidden>
      <div
        id="drowsyAlert"
        class="drowsy-alert"
        hidden
      >
        <div class="drowsy-alert-card">
          <span class="drowsy-alert-icon">⏰</span>
          <p class="drowsy-alert-title">
            졸음이 감지됐어요!
          </p>
          <p class="drowsy-alert-desc">
            잠깐 일어나서 스트레칭 한번 어때요?
          </p>
        </div>
      </div>

      <aside
        id="statsPanel"
        class="stats-panel"
      >
        <div class="stats-panel-header">
          <strong>나의 집중도</strong>
          <button
            id="statsCloseButton"
            class="stats-close-button"
            type="button"
            aria-label="집중도 패널 닫기"
          >
            ✕
          </button>
        </div>

        <div class="stats-row">
          <span class="stats-label">
            공부 시간
          </span>
          <span
            id="statsTotalTime"
            class="stats-value"
          >
            00:00
          </span>
        </div>

        <div class="stats-row">
          <span class="stats-label">
            집중 시간
          </span>
          <span
            id="statsFocusedTime"
            class="stats-value"
          >
            00:00
          </span>
        </div>

        <div class="stats-row">
          <span class="stats-label">
            졸음 감지 횟수
          </span>
          <span
            id="statsDrowsyCount"
            class="stats-value"
          >
            0회
          </span>
        </div>

        <div class="stats-focus-gauge">
          <div class="stats-focus-ring">
            <svg viewBox="0 0 100 100">
              <circle
                class="stats-focus-ring-bg"
                cx="50"
                cy="50"
                r="42"
              />
              <circle
                id="statsFocusRingBar"
                class="stats-focus-ring-bar"
                cx="50"
                cy="50"
                r="42"
              />
            </svg>
            <span
              id="statsFocusPercent"
              class="stats-focus-percent"
            >
              0%
            </span>
          </div>
          <p class="stats-focus-caption">
            전체 집중도
          </p>
        </div>
      </aside>

      <header class="study-header">
        <div>
          <p class="eyebrow">AlGAMJA Room</p>
          <h2 id="roomTitle">스터디 방</h2>
          <p id="userDisplay" class="header-user"></p>
          <p id="studyTimer" class="study-timer">
            00:00
          </p>
        </div>

        <div class="header-actions">
          <span
            id="connectionStatus"
            class="connection-badge"
          >
            연결 중
          </span>

          <span
            id="earSocketStatus"
            class="connection-badge secondary-status"
          >
            AI 서버 대기
          </span>

          <button
            id="cameraButton"
            class="secondary-button"
            type="button"
          >
            카메라 끄기
          </button>

          <button
            id="microphoneButton"
            class="secondary-button"
            type="button"
          >
            마이크 끄기
          </button>

          <button
            id="statsToggleButton"
            class="secondary-button"
            type="button"
          >
            📊 집중도
          </button>

          <button
            id="leaveButton"
            class="danger-button"
            type="button"
          >
            나가기
          </button>
        </div>
      </header>

      <div class="study-layout">
        <section
          id="videoGrid"
          class="video-grid"
        ></section>

        <aside class="side-panel">
          <h3>스터디 정보</h3>

          <div class="info-row">
            <span>참가 인원</span>
            <strong id="participantCount">
              0명
            </strong>
          </div>

          <div class="info-row">
            <span>현재 EAR</span>
            <strong id="earValue">
              -
            </strong>
          </div>

          <div class="info-row">
            <span>집중 상태</span>
            <strong id="focusStatus">
              분석 대기 중
            </strong>
          </div>

          <div class="info-row">
            <span>EAR 전송</span>
            <strong id="earSendStatus">
              대기 중
            </strong>
          </div>
        </aside>
      </div>
    </section>
  </main>
`;

export const ui = {};

export function renderApp() {
  const app = document.querySelector("#app");

  if (!app) {
    throw new Error(
      'index.html에서 id="app"인 요소를 찾을 수 없습니다.',
    );
  }

  app.innerHTML = appMarkup;

  const elementIds = [
    "loginPage",
    "signupPage",
    "lobbyPage",
    "previewPage",
    "studyPage",

    "loginForm",
    "signupForm",

    "loginNickname",
    "loginPassword",

    "signupNickname",
    "signupPassword",
    "signupPasswordConfirm",

    "loginMessage",
    "signupMessage",

    "openSignupButton",
    "openLoginButton",
    "logoutButton",

    "welcomeText",

    "lobbyChoicePanel",
    "createRoomPanel",
    "joinRoomPanel",

    "createRoomChoiceButton",
    "joinRoomChoiceButton",

    "backFromCreateButton",
    "backFromJoinButton",

    "createRoomForm",
    "newRoomTitle",
    "generatedRoomCode",
    "regenerateRoomCodeButton",
    "copyRoomCodeButton",
    "createRoomButton",
    "createRoomMessage",

    "joinRoomForm",
    "joinRoomCode",
    "joinRoomButton",
    "joinRoomMessage",

    "previewBackButton",
    "previewVideo",
    "previewCameraOffOverlay",
    "previewNicknameLabel",
    "previewDeviceStatus",

    "previewCameraButton",
    "previewMicrophoneButton",

    "previewRoomTitle",
    "previewRoomCode",
    "previewNickname",
    "previewCopyCodeButton",

    "cameraSelect",
    "microphoneSelect",

    "microphoneLevelText",
    "microphoneLevelBar",

    "previewMessage",
    "confirmJoinButton",

    "leaveButton",
    "cameraButton",
    "microphoneButton",

    "roomTitle",
    "userDisplay",
    "studyTimer",
    "videoGrid",

    "connectionStatus",
    "earSocketStatus",
    "drowsyAlert",

    "statsToggleButton",
    "statsCloseButton",
    "statsPanel",
    "statsTotalTime",
    "statsFocusedTime",
    "statsDrowsyCount",
    "statsFocusRingBar",
    "statsFocusPercent",

    "participantCount",
    "earValue",
    "focusStatus",
    "earSendStatus",
  ];

  for (const id of elementIds) {
    const element = document.querySelector(
      `#${id}`,
    );

    if (!element) {
      throw new Error(
        `화면 요소를 찾을 수 없습니다: #${id}`,
      );
    }

    ui[id] = element;
  }
}