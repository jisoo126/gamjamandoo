import { db } from "./firebase.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginBtn = document.getElementById("loginBtn");

loginBtn.addEventListener("click", async () => {
  const nickname = document.getElementById("nickname").value.trim();
  const password = document.getElementById("password").value;

  if (!nickname || !password) {
    alert("다 입력해줘!");
    return;
  }

  const q = query(
    collection(db, "users"),
    where("nickname", "==", nickname),
    where("password", "==", password)
  );

  const result = await getDocs(q);

  if (result.empty) {
    alert("로그인 실패!");
    return;
  }

  let userId = "";

  result.forEach((doc) => {
    userId = doc.id;
  });

  localStorage.setItem("currentUserId", userId);
  localStorage.setItem("currentNickname", nickname);

  alert("로그인 성공!");
  location.href = "lobby.html";
});