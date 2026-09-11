import type { WebSocket, WebSocketServer } from "ws";

export interface RealtimeBroadcasterPayload {
  id: number;
  timestamp: string;
  ph: number;
  tds: number;
  turbidity: number;
  temperature: number;
  flow: number;
  flow_rate: number;
  pollution_score: number;
  status: "SAFE" | "WARNING" | "CRITICAL";
  valve_state?: "OPEN" | "CLOSED";
  relay_state?: "INACTIVE" | "ACTIVE";
  discharge_status?: "NORMAL" | "BLOCKED";
  [key: string]: unknown;
}

type SseClient = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

class RealtimeBroadcaster {
  private wsClients = new Set<WebSocket>();
  private sseClients = new Map<string, SseClient>();
  private latestPayload: RealtimeBroadcasterPayload | null = null;
  private wssInstance: WebSocketServer | null = null;

  public setWebSocketServer(wss: WebSocketServer) {
    this.wssInstance = wss;
    wss.on("connection", (ws: WebSocket) => {
      this.addWebSocketClient(ws);
    });
  }

  public getWebSocketServer(): WebSocketServer | null {
    return this.wssInstance;
  }

  public addWebSocketClient(ws: WebSocket) {
    this.wsClients.add(ws);

    // Send latest reading immediately upon connection
    if (this.latestPayload) {
      try {
        ws.send(JSON.stringify(this.latestPayload));
      } catch (err) {
        console.warn("[Broadcaster] Failed to send initial payload to WS client:", err);
      }
    }

    ws.on("message", (msg) => {
      try {
        const text = msg.toString();
        if (text === "ping") {
          ws.send("pong");
        }
      } catch {
        // ignore
      }
    });

    ws.on("close", () => {
      this.wsClients.delete(ws);
    });

    ws.on("error", () => {
      this.wsClients.delete(ws);
    });
  }

  public addSseClient(id: string, controller: ReadableStreamDefaultController<Uint8Array>) {
    this.sseClients.set(id, { id, controller });

    // Send initial snapshot
    if (this.latestPayload) {
      const data = `data: ${JSON.stringify(this.latestPayload)}\n\n`;
      try {
        controller.enqueue(new TextEncoder().encode(data));
      } catch {
        this.sseClients.delete(id);
      }
    }
  }

  public removeSseClient(id: string) {
    this.sseClients.delete(id);
  }

  public broadcast(payload: RealtimeBroadcasterPayload) {
    this.latestPayload = payload;
    const jsonString = JSON.stringify(payload);

    // 1. Broadcast to WebSocket clients
    for (const ws of this.wsClients) {
      if (ws.readyState === 1 /* WebSocket.OPEN */) {
        try {
          ws.send(jsonString);
        } catch {
          this.wsClients.delete(ws);
        }
      } else if (ws.readyState > 1) {
        this.wsClients.delete(ws);
      }
    }

    // 2. Broadcast to SSE clients
    const sseMessage = `data: ${jsonString}\n\n`;
    const sseEncoded = new TextEncoder().encode(sseMessage);
    for (const [id, client] of this.sseClients.entries()) {
      try {
        client.controller.enqueue(sseEncoded);
      } catch {
        this.sseClients.delete(id);
      }
    }
  }

  public getLatest(): RealtimeBroadcasterPayload | null {
    return this.latestPayload;
  }

  public getActiveClientCount(): { ws: number; sse: number } {
    return {
      ws: this.wsClients.size,
      sse: this.sseClients.size,
    };
  }
}

// Global singleton across Vite server and SSR bundles
const g = globalThis as unknown as { __scada_broadcaster?: RealtimeBroadcaster };
if (!g.__scada_broadcaster) {
  g.__scada_broadcaster = new RealtimeBroadcaster();
}
export const realtimeBroadcaster = g.__scada_broadcaster;
