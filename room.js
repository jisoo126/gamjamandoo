import { db } from "./firebase.js";

import {
  doc,
  onSnapshot,
  updateDoc,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const roomTitle = document.getElementById("roomTitle");
const memberList = document.getElementById("memberList");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const roomCode = localStorage.getItem("currentRoomCode");
const nickname = localStorage.getItem("currentNickname");

if (!roomCode || !nickname) {
  location.href = "lobby.html";
}

const roomRef = doc(db, "rooms", roomCode);

onSnapshot(roomRef, (snapshot) => {
  if (!snapshot.exists()) {
    alert("방이 없어졌어!");
    location.href = "lobby.html";
    return;
  }

  const data = snapshot.data();

  roomTitle.innerText = `스터디룸 (${roomCode})`;
  memberList.innerText = `참가자: ${data.members.join(", ")}`;
});

leaveRoomBtn.addEventListener("click", async () => {
  await updateDoc(roomRef, {
    members: arrayRemove(nickname)
  });

  localStorage.removeItem("currentRoomCode");

  location.href = "lobby.html";
});


