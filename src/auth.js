import {
  getSavedSession,
  saveSession,
  removeSession,
} from "./storage.js";

export {
  getSavedSession,
  saveSession,
  removeSession,
};

/*
 * 회원가입/로그인 백엔드(server.js) 주소입니다.
 * Render에 배포된 주소를 직접 사용합니다.
 * → 이제 어느 컴퓨터에서 접속해도, 어느 기기에서 로그인해도
 *   같은 서버(같은 계정 데이터)를 바라봅니다.
 */
const API_BASE_URL = "https://aigamja.onrender.com";

/*
 * 회원가입
 * 실패해도 예외를 던지지 않고
 * { ok, message } 형태로 결과를 돌려줍니다.
 */
export async function signupUser({
  nickname,
  password,
  passwordConfirm,
}) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/signup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nickname,
          password,
          passwordConfirm,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        message:
          data.detail ??
          "회원가입에 실패했습니다.",
      };
    }

    return {
      ok: true,
      nickname: data.nickname,
    };
  } catch (error) {
    console.error(
      "회원가입 요청 실패:",
      error,
    );

    return {
      ok: false,
      message:
        "서버에 연결할 수 없습니다. 백엔드(server.js)가 켜져 있는지 확인해 주세요.",
    };
  }
}

/*
 * 로그인
 */
export async function validateLogin({
  nickname,
  password,
}) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nickname,
          password,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        message:
          data.detail ??
          "로그인에 실패했습니다.",
      };
    }

    return {
      ok: true,
      nickname: data.nickname,
    };
  } catch (error) {
    console.error(
      "로그인 요청 실패:",
      error,
    );

    return {
      ok: false,
      message:
        "서버에 연결할 수 없습니다. 백엔드(server.js)가 켜져 있는지 확인해 주세요.",
    };
  }
}
