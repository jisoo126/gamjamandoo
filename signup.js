import { db } from "./firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const signupBtn = document.getElementById("signupBtn");

signupBtn.addEventListener("click", async () => {
  const nickname = document.getElementById("nickname").value.trim();
  const password = document.getElementById("password").value;
  const passwordCheck = document.getElementById("passwordCheck").value;

  if (!nickname || !password || !passwordCheck) {
    alert("다 입력해줘!");
    return;
  }

  if (password !== passwordCheck) {
    alert("비밀번호가 달라!");
    return;
  }

  const q = query(
    collection(db, "users"),
    where("nickname", "==", nickname)
  );

  const result = await getDocs(q);

  if (!result.empty) {
    alert("이미 있는 닉네임이야!");
    return;
  }

  await addDoc(collection(db, "users"), {
    nickname: nickname,
    password: password,
    totalStudyTime: 0,
    createdAt: serverTimestamp()
  });

  alert("회원가입 완료!");
  location.href = "login.html";
});