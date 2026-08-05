const USERS_STORAGE_KEY = "camstudy-users";
const SESSION_STORAGE_KEY = "camstudy-current-user";

export function getUsers() {
  try {
    const savedUsers = localStorage.getItem(
      USERS_STORAGE_KEY,
    );

    return savedUsers
      ? JSON.parse(savedUsers)
      : [];
  } catch (error) {
    console.error(
      "사용자 목록을 불러오지 못했습니다:",
      error,
    );

    return [];
  }
}

export function saveUsers(users) {
  localStorage.setItem(
    USERS_STORAGE_KEY,
    JSON.stringify(users),
  );
}

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