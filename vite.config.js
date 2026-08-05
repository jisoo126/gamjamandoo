import { defineConfig } from "vite";

export default defineConfig({
  server: {
    /*
     * true로 하면 localhost뿐 아니라
     * 같은 와이파이의 다른 기기(팀원 컴퓨터)에서도
     * 이 컴퓨터의 IP 주소로 접속할 수 있게 됩니다.
     */
    host: true,
    port: 5173,
  },
});
