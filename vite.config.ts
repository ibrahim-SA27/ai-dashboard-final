import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { WebSocketServer } from "ws";
import { realtimeBroadcaster } from "./src/lib/realtime-broadcaster";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        name: "scada-realtime-websocket",
        configureServer(server) {
          if (server.httpServer) {
            const wss = new WebSocketServer({ noServer: true });
            realtimeBroadcaster.setWebSocketServer(wss);

            server.httpServer.on("upgrade", (req, socket, head) => {
              const pathname = req.url?.split("?")[0] || "";
              if (pathname === "/ws/realtime") {
                wss.handleUpgrade(req, socket, head, (ws) => {
                  wss.emit("connection", ws, req);
                });
              }
            });

            console.info("[SCADA WebSocket]: Live stream attached to /ws/realtime");
          }
        },
      },
    ],
  },
});
