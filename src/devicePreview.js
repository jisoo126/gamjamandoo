let previewStream = null;
let audioContext = null;
let analyser = null;
let microphoneSource = null;
let volumeAnimationId = null;

let cameraEnabled = true;
let microphoneEnabled = true;

let selectedCameraId = "";
let selectedMicrophoneId = "";

let callbacks = {
  onCameraStateChange: () => {},
  onMicrophoneStateChange: () => {},
  onVolumeChange: () => {},
  onDeviceListChange: () => {},
  onError: () => {},
};

/*
 * 카메라·마이크 미리보기를 시작합니다.
 *
 * videoElement:
 * 화면에 미리보기를 띄울 <video> 요소
 */
export async function startDevicePreview({
  videoElement,
  nextCallbacks = {},
}) {
  callbacks = {
    ...callbacks,
    ...nextCallbacks,
  };

  await stopDevicePreview();

  try {
    previewStream =
      await navigator.mediaDevices.getUserMedia({
        video: selectedCameraId
          ? {
              deviceId: {
                exact: selectedCameraId,
              },
            }
          : true,

        audio: selectedMicrophoneId
          ? {
              deviceId: {
                exact: selectedMicrophoneId,
              },
            }
          : true,
      });

    videoElement.srcObject =
      previewStream;

    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;

    await videoElement
      .play()
      .catch(() => {});

    cameraEnabled = true;
    microphoneEnabled = true;

    callbacks.onCameraStateChange(
      cameraEnabled,
    );

    callbacks.onMicrophoneStateChange(
      microphoneEnabled,
    );

    await refreshDeviceList();

    startMicrophoneVolumeAnalysis();
  } catch (error) {
    console.error(
      "카메라·마이크 미리보기 시작 실패:",
      error,
    );

    callbacks.onError(error);

    throw error;
  }
}

/*
 * 카메라 켜기/끄기
 */
export function togglePreviewCamera() {
  if (!previewStream) {
    return false;
  }

  cameraEnabled =
    !cameraEnabled;

  for (
    const track
    of previewStream.getVideoTracks()
  ) {
    track.enabled =
      cameraEnabled;
  }

  callbacks.onCameraStateChange(
    cameraEnabled,
  );

  return cameraEnabled;
}

/*
 * 마이크 켜기/끄기
 */
export function togglePreviewMicrophone() {
  if (!previewStream) {
    return false;
  }

  microphoneEnabled =
    !microphoneEnabled;

  for (
    const track
    of previewStream.getAudioTracks()
  ) {
    track.enabled =
      microphoneEnabled;
  }

  callbacks.onMicrophoneStateChange(
    microphoneEnabled,
  );

  return microphoneEnabled;
}

/*
 * 사용 가능한 카메라·마이크 목록을 불러옵니다.
 */
export async function refreshDeviceList() {
  const devices =
    await navigator.mediaDevices.enumerateDevices();

  const cameras =
    devices.filter(
      (device) =>
        device.kind === "videoinput",
    );

  const microphones =
    devices.filter(
      (device) =>
        device.kind === "audioinput",
    );

  if (
    !selectedCameraId &&
    cameras.length > 0
  ) {
    selectedCameraId =
      cameras[0].deviceId;
  }

  if (
    !selectedMicrophoneId &&
    microphones.length > 0
  ) {
    selectedMicrophoneId =
      microphones[0].deviceId;
  }

  callbacks.onDeviceListChange({
    cameras,
    microphones,
    selectedCameraId,
    selectedMicrophoneId,
  });

  return {
    cameras,
    microphones,
  };
}

/*
 * 카메라 변경
 */
export async function changePreviewCamera({
  deviceId,
  videoElement,
}) {
  selectedCameraId = deviceId;

  await restartPreview({
    videoElement,
  });
}

/*
 * 마이크 변경
 */
export async function changePreviewMicrophone({
  deviceId,
  videoElement,
}) {
  selectedMicrophoneId =
    deviceId;

  await restartPreview({
    videoElement,
  });
}

async function restartPreview({
  videoElement,
}) {
  const previousCameraState =
    cameraEnabled;

  const previousMicrophoneState =
    microphoneEnabled;

  await startDevicePreview({
    videoElement,
    nextCallbacks: callbacks,
  });

  if (!previousCameraState) {
    togglePreviewCamera();
  }

  if (!previousMicrophoneState) {
    togglePreviewMicrophone();
  }
}

/*
 * 마이크 음량을 분석해 0~100 값으로 전달합니다.
 */
function startMicrophoneVolumeAnalysis() {
  stopMicrophoneVolumeAnalysis();

  if (
    !previewStream ||
    previewStream.getAudioTracks()
      .length === 0
  ) {
    callbacks.onVolumeChange(0);
    return;
  }

  audioContext =
    new AudioContext();

  analyser =
    audioContext.createAnalyser();

  analyser.fftSize = 256;
  analyser.smoothingTimeConstant =
    0.82;

  microphoneSource =
    audioContext.createMediaStreamSource(
      previewStream,
    );

  microphoneSource.connect(
    analyser,
  );

  const dataArray =
    new Uint8Array(
      analyser.frequencyBinCount,
    );

  function updateVolume() {
    if (!analyser) {
      return;
    }

    analyser.getByteFrequencyData(
      dataArray,
    );

    const total =
      dataArray.reduce(
        (sum, value) =>
          sum + value,
        0,
      );

    const average =
      total /
      dataArray.length;

    const volume =
      microphoneEnabled
        ? Math.min(
            100,
            Math.round(
              average * 1.8,
            ),
          )
        : 0;

    callbacks.onVolumeChange(
      volume,
    );

    volumeAnimationId =
      requestAnimationFrame(
        updateVolume,
      );
  }

  updateVolume();
}

/*
 * 마이크 분석만 종료
 */
function stopMicrophoneVolumeAnalysis() {
  if (volumeAnimationId) {
    cancelAnimationFrame(
      volumeAnimationId,
    );

    volumeAnimationId = null;
  }

  if (microphoneSource) {
    microphoneSource.disconnect();

    microphoneSource = null;
  }

  if (audioContext) {
    audioContext.close().catch(
      () => {},
    );

    audioContext = null;
  }

  analyser = null;

  callbacks.onVolumeChange(0);
}

/*
 * 프리뷰 스트림을 완전히 종료합니다.
 *
 * 실제 LiveKit 입장 직전에 반드시 호출해야
 * 카메라가 중복으로 잡히지 않습니다.
 */
export async function stopDevicePreview() {
  stopMicrophoneVolumeAnalysis();

  if (previewStream) {
    for (
      const track
      of previewStream.getTracks()
    ) {
      track.stop();
    }

    previewStream = null;
  }
}

/*
 * 실제 LiveKit 입장 시
 * 카메라·마이크 초기 상태를 전달합니다.
 */
export function getPreviewSettings() {
  return {
    cameraEnabled,
    microphoneEnabled,
    selectedCameraId,
    selectedMicrophoneId,
  };
}