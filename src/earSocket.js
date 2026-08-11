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
 *
 * 이후에는 서버가 "졸림"이라고 응답해도, 실제로 이
 * 기준선보다 충분히 낮아졌을 때만 진짜 졸음으로 인정합니다.
 * → 기기 차이로 인한 오탐지를 프론트엔드에서 한 번 더 걸러냅니다.
 */
const BASELINE_SAMPLE_TARGET = 20;

/*
 * 핵심은 "몇 % 떨어졌는지"가 아니라
 * "변화(깜빡임)가 아예 멈췄는지"입니다.
 *
 * 공부하려고 고개를 숙이면 EAR 자체는 낮아지지만,
 * 그래도 계속 깜빡이는 한 값은 계속 오르내려요.
 * 진짜 졸 때는 눈을 계속 감고 있으니, 그 순간부터
 * 값이 "그대로 멈춰서" 더 이상 안 움직여요.
 *
 * 그래서 "얼마나 낮은지"는 느슨하게(대략 눈을 감았을
 * 가능성이 있는 정도로만) 확인하고, "얼마나 평평한지
 * (움직임이 없는지)"를 훨씬 더 엄격하게, 그리고
 * 주된 기준으로 봅니다.
 */
const BASELINE_DROP_THRESHOLD = 0.3;

/*
 * 지금 변동폭(std)이 이 사람 평소 변동폭의
 * 이 비율보다 작아지면 "더 이상 안 움직인다
 * (평평하다)"고 봅니다. 이게 졸음 판단의
 * 핵심 기준입니다.
 */
const FLAT_STD_RATIO = 0.35;

let baselineEar = null;
let baselineStd = null;
let baselineSamples = [];
let isBelowPersonalBaseline = false;

/*
 * "보낼 때의 상태"와 "그 응답이 왔을 때의 상태"가
 * 시간차 때문에 어긋나는 문제를 막기 위해,
 * 전송한 순서대로 그 당시의 기준선 판정 결과를
 * 큐에 저장해뒀다가, 응답이 도착하면 그 순서대로
 * 꺼내서 사용합니다.
 */
let pendingBaselineChecks = [];

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

  /*
   * "평소에 얼마나 자연스럽게 눈을 깜빡이며
   * 값이 오르락내리락하는지"도 같이 저장해둡니다.
   * (아래를 보고 있어서 EAR 자체는 낮아도,
   *  이 변동폭만큼은 계속 유지되면 "그냥 자세
   *  때문"이지 "졸음"이 아니라고 구분하기 위함)
   */
  const baselineVariance =
    baselineSamples.reduce(
      (sum, value) =>
        sum +
        (value - baselineEar) **
          2,
      0,
    ) / baselineSamples.length;

  baselineStd = Math.sqrt(
    baselineVariance,
  );
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
   * 기준선이 아직 없으면(막 입장한 직후) 안전하게
   * "기준선 아래 아님"으로 둡니다 - 성급하게 졸음
   * 경고가 뜨지 않도록요.
   */
  if (baselineEar && baselineStd) {
    const relativeDrop =
      (baselineEar - mean) /
      baselineEar;

    const isLow =
      relativeDrop >=
      BASELINE_DROP_THRESHOLD;

    /*
     * 책상을 내려다보느라 EAR이 낮아진 것뿐이라면,
     * 그래도 계속 깜빡이니까 std(변동폭)는 평소랑
     * 비슷하게 유지돼요. 반대로 진짜 눈을 감고
     * 있으면, 더 이상 깜빡이질 않으니 std가
     * 확 줄어들어요(평평해짐).
     *
     * → "낮으면서 + 평평하기까지 해야" 진짜 졸음 후보로 봅니다.
     */
    const isFlat =
      std <=
      baselineStd *
        FLAT_STD_RATIO;

    isBelowPersonalBaseline =
      isLow && isFlat;
  } else {
    isBelowPersonalBaseline = false;
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
 * "평평함(std)" 판단 자체가 이미 최근 3초 구간
 * (earHistory 30개, 0.1초 간격)을 보고 계산되기
 * 때문에, "그 위에 또 몇 초를 기다린다"는 조건을
 * 겹쳐 넣으면 지나치게 둔감해져요.
 *
 * 여기서는 카메라 인식 노이즈로 인한 단일 프레임
 * 오작동만 걸러낼 정도로 짧게(0.5초) 둡니다.
 */
const DROWSY_CONFIRM_DURATION_MS = 500;
let drowsyStreakStartedAt = null;
let normalStreakStartedAt = null;

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

  drowsyStreakStartedAt = null;
  normalStreakStartedAt = null;
  lastKnownIsDrowsy = false;

  /*
   * 새로 입장한 것이므로 개인 기준선도
   * 처음부터 다시 계산합니다.
   */
  baselineEar = null;
  baselineStd = null;
  baselineSamples = [];
  isBelowPersonalBaseline = false;
  pendingBaselineChecks = [];
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

  pendingBaselineChecks = [];

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
   */
  const features =
    computeEarFeatures(ear);

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

  /*
   * 지금 이 값을 보내는 시점의 기준선 판정을
   * 큐에 기록해둡니다. (응답이 오면 이 순서대로 꺼내씀)
   */
  pendingBaselineChecks.push(
    isBelowPersonalBaseline,
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
       * 서버가 "졸림"이라고 판단했어도,
       * 이 사람/이 기기의 정상 기준선보다
       * 실제로 충분히 떨어진 경우에만
       * 진짜 졸음으로 인정합니다.
       * (기기별 EAR 절대값 차이로 인한
       *  오탐지를 한 번 더 걸러내기 위함)
       *
       * "지금 이 순간"이 아니라, 이 응답이
       * 어떤 요청에 대한 것인지 큐에서 꺼내
       * 그때 당시의 판정을 사용합니다.
       */
      const wasBelowBaselineAtSendTime =
        pendingBaselineChecks.length >
        0
          ? pendingBaselineChecks.shift()
          : isBelowPersonalBaseline;

      const rawIsDrowsy =
        isDrowsyStatus(
          result.status,
        ) &&
        wasBelowBaselineAtSendTime;

      const now = Date.now();

      if (rawIsDrowsy) {
        if (!drowsyStreakStartedAt) {
          drowsyStreakStartedAt =
            now;
        }

        normalStreakStartedAt =
          null;
      } else {
        if (!normalStreakStartedAt) {
          normalStreakStartedAt =
            now;
        }

        drowsyStreakStartedAt =
          null;
      }

      const drowsyStreakDuration =
        drowsyStreakStartedAt
          ? now -
            drowsyStreakStartedAt
          : 0;

      const normalStreakDuration =
        normalStreakStartedAt
          ? now -
            normalStreakStartedAt
          : 0;

      const confirmedIsDrowsy =
        drowsyStreakDuration >=
        DROWSY_CONFIRM_DURATION_MS
          ? true
          : normalStreakDuration >=
              DROWSY_CONFIRM_DURATION_MS
            ? false
            : lastKnownIsDrowsy;

      if (
        confirmedIsDrowsy !==
        lastKnownIsDrowsy
      ) {
        lastKnownIsDrowsy =
          confirmedIsDrowsy;

        callbacks.onDrowsyChange(
          confirmedIsDrowsy,
        );
      }
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