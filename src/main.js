import "./style.css";

import {
  renderApp,
  ui,
} from "./ui.js";

import {
  getSavedSession,
  removeSession,
  saveSession,
  signupUser,
  validateLogin,
} from "./auth.js";

import {
  connectEarSocket,
  disconnectEarSocket,
  exposeEarSender,
  setEarContext,
} from "./earSocket.js";

import {
  startEarDetection,
  stopEarDetection,
} from "./earDetection.js";

import {
  joinLiveKitRoom,
  leaveLiveKitRoom,
  toggleCamera,
  toggleMicrophone,
  broadcastDrowsyStatus,
  exposeFacePositionSender,
} from "./livekitRoom.js";

import {
  changePreviewCamera,
  changePreviewMicrophone,
  getPreviewSettings,
  startDevicePreview,
  stopDevicePreview,
  togglePreviewCamera,
  togglePreviewMicrophone,
} from "./devicePreview.js";

/* =========================
   화면 생성
========================= */

renderApp();

/* =========================
   현재 상태
========================= */

let currentUser = getSavedSession();

/*
 * 프리뷰 화면에서 확인 중인 방 정보
 */
let pendingRoom = null;

/*
 * 프리뷰 이전에 사용자가 있었던 화면
 *
 * create:
 * 새 방 만들기 화면
 *
 * join:
 * 기존 방 참여 화면
 */
let previewPreviousPanel = "create";

/*
 * 스터디 방에 머문 시간 + 집중(순공) 시간 +
 * 졸음 감지 횟수를 기록합니다.
 */
let studyTimerIntervalId = null;
let studyStartedAt = null;
let focusedSeconds = 0;
let drowsyEventCount = 0;
let isSelfCurrentlyDrowsy = false;

function startStudyTimer() {
  studyStartedAt = Date.now();
  focusedSeconds = 0;
  drowsyEventCount = 0;
  isSelfCurrentlyDrowsy = false;

  updateStudyTimerDisplay();

  studyTimerIntervalId =
    setInterval(() => {
      /*
       * 지금 안 졸린 상태일 때만
       * "집중 시간"을 1초씩 더합니다.
       */
      if (
        !isSelfCurrentlyDrowsy
      ) {
        focusedSeconds += 1;
      }

      updateStudyTimerDisplay();
    }, 1000);
}

function stopStudyTimer() {
  if (studyTimerIntervalId) {
    clearInterval(
      studyTimerIntervalId,
    );

    studyTimerIntervalId = null;
  }

  studyStartedAt = null;
  focusedSeconds = 0;
  drowsyEventCount = 0;
  isSelfCurrentlyDrowsy = false;

  ui.studyTimer.textContent =
    "00:00";

  ui.statsTotalTime.textContent =
    "00:00";

  ui.statsFocusedTime.textContent =
    "00:00";

  ui.statsDrowsyCount.textContent =
    "0회";

  setFocusRing(0);
}

/*
 * earSocket.js의 onDrowsyChange에서 호출됩니다.
 * 졸음이 "새로 시작될 때"만 횟수를 1 늘립니다.
 */
function recordSelfDrowsyChange(
  isDrowsy,
) {
  if (
    isDrowsy &&
    !isSelfCurrentlyDrowsy
  ) {
    drowsyEventCount += 1;
  }

  isSelfCurrentlyDrowsy =
    isDrowsy;
}

function formatDuration(
  totalSeconds,
) {
  const hours = Math.floor(
    totalSeconds / 3600,
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );

  const seconds =
    totalSeconds % 60;

  const pad = (value) =>
    String(value).padStart(
      2,
      "0",
    );

  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function setFocusRing(percent) {
  const circumference = 264;

  const offset =
    circumference -
    (circumference * percent) /
      100;

  ui.statsFocusRingBar.style.strokeDashoffset =
    offset;

  ui.statsFocusPercent.textContent = `${percent}%`;
}

function updateStudyTimerDisplay() {
  if (!studyStartedAt) {
    return;
  }

  const elapsedSeconds =
    Math.floor(
      (Date.now() -
        studyStartedAt) /
        1000,
    );

  const timeText =
    formatDuration(
      elapsedSeconds,
    );

  ui.studyTimer.textContent =
    timeText;

  ui.statsTotalTime.textContent =
    timeText;

  ui.statsFocusedTime.textContent =
    formatDuration(
      focusedSeconds,
    );

  ui.statsDrowsyCount.textContent = `${drowsyEventCount}회`;

  const focusPercent =
    elapsedSeconds > 0
      ? Math.round(
          (focusedSeconds /
            elapsedSeconds) *
            100,
        )
      : 0;

  setFocusRing(focusPercent);
}

/*
 * 졸음 경고음을 재생합니다.
 * 음원 파일 없이, 브라우저 내장 Web Audio API로
 * "삐-삐-" 소리를 직접 만들어서 재생합니다.
 */
let alertAudioContext = null;

function playDrowsyAlertSound() {
  try {
    if (!alertAudioContext) {
      alertAudioContext =
        new (window.AudioContext ||
          window
            .webkitAudioContext)();
    }

    const context =
      alertAudioContext;

    const beepTimes = [0, 0.25];

    beepTimes.forEach(
      (startOffset) => {
        const oscillator =
          context.createOscillator();

        const gainNode =
          context.createGain();

        oscillator.type =
          "sine";

        oscillator.frequency
          .value = 880;

        gainNode.gain.setValueAtTime(
          0.0001,
          context.currentTime +
            startOffset,
        );

        gainNode.gain.exponentialRampToValueAtTime(
          0.25,
          context.currentTime +
            startOffset +
            0.02,
        );

        gainNode.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime +
            startOffset +
            0.18,
        );

        oscillator.connect(
          gainNode,
        );

        gainNode.connect(
          context.destination,
        );

        oscillator.start(
          context.currentTime +
            startOffset,
        );

        oscillator.stop(
          context.currentTime +
            startOffset +
            0.2,
        );
      },
    );
  } catch (error) {
    console.warn(
      "경고음 재생 실패:",
      error,
    );
  }
}

/* =========================
   화면 전환
========================= */

function hideAllPages() {
  ui.loginPage.hidden = true;
  ui.signupPage.hidden = true;
  ui.lobbyPage.hidden = true;
  ui.previewPage.hidden = true;
  ui.studyPage.hidden = true;
}

function showLoginPage(
  message = "",
  isError = false,
) {
  hideAllPages();

  ui.loginPage.hidden = false;
  ui.loginForm.reset();

  showMessage(
    ui.loginMessage,
    message,
    isError,
  );
}

function showSignupPage() {
  hideAllPages();

  ui.signupPage.hidden = false;
  ui.signupForm.reset();

  clearMessage(
    ui.signupMessage,
  );
}

function showLobbyPage() {
  hideAllPages();

  ui.lobbyPage.hidden = false;

  ui.welcomeText.textContent =
    `${currentUser}님`;

  resetLobbyPanels();
}

function showCreateRoomPanel() {
  hideAllPages();

  ui.lobbyPage.hidden = false;

  ui.lobbyChoicePanel.hidden = true;
  ui.createRoomPanel.hidden = false;
  ui.joinRoomPanel.hidden = true;
}

function showJoinRoomPanel() {
  hideAllPages();

  ui.lobbyPage.hidden = false;

  ui.lobbyChoicePanel.hidden = true;
  ui.createRoomPanel.hidden = true;
  ui.joinRoomPanel.hidden = false;
}

function showPreviewPage() {
  hideAllPages();

  ui.previewPage.hidden = false;
}

function showStudyPage({
  roomCode,
  roomTitle,
}) {
  hideAllPages();

  ui.studyPage.hidden = false;

  ui.roomTitle.textContent =
    roomTitle
      ? `${roomTitle} · ${roomCode}`
      : roomCode;

  ui.userDisplay.textContent =
    `${currentUser}님으로 참여 중`;
}

/* =========================
   메시지
========================= */

function showMessage(
  element,
  message,
  isError,
) {
  element.textContent = message;

  element.classList.toggle(
    "error",
    Boolean(message) && isError,
  );

  element.classList.toggle(
    "success",
    Boolean(message) && !isError,
  );
}

function clearMessage(element) {
  element.textContent = "";

  element.classList.remove(
    "error",
    "success",
  );
}

/* =========================
   로그인 / 회원가입
========================= */

ui.openSignupButton.addEventListener(
  "click",
  showSignupPage,
);

ui.openLoginButton.addEventListener(
  "click",
  () => showLoginPage(),
);

ui.signupForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const submitButton =
      ui.signupForm.querySelector(
        "button[type=\"submit\"]",
      );

    submitButton.disabled = true;

    try {
      const result = await signupUser({
        nickname:
          ui.signupNickname.value.trim(),

        password:
          ui.signupPassword.value,

        passwordConfirm:
          ui.signupPasswordConfirm.value,
      });

      if (!result.ok) {
        showMessage(
          ui.signupMessage,
          result.message,
          true,
        );

        return;
      }

      ui.loginNickname.value =
        result.nickname;

      showLoginPage(
        "회원가입이 완료됐어요. 로그인해 주세요.",
        false,
      );
    } finally {
      submitButton.disabled = false;
    }
  },
);

ui.loginForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const submitButton =
      ui.loginForm.querySelector(
        "button[type=\"submit\"]",
      );

    submitButton.disabled = true;

    try {
      const result = await validateLogin({
        nickname:
          ui.loginNickname.value.trim(),

        password:
          ui.loginPassword.value,
      });

      if (!result.ok) {
        showMessage(
          ui.loginMessage,
          result.message,
          true,
        );

        return;
      }

      currentUser = result.nickname;

      saveSession(currentUser);

      showLobbyPage();
    } finally {
      submitButton.disabled = false;
    }
  },
);

ui.logoutButton.addEventListener(
  "click",
  async () => {
    await stopDevicePreview();

    disconnectEarSocket();

    await leaveLiveKitRoom();

    removeSession();

    currentUser = null;
    pendingRoom = null;

    resetStudyScreen();

    showLoginPage(
      "로그아웃되었습니다.",
      false,
    );
  },
);

/* =========================
   로비 초기화
========================= */

function resetLobbyPanels() {
  ui.lobbyChoicePanel.hidden = false;
  ui.createRoomPanel.hidden = true;
  ui.joinRoomPanel.hidden = true;

  ui.createRoomForm.reset();
  ui.joinRoomForm.reset();

  clearMessage(
    ui.createRoomMessage,
  );

  clearMessage(
    ui.joinRoomMessage,
  );

  ui.generatedRoomCode.value =
    generateRoomCode();
}

/* =========================
   새 방 / 기존 방 선택
========================= */

ui.createRoomChoiceButton.addEventListener(
  "click",
  () => {
    ui.lobbyChoicePanel.hidden = true;
    ui.createRoomPanel.hidden = false;
    ui.joinRoomPanel.hidden = true;

    ui.generatedRoomCode.value =
      generateRoomCode();
  },
);

ui.joinRoomChoiceButton.addEventListener(
  "click",
  () => {
    ui.lobbyChoicePanel.hidden = true;
    ui.createRoomPanel.hidden = true;
    ui.joinRoomPanel.hidden = false;
  },
);

ui.backFromCreateButton.addEventListener(
  "click",
  resetLobbyPanels,
);

ui.backFromJoinButton.addEventListener(
  "click",
  resetLobbyPanels,
);

/* =========================
   방 코드 생성
========================= */

function generateRoomCode() {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const randomValues =
    new Uint32Array(6);

  crypto.getRandomValues(
    randomValues,
  );

  let code = "";

  for (
    const randomValue
    of randomValues
  ) {
    code +=
      characters[
        randomValue %
        characters.length
      ];
  }

  return `CAM-${code}`;
}

ui.regenerateRoomCodeButton.addEventListener(
  "click",
  () => {
    ui.generatedRoomCode.value =
      generateRoomCode();

    showMessage(
      ui.createRoomMessage,
      "새 방 코드가 생성됐어요.",
      false,
    );
  },
);

ui.copyRoomCodeButton.addEventListener(
  "click",
  async () => {
    await copyRoomCode({
      roomCode:
        ui.generatedRoomCode.value,

      messageElement:
        ui.createRoomMessage,
    });
  },
);

/* =========================
   새 방 만들기
========================= */

ui.createRoomForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const roomTitle =
      ui.newRoomTitle.value.trim();

    const roomCode =
      ui.generatedRoomCode.value.trim();

    if (!roomTitle) {
      showMessage(
        ui.createRoomMessage,
        "방 제목을 입력해 주세요.",
        true,
      );

      return;
    }

    previewPreviousPanel = "create";

    await openDevicePreview({
      roomCode,
      roomTitle,
      isNewRoom: true,
    });
  },
);

/* =========================
   기존 방 참여
========================= */

ui.joinRoomForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const roomCode =
      ui.joinRoomCode.value
        .trim()
        .toUpperCase();

    if (!roomCode) {
      showMessage(
        ui.joinRoomMessage,
        "방 코드를 입력해 주세요.",
        true,
      );

      return;
    }

    previewPreviousPanel = "join";

    await openDevicePreview({
      roomCode,
      roomTitle: "초대받은 스터디",
      isNewRoom: false,
    });
  },
);

/* =========================
   프리뷰 화면 열기
========================= */

async function openDevicePreview({
  roomCode,
  roomTitle,
  isNewRoom,
}) {
  pendingRoom = {
    roomCode,
    roomTitle,
    isNewRoom,
  };

  ui.previewRoomTitle.textContent =
    roomTitle;

  ui.previewRoomCode.textContent =
    roomCode;

  ui.previewNickname.textContent =
    currentUser;

  ui.previewNicknameLabel.textContent =
    currentUser;

  ui.previewDeviceStatus.textContent =
    "장치 연결 중";

  clearMessage(
    ui.previewMessage,
  );

  showPreviewPage();

  try {
    await startDevicePreview({
      videoElement:
        ui.previewVideo,

      nextCallbacks: {
        onCameraStateChange:
          handlePreviewCameraState,

        onMicrophoneStateChange:
          handlePreviewMicrophoneState,

        onVolumeChange:
          updateMicrophoneLevel,

        onDeviceListChange:
          updateDeviceSelects,

        onError:
          handlePreviewDeviceError,
      },
    });

    ui.previewDeviceStatus.textContent =
      "카메라·마이크 준비 완료";
  } catch (error) {
    showMessage(
      ui.previewMessage,
      getDeviceErrorMessage(error),
      true,
    );

    ui.previewDeviceStatus.textContent =
      "장치 연결 실패";
  }
}

/* =========================
   프리뷰 카메라 상태
========================= */

function handlePreviewCameraState(
  enabled,
) {
  ui.previewCameraButton.textContent =
    enabled
      ? "카메라 끄기"
      : "카메라 켜기";

  ui.previewCameraOffOverlay.hidden =
    enabled;
}

ui.previewCameraButton.addEventListener(
  "click",
  () => {
    togglePreviewCamera();
  },
);

/* =========================
   프리뷰 마이크 상태
========================= */

function handlePreviewMicrophoneState(
  enabled,
) {
  ui.previewMicrophoneButton.textContent =
    enabled
      ? "마이크 끄기"
      : "마이크 켜기";

  if (!enabled) {
    updateMicrophoneLevel(0);
  }
}

ui.previewMicrophoneButton.addEventListener(
  "click",
  () => {
    togglePreviewMicrophone();
  },
);

/* =========================
   마이크 음량 표시
========================= */

function updateMicrophoneLevel(
  volume,
) {
  const safeVolume =
    Math.max(
      0,
      Math.min(100, volume),
    );

  ui.microphoneLevelBar.style.width =
    `${safeVolume}%`;

  ui.microphoneLevelText.textContent =
    `${safeVolume}%`;
}

/* =========================
   장치 목록 표시
========================= */

function updateDeviceSelects({
  cameras,
  microphones,
  selectedCameraId,
  selectedMicrophoneId,
}) {
  fillDeviceSelect({
    selectElement:
      ui.cameraSelect,

    devices:
      cameras,

    selectedDeviceId:
      selectedCameraId,

    fallbackLabel:
      "카메라",
  });

  fillDeviceSelect({
    selectElement:
      ui.microphoneSelect,

    devices:
      microphones,

    selectedDeviceId:
      selectedMicrophoneId,

    fallbackLabel:
      "마이크",
  });
}

function fillDeviceSelect({
  selectElement,
  devices,
  selectedDeviceId,
  fallbackLabel,
}) {
  selectElement.innerHTML = "";

  if (devices.length === 0) {
    const option =
      document.createElement(
        "option",
      );

    option.value = "";

    option.textContent =
      `${fallbackLabel}를 찾을 수 없음`;

    selectElement.appendChild(
      option,
    );

    selectElement.disabled =
      true;

    return;
  }

  selectElement.disabled =
    false;

  devices.forEach(
    (device, index) => {
      const option =
        document.createElement(
          "option",
        );

      option.value =
        device.deviceId;

      option.textContent =
        device.label ||
        `${fallbackLabel} ${index + 1}`;

      option.selected =
        device.deviceId ===
        selectedDeviceId;

      selectElement.appendChild(
        option,
      );
    },
  );
}

/* =========================
   카메라 선택 변경
========================= */

ui.cameraSelect.addEventListener(
  "change",
  async (event) => {
    try {
      ui.previewDeviceStatus.textContent =
        "카메라 변경 중";

      await changePreviewCamera({
        deviceId:
          event.target.value,

        videoElement:
          ui.previewVideo,
      });

      ui.previewDeviceStatus.textContent =
        "카메라 변경 완료";
    } catch (error) {
      showMessage(
        ui.previewMessage,
        "카메라를 변경하지 못했습니다.",
        true,
      );
    }
  },
);

/* =========================
   마이크 선택 변경
========================= */

ui.microphoneSelect.addEventListener(
  "change",
  async (event) => {
    try {
      ui.previewDeviceStatus.textContent =
        "마이크 변경 중";

      await changePreviewMicrophone({
        deviceId:
          event.target.value,

        videoElement:
          ui.previewVideo,
      });

      ui.previewDeviceStatus.textContent =
        "마이크 변경 완료";
    } catch (error) {
      showMessage(
        ui.previewMessage,
        "마이크를 변경하지 못했습니다.",
        true,
      );
    }
  },
);

/* =========================
   프리뷰 장치 오류
========================= */

function handlePreviewDeviceError(
  error,
) {
  showMessage(
    ui.previewMessage,
    getDeviceErrorMessage(error),
    true,
  );
}

function getDeviceErrorMessage(
  error,
) {
  if (
    error?.name ===
    "NotAllowedError"
  ) {
    return "카메라와 마이크 사용을 허용해 주세요.";
  }

  if (
    error?.name ===
    "NotFoundError"
  ) {
    return "사용 가능한 카메라 또는 마이크를 찾지 못했습니다.";
  }

  if (
    error?.name ===
    "NotReadableError"
  ) {
    return "다른 프로그램에서 카메라 또는 마이크를 사용 중일 수 있습니다.";
  }

  return "카메라·마이크를 불러오지 못했습니다.";
}

/* =========================
   프리뷰 방 코드 복사
========================= */

ui.previewCopyCodeButton.addEventListener(
  "click",
  async () => {
    await copyRoomCode({
      roomCode:
        ui.previewRoomCode.textContent,

      messageElement:
        ui.previewMessage,
    });
  },
);

async function copyRoomCode({
  roomCode,
  messageElement,
}) {
  try {
    await navigator.clipboard
      .writeText(roomCode);

    showMessage(
      messageElement,
      "방 코드가 복사됐어요.",
      false,
    );
  } catch {
    showMessage(
      messageElement,
      `방 코드: ${roomCode}`,
      false,
    );
  }
}

/* =========================
   프리뷰 이전으로
========================= */

ui.previewBackButton.addEventListener(
  "click",
  async () => {
    await stopDevicePreview();

    ui.previewVideo.srcObject =
      null;

    pendingRoom = null;

    if (
      previewPreviousPanel ===
      "join"
    ) {
      showJoinRoomPanel();
    } else {
      showCreateRoomPanel();
    }
  },
);

/* =========================
   최종 스터디 입장
========================= */

ui.confirmJoinButton.addEventListener(
  "click",
  async () => {
    if (!pendingRoom) {
      showMessage(
        ui.previewMessage,
        "입장할 방 정보가 없습니다.",
        true,
      );

      return;
    }

    const previewSettings =
      getPreviewSettings();

    setConfirmJoinLoading(
      true,
    );

    /*
     * 프리뷰가 카메라를 잡고 있으므로
     * LiveKit 연결 전에 종료합니다.
     */
    await stopDevicePreview();

    ui.previewVideo.srcObject =
      null;

    try {
      await enterStudyRoom({
        roomCode:
          pendingRoom.roomCode,

        roomTitle:
          pendingRoom.roomTitle,

        previewSettings,
      });
    } catch (error) {
      console.error(
        "최종 입장 실패:",
        error,
      );
    } finally {
      setConfirmJoinLoading(
        false,
      );
    }
  },
);

function setConfirmJoinLoading(
  isLoading,
) {
  ui.confirmJoinButton.disabled =
    isLoading;

  ui.confirmJoinButton.textContent =
    isLoading
      ? "입장 중..."
      : "스터디 입장";
}

/* =========================
   실제 LiveKit 입장
========================= */

async function enterStudyRoom({
  roomCode,
  roomTitle,
  previewSettings,
}) {
  showStudyPage({
    roomCode,
    roomTitle,
  });

  startStudyTimer();

  try {
    await joinLiveKitRoom({
      roomName:
        roomCode,

      participantName:
        currentUser,

      /*
       * 다음 단계에서 livekitRoom.js가
       * 이 설정을 실제 카메라·마이크에
       * 반영하도록 수정합니다.
       */
      deviceSettings:
        previewSettings,

      onParticipantCountChange:
        (count) => {
          ui.participantCount.textContent =
            `${count}명`;
        },

      onConnectionStatusChange:
        (status) => {
          ui.connectionStatus.textContent =
            status;
        },

      onLocalVideoReady:
        (videoElement) => {
          console.log(
            "EAR 분석에 사용할 LiveKit 영상:",
            videoElement,
          );

          /*
           * 1번 주자 코드 연결:
           * LiveKit 로컬 영상이 준비되면
           * EAR 분석을 시작합니다.
           */
          startEarDetection(
            videoElement,
          ).catch((error) => {
            console.error(
              "EAR 분석 시작 실패:",
              error,
            );
          });
        },

      onDisconnected:
        () => {
          stopEarDetection();

          disconnectEarSocket();

          resetStudyScreen();

          showLobbyPage();
        },
    });

    setEarContext({
      nickname:
        currentUser,

      roomName:
        roomCode,
    });

    connectEarSocket({
      onSocketStatusChange:
        (status) => {
          ui.earSocketStatus.textContent =
            status;
        },

      onSendStatusChange:
        (status) => {
          ui.earSendStatus.textContent =
            status;
        },

      onEarChange:
        (ear) => {
          ui.earValue.textContent =
            ear.toFixed(3);
        },

      onFocusStatusChange:
        (status) => {
          ui.focusStatus.textContent =
            status;
        },

      onDrowsyChange:
        (isDrowsy) => {
          recordSelfDrowsyChange(
            isDrowsy,
          );

          broadcastDrowsyStatus(
            isDrowsy,
          );

          ui.drowsyAlert.hidden =
            !isDrowsy;

          if (isDrowsy) {
            playDrowsyAlertSound();
          }
        },
    });

    pendingRoom = null;
  } catch (error) {
    console.error(
      "스터디 방 입장 실패:",
      error,
    );

    stopEarDetection();

    disconnectEarSocket();

    await leaveLiveKitRoom();

    resetStudyScreen();

    /*
     * 실패하면 다시 프리뷰 화면으로
     * 돌아갈 수 있도록 방 정보를 유지합니다.
     */
    showPreviewPage();

    showMessage(
      ui.previewMessage,
      `입장 실패: ${error.message}`,
      true,
    );

    throw error;
  }
}

/* =========================
   실제 방 카메라
========================= */

ui.cameraButton.addEventListener(
  "click",
  async () => {
    ui.cameraButton.disabled =
      true;

    try {
      const enabled =
        await toggleCamera();

      ui.cameraButton.textContent =
        enabled
          ? "카메라 끄기"
          : "카메라 켜기";
    } catch (error) {
      console.error(
        "카메라 전환 실패:",
        error,
      );

      alert(
        "카메라 상태를 변경하지 못했습니다.",
      );
    } finally {
      ui.cameraButton.disabled =
        false;
    }
  },
);

ui.microphoneButton.addEventListener(
  "click",
  async () => {
    ui.microphoneButton.disabled =
      true;

    try {
      const enabled =
        await toggleMicrophone();

      ui.microphoneButton.textContent =
        enabled
          ? "마이크 끄기"
          : "마이크 켜기";
    } catch (error) {
      console.error(
        "마이크 전환 실패:",
        error,
      );

      alert(
        "마이크 상태를 변경하지 못했습니다.",
      );
    } finally {
      ui.microphoneButton.disabled =
        false;
    }
  },
);

/* =========================
   집중도 패널 열기/닫기
========================= */

ui.statsToggleButton.addEventListener(
  "click",
  () => {
    ui.statsPanel.classList.toggle(
      "is-open",
    );
  },
);

ui.statsCloseButton.addEventListener(
  "click",
  () => {
    ui.statsPanel.classList.remove(
      "is-open",
    );
  },
);

/* =========================
   실제 방 나가기
========================= */

ui.leaveButton.addEventListener(
  "click",
  async () => {
    stopEarDetection();

    disconnectEarSocket();

    await leaveLiveKitRoom();

    pendingRoom = null;

    resetStudyScreen();

    showLobbyPage();
  },
);

/* =========================
   스터디 화면 초기화
========================= */

function resetStudyScreen() {
  stopStudyTimer();

  ui.statsPanel.classList.remove(
    "is-open",
  );

  ui.videoGrid.innerHTML = "";

  ui.participantCount.textContent =
    "0명";

  ui.connectionStatus.textContent =
    "연결 중";

  ui.earSocketStatus.textContent =
    "AI 서버 대기";

  ui.earValue.textContent =
    "-";

  ui.focusStatus.textContent =
    "분석 대기 중";

  ui.earSendStatus.textContent =
    "대기 중";

  ui.drowsyAlert.hidden = true;

  ui.cameraButton.textContent =
    "카메라 끄기";

  ui.microphoneButton.textContent =
    "마이크 끄기";

  document
    .querySelectorAll(
      "[data-audio-participant]",
    )
    .forEach(
      (element) => {
        element.remove();
      },
    );
}

/* =========================
   EAR 전역 함수 공개
========================= */

exposeFacePositionSender();

exposeEarSender({
  onEarChange:
    (ear) => {
      ui.earValue.textContent =
        ear.toFixed(3);
    },

  onSendStatusChange:
    (status) => {
      ui.earSendStatus.textContent =
        status;
    },
});

/* =========================
   브라우저 종료
========================= */

window.addEventListener(
  "beforeunload",
  () => {
    stopDevicePreview();

    disconnectEarSocket();

    leaveLiveKitRoom();
  },
);

/* =========================
   첫 화면
========================= */

if (currentUser) {
  showLobbyPage();
} else {
  showLoginPage();
}