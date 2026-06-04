import { db } from "./firebase.js";
import {
  doc,
  onSnapshot,
  updateDoc,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const roomCode = localStorage.getItem("currentRoomCode");
const nickname = localStorage.getItem("currentNickname");

if (!roomCode || !nickname) {
  location.href = "lobby.html";
}

const roomRef = doc(db, "rooms", roomCode);

const roomCodeText = document.getElementById("roomCodeText");
const previewVideo = document.getElementById("previewVideo");
const cameraStatus = document.getElementById("cameraStatus");
const startCamBtn = document.getElementById("startCamBtn");
const startStudyBtn = document.getElementById("startStudyBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const memberList = document.getElementById("memberList");

roomCodeText.innerText = roomCode;

let previewStream = null;

async function startPreviewCam() {
  try {
    previewStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    previewVideo.srcObject = previewStream;
    cameraStatus.innerText = "카메라 연결 완료";
  } catch (err) {
    console.error(err);
    cameraStatus.innerText = "카메라 권한을 허용해야 해!";
    alert("카메라 권한 허용해줘!");
  }
}

startCamBtn.addEventListener("click", startPreviewCam);

onSnapshot(roomRef, (snapshot) => {
  if (!snapshot.exists()) {
    alert("방이 사라졌어!");
    location.href = "lobby.html";
    return;
  }

  const data = snapshot.data();
  const members = data.members || [];

  memberList.innerHTML = members
    .map(member => `<div class="member-item">👤 ${member}</div>`)
    .join("");
});

startStudyBtn.addEventListener("click", () => {
  if (previewStream) {
    previewStream.getTracks().forEach(track => track.stop());
  }

  location.href = "study.html";
});

leaveRoomBtn.addEventListener("click", async () => {
  if (previewStream) {
    previewStream.getTracks().forEach(track => track.stop());
  }

  await updateDoc(roomRef, {
    members: arrayRemove(nickname)
  });

  localStorage.removeItem("currentRoomCode");
  location.href = "lobby.html";
});