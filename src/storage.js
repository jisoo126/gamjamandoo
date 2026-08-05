/*
 * 로그인 세션(현재 로그인한 닉네임)만
 * 브라우저에 저장합니다.
 *
 * 회원 목록(닉네임/비밀번호)은 더 이상 브라우저에
 * 저장하지 않고, 백엔드 서버(server.js)의
 * users.json에 해시된 형태로 저장됩니다.
 * (관련 코드: auth.js, server.js, userStore.js)
 */
const SESSION_STORAGE_KEY = "camstudy-current-user";

export function saveSession(nickname) {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    nickname,
  );
}

export function getSavedSession() {
  return localStorage.getItem(
    SESSION_STORAGE_KEY,
  );
}

export function removeSession() {
  localStorage.removeItem(
    SESSION_STORAGE_KEY,
  );
}
