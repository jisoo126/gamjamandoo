import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { AccessToken } from "livekit-server-sdk";
import {
  findUserByNickname,
  createUser,
} from "./userStore.js";

dotenv.config();

const app = express();
/*
 * Render 같은 클라우드 배포 환경은 PORT를 환경변수로
 * 직접 지정해줍니다. 로컬에서 그냥 실행할 땐
 * 환경변수가 없으니 8000번을 기본값으로 씁니다.
 */
const PORT = process.env.PORT || 8000;

/*
 * 발표/데모 상황: 이 서버를 켠 컴퓨터의 IP로
 * 팀원들이 여러 기기에서 접속하기 때문에,
 * 어떤 주소에서 오는 요청이든 허용합니다.
 * (실제 서비스 배포 시에는 정확한 도메인으로 제한해야 합니다)
 */
app.use(cors());

app.use(express.json());

/*
 * 회원가입
 * 비밀번호는 절대 그대로 저장하지 않고,
 * bcrypt로 해시한 값만 저장합니다.
 */
app.post("/signup", async (req, res) => {
  try {
    const { nickname, password, passwordConfirm } =
      req.body;

    if (!nickname || nickname.length < 2) {
      return res.status(400).json({
        detail: "닉네임은 두 글자 이상 입력해 주세요.",
      });
    }

    if (!password || password.length < 4) {
      return res.status(400).json({
        detail: "비밀번호는 네 글자 이상 입력해 주세요.",
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({
        detail: "비밀번호가 서로 다릅니다.",
      });
    }

    const existingUser =
      findUserByNickname(nickname);

    if (existingUser) {
      return res.status(409).json({
        detail: "이미 사용 중인 닉네임입니다.",
      });
    }

    const passwordHash =
      await bcrypt.hash(password, 10);

    createUser({
      nickname,
      passwordHash,
    });

    return res.json({
      nickname,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      detail: "회원가입 처리에 실패했습니다.",
    });
  }
});

/*
 * 로그인
 * 저장된 해시와 입력된 비밀번호를 bcrypt로 비교합니다.
 */
app.post("/login", async (req, res) => {
  try {
    const { nickname, password } = req.body;

    if (!nickname || !password) {
      return res.status(400).json({
        detail: "닉네임과 비밀번호를 모두 입력해 주세요.",
      });
    }

    const user = findUserByNickname(nickname);

    if (!user) {
      return res.status(401).json({
        detail: "닉네임 또는 비밀번호가 맞지 않습니다.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      return res.status(401).json({
        detail: "닉네임 또는 비밀번호가 맞지 않습니다.",
      });
    }

    return res.json({
      nickname: user.nickname,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      detail: "로그인 처리에 실패했습니다.",
    });
  }
});

app.post("/token", async (req, res) => {
  try {
    const { room_name: roomName, participant_name: participantName } =
      req.body;

    if (!roomName || !participantName) {
      return res.status(400).json({
        detail: "방 코드와 닉네임을 모두 입력해 주세요.",
      });
    }

    const {
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
    } = process.env;

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return res.status(500).json({
        detail: "LiveKit 환경변수가 설정되지 않았습니다.",
      });
    }

    const identity =
      `${participantName}-${crypto.randomUUID().slice(0, 8)}`;

    const token = new AccessToken(
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      {
        identity,
        name: participantName,
      },
    );

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const participantToken = await token.toJwt();

    return res.json({
      server_url: LIVEKIT_URL,
      participant_token: participantToken,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      detail: "토큰을 생성하지 못했습니다.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`토큰 서버 실행: http://localhost:${PORT}`);
});