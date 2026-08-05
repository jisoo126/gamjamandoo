import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { AccessToken } from "livekit-server-sdk";

dotenv.config();

const app = express();
const PORT = 8000;

app.use(cors({
  origin: "http://localhost:5173",
}));

app.use(express.json());

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