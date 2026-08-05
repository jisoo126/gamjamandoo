import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(
  fileURLToPath(import.meta.url),
);

/*
 * 회원 정보를 저장하는 JSON 파일 경로입니다.
 * .gitignore에 반드시 추가해서 저장소에 올라가지 않게 하세요.
 */
const USERS_FILE = path.join(
  __dirname,
  "users.json",
);

/*
 * 파일이 없으면 빈 배열로 시작합니다.
 */
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(
      USERS_FILE,
      "utf-8",
    );

    return JSON.parse(raw);
  } catch (error) {
    console.error(
      "users.json 읽기 실패:",
      error,
    );

    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(users, null, 2),
    "utf-8",
  );
}

/*
 * 닉네임으로 회원을 찾습니다.
 * (비밀번호 해시가 포함된 원본 레코드를 반환하므로
 *  이 함수의 반환값을 그대로 프론트엔드에 보내면 안 됩니다.)
 */
export function findUserByNickname(nickname) {
  const users = readUsers();

  return users.find(
    (user) => user.nickname === nickname,
  );
}

/*
 * 새 회원을 저장합니다.
 * passwordHash는 이미 bcrypt로 해시된 값이어야 합니다.
 */
export function createUser({
  nickname,
  passwordHash,
}) {
  const users = readUsers();

  users.push({
    nickname,
    passwordHash,
    createdAt: Date.now(),
  });

  writeUsers(users);
}
