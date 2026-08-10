import admin from "firebase-admin";

/*
 * Firebase 서비스 계정 키를 환경변수(base64로 인코딩된 값)에서
 * 읽어와 초기화합니다.
 *
 * Render/로컬 .env에 FIREBASE_SERVICE_ACCOUNT_BASE64 값을
 * 설정해야 합니다. (설정 방법은 별도 안내 참고)
 */
function initializeFirebase() {
  if (admin.apps.length > 0) {
    return;
  }

  const base64Key =
    process.env
      .FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!base64Key) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 환경변수가 설정되지 않았습니다.",
    );
  }

  const decoded = Buffer.from(
    base64Key,
    "base64",
  ).toString("utf-8");

  const serviceAccount =
    JSON.parse(decoded);

  admin.initializeApp({
    credential:
      admin.credential.cert(
        serviceAccount,
      ),
  });
}

initializeFirebase();

const db = admin.firestore();

/*
 * "users" 컬렉션에, 닉네임을 문서 ID로 사용합니다.
 * (닉네임 중복 가입이 자동으로 막히는 효과도 있습니다)
 */
const usersCollection =
  db.collection("users");

/*
 * 닉네임으로 회원을 찾습니다.
 */
export async function findUserByNickname(
  nickname,
) {
  const doc = await usersCollection
    .doc(nickname)
    .get();

  if (!doc.exists) {
    return null;
  }

  return {
    nickname,
    ...doc.data(),
  };
}

/*
 * 새 회원을 저장합니다.
 * passwordHash는 이미 bcrypt로 해시된 값이어야 합니다.
 */
export async function createUser({
  nickname,
  passwordHash,
}) {
  await usersCollection
    .doc(nickname)
    .set({
      passwordHash,
      createdAt: Date.now(),
    });
}