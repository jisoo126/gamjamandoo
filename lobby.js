import { db } from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const welcome = document.getElementById("welcome");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomCodeInput = document.getElementById("roomCodeInput");

const nickname = localStorage.getItem("currentNickname");

welcome.innerText = `${nickname}님 환영합니다!`;

function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
}

async function createUniqueRoomCode() {
  let code;
  let exists = true;

  while (exists) {
    code = generateRoomCode();

    const roomRef = doc(db, "rooms", code);
    const snapshot = await getDoc(roomRef);

    if (!snapshot.exists()) {
      exists = false;
    }
  }

  return code;
}

createRoomBtn.addEventListener("click", async () => {
  const roomCode = await createUniqueRoomCode();

  await setDoc(doc(db, "rooms", roomCode), {
    host: nickname,
    createdAt: serverTimestamp(),
    members: [nickname]
  });

  localStorage.setItem("currentRoomCode", roomCode);

  alert(`방 생성 완료! 코드: ${roomCode}`);

  location.href = "room.html";
});

joinRoomBtn.addEventListener("click", async () => {
  const roomCode = roomCodeInput.value.trim().toUpperCase();

  if (!roomCode) {
    alert("방 코드를 입력해!");
    return;
  }

  const roomRef = doc(db, "rooms", roomCode);
  const snapshot = await getDoc(roomRef);

  if (!snapshot.exists()) {
    alert("존재하지 않는 방이야!");
    return;
  }

  await updateDoc(roomRef, {
    members: arrayUnion(nickname)
  });

  localStorage.setItem("currentRoomCode", roomCode);

  location.href = "room.html";
});