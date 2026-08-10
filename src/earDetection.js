/*
 * @mediapipe/face_mesh는 정식 ES 모듈이 아니라서
 * import로 가져오면 "Importing binding name 'default'
 * cannot be resolved by star export entries" 에러가 납니다.
 * index.html에서 <script> 태그로 불러온 전역
 * window.FaceMesh를 그대로 사용합니다.
 */
const { FaceMesh } = window;

/*
 * LiveKit 영상 분석 상태
 */
let faceMesh = null;
let analysisFrameId = null;
let activeVideoElement = null;
let isProcessingFrame = false;

/*
 * 1번 주자 원본:
 * 두 점 사이의 거리를 구하는 수학 함수
 */
function getDistance(p1, p2) {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2),
  );
}

/*
 * 1번 주자 원본:
 * 눈 감김 비율(EAR) 계산 함수
 */
function calculateEAR(
  landmarks,
  eyeIndices,
) {
  /*
   * eyeIndices:
   * [
   *   top1,
   *   bottom1,
   *   top2,
   *   bottom2,
   *   left,
   *   right
   * ]
   */
  const p2_p6 = getDistance(
    landmarks[eyeIndices[0]],
    landmarks[eyeIndices[1]],
  );

  const p3_p5 = getDistance(
    landmarks[eyeIndices[2]],
    landmarks[eyeIndices[3]],
  );

  const p1_p4 = getDistance(
    landmarks[eyeIndices[4]],
    landmarks[eyeIndices[5]],
  );

  /*
   * 1번 주자 원본 EAR 공식
   */
  const ear =
    (p2_p6 + p3_p5) /
    (2.0 * p1_p4);

  return ear;
}

/*
 * 1번 주자 원본 눈 랜드마크 번호
 */
const LEFT_EYE = [
  385,
  380,
  387,
  373,
  362,
  263,
];

const RIGHT_EYE = [
  160,
  144,
  158,
  153,
  33,
  133,
];

/*
 * FaceMesh를 한 번만 생성합니다.
 */
function createFaceMesh() {
  const instance = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });

  /*
   * 1번 주자 원본 옵션 유지
   */
  instance.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  /*
   * 1번 주자 원본 onResults 흐름 유지
   */
  instance.onResults((results) => {
    if (
      results.multiFaceLandmarks &&
      results.multiFaceLandmarks[0]
    ) {
      const landmarks =
        results.multiFaceLandmarks[0];

      /*
       * 양쪽 눈 EAR 계산 후 평균
       * 1번 주자 원본 계산 방식 유지
       */
      const leftEAR = calculateEAR(
        landmarks,
        LEFT_EYE,
      );

      const rightEAR = calculateEAR(
        landmarks,
        RIGHT_EYE,
      );

      const avgEAR =
        (leftEAR + rightEAR) /
        2.0;

      console.log(
        `[EAR 분석 데이터] 현재 수치: ${avgEAR.toFixed(3)}`,
      );

      /*
       * 1번 주자의 테스트 기준 유지
       */
      const status =
        avgEAR < 0.18
          ? "drowsy"
          : "focused";

      /*
       * 2번 주자의 WebSocket 통로로 전달
       */
      if (
        typeof window.sendEarValue ===
        "function"
      ) {
        window.sendEarValue(
          avgEAR,
        );
      } else {
        console.warn(
          "window.sendEarValue 함수가 아직 준비되지 않았습니다.",
        );
      }

      /*
       * 알감자 캐릭터가 얼굴 위치를 따라다니도록,
       * 이마 중앙 지점(랜드마크 10번)을 좌표로 보냅니다.
       * MediaPipe 랜드마크는 이미 0~1 사이로
       * 정규화돼 있어서 그대로 %로 쓸 수 있습니다.
       */
      const foreheadPoint =
        landmarks[10];

      if (
        foreheadPoint &&
        typeof window.sendFacePosition ===
          "function"
      ) {
        window.sendFacePosition({
          x: foreheadPoint.x,
          y: foreheadPoint.y,
        });
      }

      /*
       * 다른 화면 코드에서도 상태를 확인할 수 있도록
       * 이벤트를 발생시킵니다.
       */
      window.dispatchEvent(
        new CustomEvent(
          "camstudy-ear-result",
          {
            detail: {
              ear: avgEAR,
              status,
              timestamp:
                Date.now(),
            },
          },
        ),
      );
    }
  });

  return instance;
}

/*
 * LiveKit이 만든 video 요소를 받아
 * EAR 분석을 시작합니다.
 */
export async function startEarDetection(
  videoElement,
) {
  if (
    !videoElement ||
    !(videoElement instanceof HTMLVideoElement)
  ) {
    throw new Error(
      "EAR 분석에 사용할 video 요소가 올바르지 않습니다.",
    );
  }

  /*
   * 이전 분석이 실행 중이면 종료
   */
  stopEarDetection();

  activeVideoElement =
    videoElement;

  if (!faceMesh) {
    faceMesh =
      createFaceMesh();
  }

  /*
   * 영상 데이터가 아직 준비되지 않았다면 대기
   */
  if (
    activeVideoElement.readyState < 2
  ) {
    await new Promise(
      (resolve) => {
        activeVideoElement.addEventListener(
          "loadeddata",
          resolve,
          {
            once: true,
          },
        );
      },
    );
  }

  /*
   * LiveKit 영상 프레임을
   * FaceMesh로 반복 전송합니다.
   */
  async function detectFrame() {
    if (
      !activeVideoElement
    ) {
      return;
    }

    if (
      activeVideoElement.readyState >= 2 &&
      !activeVideoElement.paused &&
      !activeVideoElement.ended &&
      !isProcessingFrame
    ) {
      isProcessingFrame =
        true;

      try {
        await faceMesh.send({
          image:
            activeVideoElement,
        });
      } catch (error) {
        console.error(
          "FaceMesh 프레임 분석 실패:",
          error,
        );
      } finally {
        isProcessingFrame =
          false;
      }
    }

    analysisFrameId =
      requestAnimationFrame(
        detectFrame,
      );
  }

  detectFrame();

  console.log(
    "LiveKit 영상 EAR 분석 시작",
  );
}

/*
 * 방을 나가거나 카메라 영상이 바뀔 때
 * 분석 반복을 종료합니다.
 */
export function stopEarDetection() {
  if (analysisFrameId) {
    cancelAnimationFrame(
      analysisFrameId,
    );

    analysisFrameId = null;
  }

  activeVideoElement = null;
  isProcessingFrame = false;

  console.log(
    "EAR 분석 종료",
  );
}