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

  videoContainer.innerHTML =
    "";

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

  videoContainer.innerHTML = `
    <p class="camera-off-text">
      카메라가 꺼져 있습니다
    </p>
  `;
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