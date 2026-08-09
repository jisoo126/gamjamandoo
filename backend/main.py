from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import json

app = FastAPI()

@app.get("/")
def health_check():
    return {"status": "EAR 서버가 살아있어요"}

@app.websocket("/ws/ear")
async def ear_websocket(websocket: WebSocket):
    await websocket.accept()
    print("🔌 프론트엔드 연결됨!")

    try:
        while True:
            raw_message = await websocket.receive_text()
            data = json.loads(raw_message)

            nickname = data.get("nickname")
            room_name = data.get("room_name")
            ear = data.get("ear")

            print(f"📩 받은 데이터 - 닉네임: {nickname}, 방: {room_name}, EAR: {ear}")

            # 임시 분석 로직 (EAR < 0.2 시 drowsy)
            if ear is not None and ear < 0.2:
                status = "drowsy"
            else:
                status = "focused"

            response = {
                "ear": ear,
                "status": status,
            }

            await websocket.send_text(json.dumps(response))

    except WebSocketDisconnect:
        print("👋 프론트엔드 연결이 끊어졌습니다.")