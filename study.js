import { db } from "./firebase.js";
import {
  doc,
  collection,
  onSnapshot,
  updateDoc,
  arrayRemove,
  setDoc,
  getDoc,
  addDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const roomCode = localStorage.getItem("currentRoomCode");
const nickname = localStorage.getItem("currentNickname");

if (!roomCode || !nickname) {
  location.href = "lobby.html";
}

const roomRef = doc(db, "rooms", roomCode);
const myStatusRef = doc(db, "rooms", roomCode, "status", nickname);

const roomCodeText = document.getElementById("roomCodeText");
const videoGrid = document.getElementById("videoGrid");

const localVideo = document.getElementById("localVideo");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");

const myNameTag = document.getElementById("myNameTag");
const myStatusBadge = document.getElementById("myStatusBadge");

const studyTimer = document.getElementById("studyTimer");
const studyTimeText = document.getElementById("studyTime");
const focusTimeText = document.getElementById("focusTime");
const focusPercentText = document.getElementById("focusPercent");
const statusText = document.getElementById("statusText");
const drowsyCountText = document.getElementById("drowsyCount");
const earValueText = document.getElementById("earValue");
const memberStatusList = document.getElementById("memberStatusList");
const leaveStudyBtn = document.getElementById("leaveStudyBtn");

roomCodeText.innerText = roomCode;
myNameTag.innerText = `${nickname} (나)`;

/* =========================
   상태 변수
========================= */

let localStream = null;

let closedCount = 0;
let focusFrames = 0;
let totalFrames = 0;
let drowsyCount = 0;
let prevStatus = "FOCUS";

let currentStatus = "AWAY";
let currentEAR = 0;

let studySeconds = 0;
let focusSeconds = 0;

const peerConnections = {};
const remoteVideos = {};
const unsubscribes = [];

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

const doodle = new Image();
doodle.src = "./doodle.png";

doodle.onerror = () => {
  alert("doodle.png 파일을 못 찾았어! study.html이랑 같은 폴더에 넣어줘.");
};

/* =========================
   기본 함수
========================= */

function formatTime(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function distance(p1, p2) {
  return Math.sqrt(
    (p1.x - p2.x) ** 2 +
    (p1.y - p2.y) ** 2
  );
}

function calculateEAR(landmarks) {
  const left = landmarks[33];
  const right = landmarks[133];
  const top = landmarks[159];
  const bottom = landmarks[145];

  const horizontal = distance(left, right);
  const vertical = distance(top, bottom);

  if (horizontal === 0) return 0;
  return vertical / horizontal;
}

function resizeCanvas() {
  overlay.width = localVideo.videoWidth || 640;
  overlay.height = localVideo.videoHeight || 480;
}

function getFocusPercent() {
  return totalFrames > 0
    ? Math.floor((focusFrames / totalFrames) * 100)
    : 0;
}

function updateMyUI() {
  const focusPercent = getFocusPercent();

  let koreanStatus = "자리비움";
  let badgeClass = "status-badge away";

  if (currentStatus === "FOCUS") {
    koreanStatus = "집중중 😎";
    badgeClass = "status-badge focus";
  }

  if (currentStatus === "DROWSY") {
    koreanStatus = "졸음 😴";
    badgeClass = "status-badge drowsy";
  }

  myStatusBadge.innerText = koreanStatus;
  myStatusBadge.className = badgeClass;

  studyTimer.innerText = formatTime(studySeconds);
  studyTimeText.innerText = formatTime(studySeconds);
  focusTimeText.innerText = formatTime(focusSeconds);

  focusPercentText.innerText = `${focusPercent}%`;
  statusText.innerText = `상태 : ${koreanStatus}`;
  drowsyCountText.innerText = `${drowsyCount}회`;
  earValueText.innerText = currentEAR.toFixed(2);
}

async function updateMyStatusInFirebase() {
  await setDoc(myStatusRef, {
    nickname,
    status: currentStatus,
    studySeconds,
    focusSeconds,
    focusPercent: getFocusPercent(),
    drowsyCount,
    ear: currentEAR,
    updatedAt: Date.now()
  });
}

async function saveUserRecord() {
  const userRef = doc(db, "users", nickname);

  await setDoc(
    userRef,
    {
      nickname,
      studySeconds,
      focusSeconds,
      drowsyCount,
      focusPercent: getFocusPercent(),
      lastUpdated: Date.now()
    },
    { merge: true }
  );
}

/* =========================
   졸음 감지
========================= */

const faceMesh = new FaceMesh({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults((results) => {
  resizeCanvas();
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  let status = "AWAY";
  let ear = 0;

  totalFrames++;

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

    ear = calculateEAR(landmarks);
    currentEAR = ear;

    if (ear < 0.20) {
      closedCount++;
    } else {
      closedCount = 0;
    }

    if (closedCount > 40) {
      status = "DROWSY";

      if (prevStatus !== "DROWSY") {
        drowsyCount++;
      }

      const nose = landmarks[1];
      const size = overlay.width * 0.2;

      if (doodle.complete) {
        ctx.drawImage(
          doodle,
          nose.x * overlay.width - size / 2,
          nose.y * overlay.height - size / 2,
          size,
          size
        );
      }

    } else {
      status = "FOCUS";
      focusFrames++;
    }

  } else {
    closedCount = 0;
    currentEAR = 0;
    status = "AWAY";
  }

  prevStatus = status;
  currentStatus = status;

  updateMyUI();
});

async function detectLoop() {
  if (!localVideo.srcObject) return;

  try {
    await faceMesh.send({ image: localVideo });
  } catch (err) {
    console.error("FaceMesh error:", err);
  }

  requestAnimationFrame(detectLoop);
}

/* =========================
   내 캠 시작
========================= */

async function startLocalCam() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 1280,
        height: 720
      },
      audio: false
    });

    localVideo.srcObject = localStream;

    localVideo.onloadedmetadata = async () => {
      await localVideo.play();
      resizeCanvas();
      detectLoop();
      setupMemberWatcher();
    };

  } catch (err) {
    console.error(err);
    alert("카메라 권한 허용해줘!");
  }
}

/* =========================
   시간 계산
========================= */

setInterval(async () => {
  studySeconds++;

  if (currentStatus === "FOCUS") {
    focusSeconds++;
  }

  updateMyUI();
  await updateMyStatusInFirebase();
}, 1000);

/* =========================
   멤버 상태 표시
========================= */

onSnapshot(collection(db, "rooms", roomCode, "status"), (snapshot) => {
  let html = "";

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    let icon = "⚪";
    let text = "자리비움";

    if (data.status === "FOCUS") {
      icon = "🟢";
      text = "집중중";
    }

    if (data.status === "DROWSY") {
      icon = "🔴";
      text = "졸음";
    }

    html += `
      <div class="member-status-item">
        <span>${icon} ${data.nickname} - ${text}</span>
        <span>${data.focusPercent || 0}%</span>
      </div>
    `;

    const remote = remoteVideos[data.nickname];

    if (remote && remote.doodleImg) {

      if (data.status === "DROWSY") {
        remote.doodleImg.style.display = "block";
      } else {
        remote.doodleImg.style.display = "none";
      }

    }


  });

  memberStatusList.innerHTML = html || "아직 상태 정보가 없어!";
});

/* =========================
   WebRTC
========================= */

function getPairId(name1, name2) {
  return [name1, name2].sort().join("__");
}

function createRemoteVideoCard(otherName) {
  if (remoteVideos[otherName]) return remoteVideos[otherName];

  const card = document.createElement("div");
  card.className = "video-card";
  card.id = `card-${otherName}`;

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;

  const badge = document.createElement("div");
  badge.className = "status-badge away";
  badge.innerText = "연결중";

  const nameTag = document.createElement("div");
  nameTag.className = "name-tag";
  nameTag.innerText = otherName;

  const doodleImg = document.createElement("img");
  doodleImg.src = "./doodle.png";
  doodleImg.className = "remote-doodle";
  doodleImg.style.display = "none";

  card.appendChild(video);
  card.appendChild(doodleImg);
  card.appendChild(badge);
  card.appendChild(nameTag);

  videoGrid.appendChild(card);

  remoteVideos[otherName] = {
    card,
    video,
    badge,
    doodleImg
  };

  return remoteVideos[otherName];
}

function createPeerConnection(otherName) {
  const pc = new RTCPeerConnection(servers);

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    const remote = createRemoteVideoCard(otherName);

    if (!remote.video.srcObject) {
      remote.video.srcObject = event.streams[0];
    }

    remote.badge.innerText = "연결됨";
    remote.badge.className = "status-badge focus";
  };

  peerConnections[otherName] = pc;
  return pc;
}

async function setupWebRTCWith(otherName) {
  if (otherName === nickname) return;
  if (peerConnections[otherName]) return;
  if (!localStream) return;

  createRemoteVideoCard(otherName);

  const pairId = getPairId(nickname, otherName);
  const callRef = doc(db, "rooms", roomCode, "calls", pairId);
  const offerCandidatesRef = collection(callRef, "offerCandidates");
  const answerCandidatesRef = collection(callRef, "answerCandidates");

  const pc = createPeerConnection(otherName);

  const sortedNames = [nickname, otherName].sort();
  const isCaller = nickname === sortedNames[0];

  pc.onicecandidate = async (event) => {
    if (!event.candidate) return;

    if (isCaller) {
      await addDoc(offerCandidatesRef, event.candidate.toJSON());
    } else {
      await addDoc(answerCandidatesRef, event.candidate.toJSON());
    }
  };

  if (isCaller) {
    const callSnap = await getDoc(callRef);

    if (!callSnap.exists()) {
      await setDoc(callRef, {
        caller: nickname,
        callee: otherName,
        createdAt: Date.now()
      });
    }

    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    await updateDoc(callRef, {
      offer: {
        type: offerDescription.type,
        sdp: offerDescription.sdp
      }
    });

    const unsubAnswer = onSnapshot(callRef, async (snapshot) => {
      const data = snapshot.data();

      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        await pc.setRemoteDescription(answerDescription);
      }
    });

    const unsubAnswerCandidates = onSnapshot(answerCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          await pc.addIceCandidate(candidate);
        }
      });
    });

    unsubscribes.push(unsubAnswer, unsubAnswerCandidates);

  } else {
    const unsubOffer = onSnapshot(callRef, async (snapshot) => {
      const data = snapshot.data();

      if (!data?.offer) return;
      if (pc.currentRemoteDescription) return;

      const offerDescription = new RTCSessionDescription(data.offer);
      await pc.setRemoteDescription(offerDescription);

      const answerDescription = await pc.createAnswer();
      await pc.setLocalDescription(answerDescription);

      await updateDoc(callRef, {
        answer: {
          type: answerDescription.type,
          sdp: answerDescription.sdp
        }
      });
    });

    const unsubOfferCandidates = onSnapshot(offerCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          await pc.addIceCandidate(candidate);
        }
      });
    });

    unsubscribes.push(unsubOffer, unsubOfferCandidates);
  }
}

function setupMemberWatcher() {
  const unsubRoom = onSnapshot(roomRef, async (snapshot) => {
    if (!snapshot.exists()) {
      alert("방이 없어졌어!");
      location.href = "lobby.html";
      return;
    }

    const data = snapshot.data();
    const members = data.members || [];

    for (const member of members) {
      if (member !== nickname) {
        await setupWebRTCWith(member);
      }
    }
  });

  unsubscribes.push(unsubRoom);
}

/* =========================
   나가기
========================= */

leaveStudyBtn.addEventListener("click", async () => {
  await saveUserRecord();

  unsubscribes.forEach((unsub) => unsub());
  
  Object.values(peerConnections).forEach((pc) => {
    pc.close();
  });

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }

  await deleteDoc(myStatusRef);

  await updateDoc(roomRef, {
    members: arrayRemove(nickname)
  });

  localStorage.removeItem("currentRoomCode");

  location.href = "lobby.html";
});

/* =========================
   시작
========================= */

await startLocalCam();
await updateMyStatusInFirebase();