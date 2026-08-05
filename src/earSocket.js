/*
 * 백엔드 담당자가 실제 WebSocket 주소를 정하면
 * 이 한 줄만 바꾸면 됩니다.
 *
 * 기본값은 "지금 접속한 주소"를 그대로 씁니다.
 * (프론트를 켠 컴퓨터에서 EAR 서버도 같이 켤 경우 자동으로 맞음)
 * EAR 서버를 다른 컴퓨터에서 따로 켠다면, 아래 줄을
 * 그 컴퓨터의 IP로 직접 바꿔주세요.
 * 예: const EAR_SOCKET_URL = "ws://192.168.0.7:8001/ws/ear";
 */
const EAR_SOCKET_URL =
  `ws://${window.location.hostname}:8001/ws/ear`;

/*
 * EAR 값을 너무 자주 보내면 서버 부담이 커질 수 있어서
 * 0.2초마다 최대 한 번만 전송합니다.
 */
const EAR_SEND_INTERVAL_MS = 200;

let socket = null;
let reconnectTimer = null;
let lastSentAt = 0;

let currentNickname = null;
let currentRoomName = null;

/*
 * main.js에서 화면 요소를 직접 건드리지 않고,
 * 콜백 함수로 상태를 전달하기 위해 사용합니다.
 */
let callbacks = {
  onSocketStatusChange: () => {},
  onSendStatusChange: () => {},
  onEarChange: () => {},
  onFocusStatusChange: () => {},
};

/*
 * 현재 로그인한 사용자와 방 이름을 저장합니다.
 */
export function setEarContext({
  nickname,
  roomName,
}) {
  currentNickname = nickname;
  currentRoomName = roomName;
}

/*
 * EAR 전송용 WebSocket 연결
 */
export function connectEarSocket(
  nextCallbacks = {},
) {
  callbacks = {
    ...callbacks,
    ...nextCallbacks,
  };

  /*
   * 이미 연결됐거나 연결 중이면
   * 중복 연결하지 않습니다.
   */
  if (
    socket &&
    (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  clearTimeout(reconnectTimer);

  callbacks.onSocketStatusChange(
    "AI 서버 연결 중",
  );

  try {
    socket = new WebSocket(
      EAR_SOCKET_URL,
    );
  } catch (error) {
    console.error(
      "EAR WebSocket 생성 실패:",
      error,
    );

    callbacks.onSocketStatusChange(
      "AI 서버 연결 실패",
    );

    return;
  }

  socket.addEventListener(
    "open",
    () => {
      console.log(
        "EAR WebSocket 연결 성공",
      );

      callbacks.onSocketStatusChange(
        "AI 서버 연결됨",
      );

      callbacks.onSendStatusChange(
        "전송 준비 완료",
      );
    },
  );

  socket.addEventListener(
    "message",
    (event) => {
      handleServerMessage(
        event.data,
      );
    },
  );

  socket.addEventListener(
    "error",
    (error) => {
      console.error(
        "EAR WebSocket 오류:",
        error,
      );

      callbacks.onSocketStatusChange(
        "AI 서버 오류",
      );
    },
  );

  socket.addEventListener(
    "close",
    () => {
      console.log(
        "EAR WebSocket 연결 종료",
      );

      socket = null;

      callbacks.onSocketStatusChange(
        "AI 서버 연결 종료",
      );

      callbacks.onSendStatusChange(
        "전송 중지",
      );

      /*
       * 아직 스터디 방에 있는 상태라면
       * 3초 후 자동 재연결을 시도합니다.
       */
      if (currentRoomName) {
        reconnectTimer =
          setTimeout(() => {
            connectEarSocket();
          }, 3000);
      }
    },
  );
}

/*
 * WebSocket 연결 종료
 */
export function disconnectEarSocket() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;

  currentRoomName = null;

  if (socket) {
    socket.close();
    socket = null;
  }

  callbacks.onSocketStatusChange(
    "AI 서버 대기",
  );

  callbacks.onSendStatusChange(
    "대기 중",
  );
}

/*
 * 1번 주자의 EAR 계산 코드에서
 * 이 함수를 호출하면 됩니다.
 *
 * 예:
 * window.sendEarValue(0.274);
 */
export function sendEarValue(ear) {
  if (!Number.isFinite(ear)) {
    console.warn(
      "유효하지 않은 EAR 값:",
      ear,
    );

    return;
  }

  /*
   * 백엔드 응답을 기다리지 않고
   * 화면에 현재 EAR 값을 바로 표시합니다.
   */
  callbacks.onEarChange(ear);

  const now = Date.now();

  /*
   * 0.2초보다 빠르게 호출되면
   * 이번 값은 전송하지 않습니다.
   */
  if (
    now - lastSentAt <
    EAR_SEND_INTERVAL_MS
  ) {
    return;
  }

  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {
    callbacks.onSendStatusChange(
      "AI 서버 미연결",
    );

    return;
  }

  const payload =
    buildEarPayload(ear);

  socket.send(
    JSON.stringify(payload),
  );

  lastSentAt = now;

  callbacks.onSendStatusChange(
    "전송 중",
  );
}

/*
 * 백엔드로 보내는 JSON 형식입니다.
 *
 * 백엔드 담당자가 필드명을 다르게 정하면
 * 이 함수만 수정하면 됩니다.
 */
function buildEarPayload(ear) {
  return {
    type: "ear",
    nickname: currentNickname,
    room_name: currentRoomName,
    ear,
    timestamp: Date.now(),
  };
}

/*
 * 백엔드에서 받은 응답을
 * 프론트에서 쓰기 좋은 형태로 바꿉니다.
 *
 * 백엔드 응답 형식이 정해지면
 * 이 함수만 수정하면 됩니다.
 */
function parsePredictionResponse(data) {
  return {
    ear:
      typeof data.ear === "number"
        ? data.ear
        : null,

    status:
      data.status ??
      data.prediction ??
      null,
  };
}

/*
 * 백엔드 응답 처리
 */
function handleServerMessage(
  rawMessage,
) {
  try {
    const parsed =
      JSON.parse(rawMessage);

    const result =
      parsePredictionResponse(
        parsed,
      );

    if (
      typeof result.ear ===
      "number"
    ) {
      callbacks.onEarChange(
        result.ear,
      );
    }

    if (result.status !== null) {
      callbacks.onFocusStatusChange(
        convertStatusText(
          result.status,
        ),
      );
    }

    callbacks.onSendStatusChange(
      "응답 수신",
    );
  } catch (error) {
    console.error(
      "AI 서버 응답 처리 실패:",
      error,
    );

    callbacks.onSendStatusChange(
      "응답 오류",
    );
  }
}

/*
 * 백엔드의 상태 값을
 * 화면에 표시할 한글로 변환합니다.
 */
function convertStatusText(status) {
  const statusMap = {
    focused: "집중 중",
    focus: "집중 중",
    normal: "정상",
    drowsy: "졸음 감지",
    sleepy: "졸음 감지",
    distracted: "산만",
    absent: "자리 이탈",

    0: "정상",
    1: "졸음 감지",
  };

  return (
    statusMap[status] ??
    String(status)
  );
}

/*
 * 다른 JS 파일에서도
 * window.sendEarValue(ear) 형태로
 * 호출할 수 있게 만들어줍니다.
 */
export function exposeEarSender(
  extraCallbacks = {},
) {
  callbacks = {
    ...callbacks,
    ...extraCallbacks,
  };

  window.sendEarValue =
    sendEarValue;
}