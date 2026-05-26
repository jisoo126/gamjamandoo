import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "네 기존 값",
  authDomain: "gamjamandoo-be74b.firebaseapp.com",
  projectId: "gamjamandoo-be74b",
  storageBucket: "gamjamandoo-be74b.firebasestorage.app",
  messagingSenderId: "763453007",
  appId: "네 기존 값"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };