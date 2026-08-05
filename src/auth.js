import {
    getUsers,
    saveUsers,
    getSavedSession,
    saveSession,
    removeSession,
  } from "./storage.js";
  
  export {
    getSavedSession,
    saveSession,
    removeSession,
  };
  
  export function signupUser({
    nickname,
    password,
    passwordConfirm,
  }) {
    if (nickname.length < 2) {
      return {
        ok: false,
        message: "닉네임은 두 글자 이상 입력해 주세요.",
      };
    }
  
    if (password.length < 4) {
      return {
        ok: false,
        message: "비밀번호는 네 글자 이상 입력해 주세요.",
      };
    }
  
    if (password !== passwordConfirm) {
      return {
        ok: false,
        message: "비밀번호가 서로 다릅니다.",
      };
    }
  
    const users = getUsers();
  
    const duplicateUser = users.some(
      (user) => user.nickname === nickname,
    );
  
    if (duplicateUser) {
      return {
        ok: false,
        message: "이미 사용 중인 닉네임입니다.",
      };
    }
  
    users.push({
      nickname,
      password,
    });
  
    saveUsers(users);
  
    return {
      ok: true,
      nickname,
    };
  }
  
  export function validateLogin({
    nickname,
    password,
  }) {
    const users = getUsers();
  
    const matchedUser = users.find(
      (user) =>
        user.nickname === nickname &&
        user.password === password,
    );
  
    if (!matchedUser) {
      return {
        ok: false,
        message: "닉네임 또는 비밀번호가 맞지 않습니다.",
      };
    }
  
    return {
      ok: true,
      nickname: matchedUser.nickname,
    };
  }