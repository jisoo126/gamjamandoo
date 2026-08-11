/*
 * 배포된 AI 서버(4번 주자 팀에서 전달) 주소입니다.
 */
const EAR_SOCKET_URL =
  "wss://aigamja-brb6.onrender.com/ws/ear";

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
 * AI 모델이 요구하는 4개 변수(EAR, EAR_mean, EAR_std, EAR_diff)를
 * 계산하기 위해, 최근 EAR 값들을 기억해둡니다.
 * (1번 주자가 계산 순서를: EAR, EAR_mean, EAR_std, EAR_diff 로 확정)
 */
const EAR_HISTORY_SIZE = 30;
let earHistory = [];

/*
 * 기기마다(특히 웹캠 vs 휴대폰 카메라) EAR 절대값 자체가
 * 다르게 나오는 문제를 보정하기 위해, 방에 처음 들어온
 * 직후 몇 초 동안의 EAR 값을 "이 사람/이 기기의 정상 기준선"
 * 으로 저장해둡니다. (그 몇 초 동안은 눈을 뜨고 있다고 가정)
 */
const BASELINE_SAMPLE_TARGET = 20;

/*
 * 기준선보다 이 비율만큼 떨어지면, "이 프레임은
 * 눈이 감겨있다"고 봅니다. (realtime.py의
 * `ear < 0.20`과 같은 역할이지만, 기기마다 다른
 * 절대값 대신 각자의 기준선 대비 비율로 계산합니다)
 */
const LOW_EAR_DROP_RATIO = 0.35;

/*
 * "몇 % 떨어졌는지"보다 "그 상태가 계속 이어지는지"가
 * 핵심입니다. realtime.py와 같은 원리지만, 시간을
 * 더 넉넉하게 잡았습니다.
 *
 * 사람은 평소 3~5초에 한 번씩 자연스럽게 눈을
 * 깜빡여요 (집중하면 더 뜸해지기도 해요). 즉,
 * "눈이 낮은 수치로 유지되는 것처럼 보이는 구간"이
 * 1~2초 정도는 그냥 깜빡임 사이 간격일 수도 있어요.
 *
 * 그래서 "6초 동안 단 한 번도 값이 회복되는(=깜빡이는)
 * 순간이 없었는지"를 봅니다. 6초 안에 단 한 프레임이라도
 * 값이 다시 올라오면(=깜빡이면) 바로 0으로 리셋되고,
 * 6초를 꽉 채워 전혀 변화가 없어야만 진짜 졸음으로 인정합니다.
 */
const CONSECUTIVE_CLOSED_FRAMES_THRESHOLD = 60;

let baselineEar = null;
let baselineSamples = [];
let consecutiveClosedFrames = 0;
let isLocallySustainedClosed = false;

function updateBaseline(ear) {
  if (baselineEar !== null) {
    return;
  }

  baselineSamples.push(ear);

  if (
    baselineSamples.length <
    BASELINE_SAMPLE_TARGET
  ) {
    return;
  }

  baselineEar =
    baselineSamples.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / baselineSamples.length;
}

function computeEarFeatures(ear) {
  updateBaseline(ear);
  const previousEar =
    earHistory.length > 0
      ? earHistory[
          earHistory.length - 1
        ]
      : ear;

  earHistory.push(ear);

  if (
    earHistory.length >
    EAR_HISTORY_SIZE
  ) {
    earHistory.shift();
  }

  const mean =
    earHistory.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / earHistory.length;

  const variance =
    earHistory.reduce(
      (sum, value) =>
        sum +
        (value - mean) ** 2,
      0,
    ) / earHistory.length;

  const std = Math.sqrt(variance);
  const diff = ear - previousEar;

  /*
   * 기준선이 아직 없으면(막 입장한 직후) 판단을 보류합니다.
   */
  if (baselineEar) {
    const lowCutoff =
      baselineEar *
      (1 - LOW_EAR_DROP_RATIO);

    const isClosedThisFrame =
      ear < lowCutoff;

    if (isClosedThisFrame) {
      consecutiveClosedFrames += 1;
    } else {
      /*
       * 단 한 프레임이라도 눈을 뜨면(값이 다시
       * 올라오면) 바로 리셋 - 이게 "눈 깜빡임은
       * 걸러내고, 진짜 지속되는 감김만 잡는" 핵심입니다.
       */
      consecutiveClosedFrames = 0;
    }

    isLocallySustainedClosed =
      consecutiveClosedFrames >=
      CONSECUTIVE_CLOSED_FRAMES_THRESHOLD;
  } else {
    consecutiveClosedFrames = 0;
    isLocallySustainedClosed = false;
  }

  return { mean, std, diff };
}

/*
 * AI 서버가 아직 없을 때 무한정 재연결을 시도하면
 * 화면 상태가 계속 깜빡여서 보기 불편합니다.
 * 몇 번만 시도하고, 그 다음엔 조용히 멈춥니다.
 * (3번 팀원이 서버를 완성하면, 방을 나갔다 다시
 *  들어오는 것만으로 자동으로 다시 연결을 시도합니다)
 */
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

/*
 * main.js에서 화면 요소를 직접 건드리지 않고,
 * 콜백 함수로 상태를 전달하기 위해 사용합니다.
 */
let callbacks = {
  onSocketStatusChange: () => {},
  onSendStatusChange: () => {},
  onEarChange: () => {},
  onFocusStatusChange: () => {},
  /*
   * 졸음 여부(true/false)가 바뀔 때마다 호출됩니다.
   * main.js에서 이 값을 받아 livekitRoom.js의
   * broadcastDrowsyStatus로 전달해서, 같은 방
   * 사람들에게 알감자 캐릭터를 띄워줍니다.
   */
  onDrowsyChange: () => {},
};

/*
 * 직전에 판정된 졸음 여부를 기억해뒀다가,
 * 값이 실제로 바뀔 때만 onDrowsyChange를 호출합니다.
 * (매번 같은 값을 반복해서 방송하지 않기 위해서예요)
 */
let lastKnownIsDrowsy = false;

/*
 * 백엔드가 보내는 status 값 중, "졸음"으로 볼 값들입니다.
 */
function isDrowsyStatus(status) {
  return (
    status === "drowsy" ||
    status === "sleepy" ||
    status === 1 ||
    status === "1"
  );
}

/*
 * 현재 로그인한 사용자와 방 이름을 저장합니다.
 */
export function setEarContext({
  nickname,
  roomName,
}) {
  currentNickname = nickname;
  currentRoomName = roomName;

  /*
   * 새로 방에 들어온 것이므로
   * 재연결 시도 횟수를 초기화합니다.
   */
  reconnectAttempts = 0;

  /*
   * 이전 세션의 EAR 값이 평균/표준편차 계산에
   * 섞이지 않도록 이력도 초기화합니다.
   */
  earHistory = [];

  lastKnownIsDrowsy = false;

  /*
   * 새로 입장한 것이므로 개인 기준선도
   * 처음부터 다시 계산합니다.
   */
  baselineEar = null;
  baselineSamples = [];
  consecutiveClosedFrames = 0;
  isLocallySustainedClosed = false;
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

      reconnectAttempts = 0;

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

      /*
       * 재시도 횟수를 다 썼으면, 계속 깜빡이지 않도록
       * 조용히 멈추고 고정된 메시지를 보여줍니다.
       */
      if (
        currentRoomName &&
        reconnectAttempts <
          MAX_RECONNECT_ATTEMPTS
      ) {
        reconnectAttempts += 1;

        callbacks.onSocketStatusChange(
          "AI 서버 연결 종료",
        );

        callbacks.onSendStatusChange(
          "전송 중지",
        );

        reconnectTimer =
          setTimeout(() => {
            connectEarSocket();
          }, 3000);

        return;
      }

      if (currentRoomName) {
        callbacks.onSocketStatusChange(
          "AI 서버 대기 (아직 준비 안 됨)",
        );
      } else {
        callbacks.onSocketStatusChange(
          "AI 서버 연결 종료",
        );
      }

      callbacks.onSendStatusChange(
        "전송 중지",
      );
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

  if (lastKnownIsDrowsy) {
    lastKnownIsDrowsy = false;

    callbacks.onDrowsyChange(false);
  }
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

  /*
   * 전송 여부와 상관없이, 매 프레임마다
   * 이력을 계속 쌓아야 평균/표준편차가 정확해집니다.
   * (이 안에서 "몇 프레임 연속으로 감겼는지"도
   *  같이 계산됩니다)
   */
  const features =
    computeEarFeatures(ear);

  /*
   * 서버 응답을 기다리지 않고, 지금 이 순간
   * 로컬에서 계산한 결과로 바로 졸음 여부를
   * 판단합니다. (네트워크 지연/타이밍 어긋남 문제를
   * 원천적으로 없애기 위해, realtime.py와 똑같이
   * 프론트엔드에서 직접 판단합니다)
   */
  if (
    isLocallySustainedClosed !==
    lastKnownIsDrowsy
  ) {
    lastKnownIsDrowsy =
      isLocallySustainedClosed;

    callbacks.onDrowsyChange(
      isLocallySustainedClosed,
    );
  }

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

  const payload = buildEarPayload(
    ear,
    features,
  );

  socket.send(
    JSON.stringify(payload),
  );

  lastSentAt = now;

  callbacks.onSendStatusChange(
    "전송 중",
  );
}

/*
 * 백엔드로 보내는 형식입니다.
 * 1번 주자가 알려준 순서: [EAR, EAR_mean, EAR_std, EAR_diff]
 *
 * 서버가 실제로 요구하는 형식은 순수 배열입니다.
 * ({"features": [...]}로 감싸면 서버가
 *  "잘못된 데이터 형식" 에러를 돌려줍니다 - 확인됨)
 */
function buildEarPayload(
  ear,
  { mean, std, diff },
) {
  return [ear, mean, std, diff];
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

    /*
     * 서버가 실제로 뭘 돌려주는지
     * 콘솔에서 바로 확인할 수 있도록 로그를 남깁니다.
     */
    console.log(
      "[AI 서버 응답]",
      parsed,
    );

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

      /*
       * 실제 졸음 감지(경고/알감자 등)는
       * 이미 sendEarValue에서 로컬로
       * 판단해서 처리했습니다. 여기 서버
       * 응답은 "AI 판정 결과"를 화면에
       * 참고용으로 보여주는 용도로만 씁니다.
       */
    }

    /*
     * "전송 중" ↔ "응답 수신"을 매번 빠르게 오가면
     * 화면이 깜빡여서 시선을 뺏기니, 응답이 왔다고
     * 굳이 문구를 바꾸지 않습니다.
     * (연결 끊김/오류일 때만 문구가 바뀝니다)
     */
  } catch (error) {
    console.error(
      "AI 서버 응답 처리 실패:",
      error,
    );

    console.error(
      "원본 메시지:",
      rawMessage,
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