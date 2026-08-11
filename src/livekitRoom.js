import {
  Room,
  RoomEvent,
  Track,
} from "livekit-client";

/*
 * LiveKit 토큰 발급 서버(server.js) 주소입니다.
 * Render에 배포된 주소를 직접 사용합니다.
 */
const TOKEN_SERVER_URL =
  "https://aigamja.onrender.com/token";

let room = null;

let cameraEnabled = true;
let microphoneEnabled = true;

let selectedCameraId = "";
let selectedMicrophoneId = "";

let callbacks = {
  onParticipantCountChange: () => {},
  onConnectionStatusChange: () => {},
  onLocalVideoReady: () => {},
  onDisconnected: () => {},
};

/*
 * 데이터 채널로 보낼 때 사용하는 이벤트 이름입니다.
 * 다른 종류의 데이터와 섞이지 않도록 구분합니다.
 */
const DROWSY_EVENT_TYPE = "drowsy-status";

/*
 * 얼굴 위치도 데이터 채널로 보냅니다.
 * 너무 자주 보내면 네트워크 부담이 크니
 * 최대 초당 10번으로 제한합니다.
 */
const FACE_POSITION_EVENT_TYPE =
  "face-position";
const FACE_POSITION_INTERVAL_MS = 100;
let lastFacePositionSentAt = 0;

/* =========================
   LiveKit 방 입장
========================= */

export async function joinLiveKitRoom({
  roomName,
  participantName,
  deviceSettings = {},
  ...nextCallbacks
}) {
  callbacks = {
    ...callbacks,
    ...nextCallbacks,
  };

  cameraEnabled =
    deviceSettings.cameraEnabled ??
    true;

  microphoneEnabled =
    deviceSettings.microphoneEnabled ??
    true;

  selectedCameraId =
    deviceSettings.selectedCameraId ??
    "";

  selectedMicrophoneId =
    deviceSettings.selectedMicrophoneId ??
    "";

  const tokenData =
    await requestToken(
      roomName,
      participantName,
    );

  room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  registerRoomEvents();

  callbacks.onConnectionStatusChange(
    "LiveKit 연결 중",
  );

  await room.connect(
    tokenData.server_url,
    tokenData.participant_token,
  );

  /*
   * 브라우저의 자동재생 정책 때문에
   * 사용자 클릭 직후 오디오 재생을 시작합니다.
   */
  await room
    .startAudio()
    .catch(() => {});

  callbacks.onConnectionStatusChange(
    "장치 연결 중",
  );

  await applyInitialDeviceSettings();

  renderExistingLocalVideo();

  callbacks.onParticipantCountChange(
    getParticipantCount(),
  );

  callbacks.onConnectionStatusChange(
    "LiveKit 연결됨",
  );
}

/* =========================
   프리뷰 설정 실제 반영
========================= */

async function applyInitialDeviceSettings() {
  if (!room) {
    return;
  }

  const localParticipant =
    room.localParticipant;

  /*
   * 카메라가 켜진 상태로 입장한 경우:
   * 프리뷰에서 선택한 카메라로
   * 영상 트랙을 생성하고 게시합니다.
   */
  if (cameraEnabled) {
    const cameraOptions =
      selectedCameraId
        ? {
            deviceId:
              selectedCameraId,
          }
        : undefined;

    await localParticipant
      .setCameraEnabled(
        true,
        cameraOptions,
      );
  }

  /*
   * 마이크가 켜진 상태로 입장한 경우:
   * 선택한 마이크로 오디오 트랙을
   * 생성하고 게시합니다.
   */
  if (microphoneEnabled) {
    const microphoneOptions =
      selectedMicrophoneId
        ? {
            deviceId:
              selectedMicrophoneId,
          }
        : undefined;

    await localParticipant
      .setMicrophoneEnabled(
        true,
        microphoneOptions,
      );
  }
}

/* =========================
   토큰 요청
========================= */

async function requestToken(
  roomName,
  participantName,
) {
  const response = await fetch(
    TOKEN_SERVER_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        room_name:
          roomName,

        participant_name:
          participantName,
      }),
    },
  );

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.detail ??
        "LiveKit 토큰 발급에 실패했습니다.",
    );
  }

  if (
    !data?.server_url ||
    !data?.participant_token
  ) {
    throw new Error(
      "토큰 서버에서 접속 정보를 받지 못했습니다.",
    );
  }

  return data;
}

/* =========================
   LiveKit 이벤트
========================= */

function registerRoomEvents() {
  room.on(
    RoomEvent.LocalTrackPublished,
    (
      publication,
      participant,
    ) => {
      const track =
        publication.track;

      if (
        !track ||
        track.kind !==
          Track.Kind.Video
      ) {
        return;
      }

      attachVideoTrack({
        track,

        participantId:
          participant.identity,

        participantName:
          participant.name ||
          participant.identity,

        isLocal: true,
      });
    },
  );

  room.on(
    RoomEvent.TrackSubscribed,
    (
      track,
      publication,
      participant,
    ) => {
      if (
        track.kind ===
        Track.Kind.Video
      ) {
        attachVideoTrack({
          track,

          participantId:
            participant.identity,

          participantName:
            participant.name ||
            participant.identity,

          isLocal: false,
        });
      }

      if (
        track.kind ===
        Track.Kind.Audio
      ) {
        attachAudioTrack(
          track,
          participant.identity,
        );
      }
    },
  );

  room.on(
    RoomEvent.TrackUnsubscribed,
    (
      track,
      publication,
      participant,
    ) => {
      track
        .detach()
        .forEach(
          (element) => {
            element.remove();
          },
        );

      if (
        track.kind ===
        Track.Kind.Video
      ) {
        showCameraOffState(
          participant.identity,
        );
      }
    },
  );

  /*
   * 상대 참가자가 카메라를 껐을 때
   */
  room.on(
    RoomEvent.TrackMuted,
    (
      publication,
      participant,
    ) => {
      if (
        publication.kind ===
        Track.Kind.Video
      ) {
        showCameraOffState(
          participant.identity,
        );
      }
    },
  );

  /*
   * 상대 참가자가 카메라를 다시 켰을 때
   */
  room.on(
    RoomEvent.TrackUnmuted,
    (
      publication,
      participant,
    ) => {
      const track =
        publication.track;

      if (
        track &&
        track.kind ===
          Track.Kind.Video
      ) {
        attachVideoTrack({
          track,

          participantId:
            participant.identity,

          participantName:
            participant.name ||
            participant.identity,

          isLocal:
            participant.isLocal,
        });
      }
    },
  );

  room.on(
    RoomEvent.ParticipantConnected,
    () => {
      callbacks
        .onParticipantCountChange(
          getParticipantCount(),
        );
    },
  );

  room.on(
    RoomEvent.ParticipantDisconnected,
    (participant) => {
      removeParticipantCard(
        participant.identity,
      );

      removeParticipantAudio(
        participant.identity,
      );

      callbacks
        .onParticipantCountChange(
          getParticipantCount(),
        );
    },
  );

  room.on(
    RoomEvent.Reconnecting,
    () => {
      callbacks
        .onConnectionStatusChange(
          "LiveKit 재연결 중",
        );
    },
  );

  room.on(
    RoomEvent.Reconnected,
    () => {
      callbacks
        .onConnectionStatusChange(
          "LiveKit 연결됨",
        );
    },
  );

  room.on(
    RoomEvent.Disconnected,
    () => {
      room = null;

      callbacks.onDisconnected();
    },
  );

  /*
   * 같은 방의 누군가가 졸음 신호를 보내면 여기로 도착합니다.
   * (내가 보낸 신호는 여기로 안 돌아옵니다. 내 신호는
   *  broadcastDrowsyStatus를 부르는 쪽에서 직접 처리해요.)
   */
  room.on(
    RoomEvent.DataReceived,
    (payload, participant) => {
      let message;

      try {
        message = JSON.parse(
          new TextDecoder().decode(
            payload,
          ),
        );
      } catch (error) {
        return;
      }

      if (
        message.type ===
        FACE_POSITION_EVENT_TYPE
      ) {
        setParticipantFacePosition(
          participant.identity,
          {
            x: message.x,
            y: message.y,
          },
          false,
        );

        return;
      }

      if (
        message.type !==
          DROWSY_EVENT_TYPE ||
        !participant
      ) {
        return;
      }

      setParticipantDrowsyOverlay(
        participant.identity,
        message.isDrowsy,
      );
    },
  );
}

/*
 * 나의 졸음 상태를, 같은 방에 있는 모든 사람에게
 * 실시간으로 알립니다. (earSocket.js가 AI 서버로부터
 * 판정 결과를 받으면 이 함수를 호출해서 방송합니다)
 */
export function broadcastDrowsyStatus(
  isDrowsy,
) {
  if (!room) {
    return;
  }

  const payload =
    new TextEncoder().encode(
      JSON.stringify({
        type: DROWSY_EVENT_TYPE,
        isDrowsy,
      }),
    );

  room.localParticipant
    .publishData(payload, {
      reliable: true,
    });

  /*
   * 내 화면에도 똑같이 반영되도록,
   * 나 자신에 대해서도 오버레이를 켜고 끕니다.
   */
  setParticipantDrowsyOverlay(
    room.localParticipant.identity,
    isDrowsy,
  );
}

/*
 * 참가자 카드 위에 알감자 캐릭터를 보여주거나 숨깁니다.
 */
function setParticipantDrowsyOverlay(
  participantId,
  isDrowsy,
) {
  const card =
    document.querySelector(
      `[data-participant-id="${participantId}"]`,
    );

  if (!card) {
    return;
  }

  card.classList.toggle(
    "is-drowsy",
    Boolean(isDrowsy),
  );

  const badge =
    card.querySelector(
      ".status-badge",
    );

  if (badge) {
    badge.classList.toggle(
      "status-badge-drowsy",
      Boolean(isDrowsy),
    );

    badge.textContent = isDrowsy
      ? "😪 졸림"
      : "😊 정상";
  }
}

/*
 * 나의 얼굴 위치(이마 기준점)를, 같은 방에 있는
 * 모든 사람에게 실시간으로 알립니다.
 * earDetection.js가 매 프레임 이 함수를 호출합니다.
 */
export function broadcastFacePosition(
  position,
) {
  if (!room) {
    return;
  }

  const now = Date.now();

  if (
    now - lastFacePositionSentAt <
    FACE_POSITION_INTERVAL_MS
  ) {
    return;
  }

  lastFacePositionSentAt = now;

  const payload =
    new TextEncoder().encode(
      JSON.stringify({
        type: FACE_POSITION_EVENT_TYPE,
        x: position.x,
        y: position.y,
      }),
    );

  /*
   * 위치 정보는 놓쳐도 큰 문제 없어서(다음 프레임에
   * 또 오니까), 더 빠른 unreliable 채널로 보냅니다.
   */
  room.localParticipant
    .publishData(payload, {
      reliable: false,
    });

  setParticipantFacePosition(
    room.localParticipant.identity,
    position,
    true,
  );
}

/*
 * window.sendFacePosition 훅을 연결합니다.
 * (earDetection.js가 이 전역 함수를 호출해요)
 */
export function exposeFacePositionSender() {
  window.sendFacePosition =
    broadcastFacePosition;
}

/*
 * 알감자 캐릭터를 실제 얼굴 위치로 옮깁니다.
 * isLocalSelf가 true면, 내 화면에서 내 캠은
 * 거울처럼 좌우반전(CSS)돼 보이기 때문에
 * x좌표를 반대로 뒤집어줍니다.
 */
function setParticipantFacePosition(
  participantId,
  { x, y },
  isLocalSelf,
) {
  const card =
    document.querySelector(
      `[data-participant-id="${participantId}"]`,
    );

  if (!card) {
    return;
  }

  const mascotWrap =
    card.querySelector(
      ".algamja-mascot-wrap",
    );

  if (!mascotWrap) {
    return;
  }

  const displayX = isLocalSelf
    ? 1 - x
    : x;

  mascotWrap.style.left = `${displayX * 100}%`;
  mascotWrap.style.top = `${y * 100}%`;
}

/* =========================
   기존 내 영상 표시
========================= */

function renderExistingLocalVideo() {
  if (!room) {
    return;
  }

  const participant =
    room.localParticipant;

  for (
    const publication
    of participant
      .videoTrackPublications
      .values()
  ) {
    const track =
      publication.track;

    if (!track) {
      continue;
    }

    attachVideoTrack({
      track,

      participantId:
        participant.identity,

      participantName:
        participant.name ||
        participant.identity,

      isLocal: true,
    });
  }

  /*
   * 카메라를 끈 상태로 입장했더라도
   * 참가자 카드는 보여주기 위해 생성합니다.
   */
  if (!cameraEnabled) {
    ensureLocalParticipantCard();

    showCameraOffState(
      participant.identity,
    );
  }
}

function ensureLocalParticipantCard() {
  if (!room) {
    return;
  }

  const participant =
    room.localParticipant;

  const existingCard =
    document.querySelector(
      `[data-participant-id="${participant.identity}"]`,
    );

  if (existingCard) {
    return;
  }

  const videoGrid =
    document.querySelector(
      "#videoGrid",
    );

  if (!videoGrid) {
    return;
  }

  const card =
    createParticipantCard({
      participantId:
        participant.identity,

      participantName:
        participant.name ||
        participant.identity,

      isLocal: true,
    });

  videoGrid.appendChild(
    card,
  );
}

/* =========================
   영상 HTML 연결
========================= */

function attachVideoTrack({
  track,
  participantId,
  participantName,
  isLocal,
}) {
  const videoGrid =
    document.querySelector(
      "#videoGrid",
    );

  if (!videoGrid) {
    throw new Error(
      "#videoGrid 요소를 찾을 수 없습니다.",
    );
  }

  let card =
    document.querySelector(
      `[data-participant-id="${participantId}"]`,
    );

  if (!card) {
    card =
      createParticipantCard({
        participantId,
        participantName,
        isLocal,
      });

    videoGrid.appendChild(
      card,
    );
  }

  const videoContainer =
    card.querySelector(
      ".video-container",
    );

  /*
   * 예전엔 innerHTML = ""로 통째로 비웠는데,
   * 그러면 그 안에 있던 상태 배지·알감자 마스코트
   * 요소까지 같이 사라져버리는 버그가 있었습니다.
   * 카메라 영상(video)과 "카메라 준비 중" 문구만
   * 골라서 지우고, 나머지는 그대로 둡니다.
   */
  const oldVideoElement =
    videoContainer.querySelector(
      "video",
    );

  if (oldVideoElement) {
    oldVideoElement.remove();
  }

  const oldWaitingText =
    videoContainer.querySelector(
      ".camera-off-text",
    );

  if (oldWaitingText) {
    oldWaitingText.remove();
  }

  const videoElement =
    track.attach();

  videoElement.autoplay =
    true;

  videoElement.playsInline =
    true;

  videoElement.className =
    "participant-video";

  if (isLocal) {
    videoElement.muted =
      true;

    videoElement.dataset.local =
      "true";
  }

  videoContainer.appendChild(
    videoElement,
  );

  videoElement
    .play()
    .catch(() => {});

  if (isLocal) {
    const notifyLocalVideoReady =
      () => {
        callbacks
          .onLocalVideoReady(
            videoElement,
          );
      };

    if (
      videoElement.readyState >= 2
    ) {
      notifyLocalVideoReady();
    } else {
      videoElement
        .addEventListener(
          "loadeddata",
          notifyLocalVideoReady,
          {
            once: true,
          },
        );
    }
  }
}

/* =========================
   참가자 카드 생성
========================= */

function createParticipantCard({
  participantId,
  participantName,
  isLocal,
}) {
  const card =
    document.createElement(
      "article",
    );

  card.className =
    "participant-card";

  card.dataset.participantId =
    participantId;

  const videoContainer =
    document.createElement(
      "div",
    );

  videoContainer.className =
    "video-container";

  const waitingText =
    document.createElement(
      "p",
    );

  waitingText.className =
    "camera-off-text";

  waitingText.textContent =
    "카메라 준비 중";

  videoContainer.appendChild(
    waitingText,
  );

  const statusBadge =
    document.createElement(
      "span",
    );

  statusBadge.className =
    "status-badge";

  statusBadge.textContent =
    "😊 정상";

  videoContainer.appendChild(
    statusBadge,
  );

  const mascotOverlay =
    document.createElement(
      "div",
    );

  mascotOverlay.className =
    "algamja-mascot-overlay";

  mascotOverlay.innerHTML = `
    <div class="algamja-mascot-wrap">
      <div class="algamja-mascot">
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <ellipse cx="60" cy="68" rx="42" ry="38" fill="#E8B96A" stroke="#B8823C" stroke-width="4"/>
          <ellipse cx="38" cy="60" rx="5" ry="4" fill="#C99A52"/>
          <ellipse cx="82" cy="72" rx="4" ry="3" fill="#C99A52"/>
          <ellipse cx="55" cy="42" rx="3" ry="3" fill="#C99A52"/>
          <circle cx="45" cy="62" r="6" fill="#3A2A1A"/>
          <circle cx="75" cy="62" r="6" fill="#3A2A1A"/>
          <circle cx="47" cy="60" r="2" fill="#fff"/>
          <circle cx="77" cy="60" r="2" fill="#fff"/>
          <path d="M46 80 Q60 92 74 80" stroke="#3A2A1A" stroke-width="4" fill="none" stroke-linecap="round"/>
          <ellipse cx="36" cy="74" rx="6" ry="4" fill="#F2A1A1" opacity="0.7"/>
          <ellipse cx="84" cy="74" rx="6" ry="4" fill="#F2A1A1" opacity="0.7"/>
        </svg>
      </div>
      <p class="algamja-mascot-text">
        일어나요! 👋
      </p>
    </div>
  `;

  videoContainer.appendChild(
    mascotOverlay,
  );

  const information =
    document.createElement(
      "div",
    );

  information.className =
    "participant-information";

  const nameElement =
    document.createElement(
      "strong",
    );

  nameElement.textContent =
    isLocal
      ? `${participantName} (나)`
      : participantName;

  const statusElement =
    document.createElement(
      "span",
    );

  statusElement.textContent =
    isLocal
      ? "내 카메라"
      : "스터디 참여 중";

  information.append(
    nameElement,
    statusElement,
  );

  card.append(
    videoContainer,
    information,
  );

  return card;
}

/* =========================
   카메라 꺼짐 표시
========================= */

function showCameraOffState(
  participantId,
) {
  const card =
    document.querySelector(
      `[data-participant-id="${participantId}"]`,
    );

  if (!card) {
    return;
  }

  const videoContainer =
    card.querySelector(
      ".video-container",
    );

  /*
   * 여기서도 통째로 지우지 않고,
   * video 요소만 없애고 "카메라 꺼짐" 문구를
   * 새로 넣습니다. (배지·마스코트는 보존)
   */
  const oldVideoElement =
    videoContainer.querySelector(
      "video",
    );

  if (oldVideoElement) {
    oldVideoElement.remove();
  }

  let cameraOffText =
    videoContainer.querySelector(
      ".camera-off-text",
    );

  if (!cameraOffText) {
    cameraOffText =
      document.createElement(
        "p",
      );

    cameraOffText.className =
      "camera-off-text";

    videoContainer.appendChild(
      cameraOffText,
    );
  }

  cameraOffText.textContent =
    "카메라가 꺼져 있습니다";
}

/* =========================
   상대 오디오
========================= */

function attachAudioTrack(
  track,
  participantId,
) {
  const audioElement =
    track.attach();

  audioElement.autoplay =
    true;

  audioElement.dataset
    .audioParticipant =
    participantId;

  document.body.appendChild(
    audioElement,
  );

  audioElement
    .play()
    .catch(() => {});
}

/* =========================
   참가자 제거
========================= */

function removeParticipantCard(
  participantId,
) {
  document
    .querySelector(
      `[data-participant-id="${participantId}"]`,
    )
    ?.remove();
}

function removeParticipantAudio(
  participantId,
) {
  document
    .querySelectorAll(
      `[data-audio-participant="${participantId}"]`,
    )
    .forEach(
      (element) => {
        element.remove();
      },
    );
}

/* =========================
   참가 인원
========================= */

function getParticipantCount() {
  if (!room) {
    return 0;
  }

  return (
    room.remoteParticipants.size +
    1
  );
}

/* =========================
   실제 방 카메라 켜기/끄기
========================= */

export async function toggleCamera() {
  if (!room) {
    throw new Error(
      "LiveKit 방에 연결되어 있지 않습니다.",
    );
  }

  cameraEnabled =
    !cameraEnabled;

  const cameraOptions =
    selectedCameraId
      ? {
          deviceId:
            selectedCameraId,
        }
      : undefined;

  await room.localParticipant
    .setCameraEnabled(
      cameraEnabled,
      cameraOptions,
    );

  if (!cameraEnabled) {
    ensureLocalParticipantCard();

    showCameraOffState(
      room.localParticipant.identity,
    );
  } else {
    renderExistingLocalVideo();
  }

  return cameraEnabled;
}

/* =========================
   실제 방 마이크 켜기/끄기
========================= */

export async function toggleMicrophone() {
  if (!room) {
    throw new Error(
      "LiveKit 방에 연결되어 있지 않습니다.",
    );
  }

  microphoneEnabled =
    !microphoneEnabled;

  const microphoneOptions =
    selectedMicrophoneId
      ? {
          deviceId:
            selectedMicrophoneId,
        }
      : undefined;

  await room.localParticipant
    .setMicrophoneEnabled(
      microphoneEnabled,
      microphoneOptions,
    );

  return microphoneEnabled;
}

/* =========================
   장치 변경
========================= */

export async function changeLiveKitCamera(
  deviceId,
) {
  if (!room || !deviceId) {
    return false;
  }

  selectedCameraId =
    deviceId;

  /*
   * 이미 카메라 트랙이 켜진 상태면
   * 현재 사용 장치를 즉시 변경합니다.
   */
  if (cameraEnabled) {
    return room.switchActiveDevice(
      "videoinput",
      deviceId,
      true,
    );
  }

  return true;
}

export async function changeLiveKitMicrophone(
  deviceId,
) {
  if (!room || !deviceId) {
    return false;
  }

  selectedMicrophoneId =
    deviceId;

  if (microphoneEnabled) {
    return room.switchActiveDevice(
      "audioinput",
      deviceId,
      true,
    );
  }

  return true;
}

/* =========================
   현재 장치 상태
========================= */

export function getLiveKitDeviceSettings() {
  return {
    cameraEnabled,
    microphoneEnabled,
    selectedCameraId,
    selectedMicrophoneId,
  };
}

/* =========================
   방 나가기
========================= */

export async function leaveLiveKitRoom() {
  if (!room) {
    return;
  }

  const activeRoom =
    room;

  room = null;

  activeRoom.disconnect();

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