import assert from "node:assert/strict";
import test from "node:test";

import { WebSocketPresenceTransport } from "../dist/internal/transport/websocket-presence-transport.js";

class FakeWebSocket {
  static instances = [];

  readyState = 0;
  sent = [];
  closeCode = null;
  onopen = null;
  onerror = null;
  onclose = null;

  constructor(url) {
    this.url = url.toString();
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  send(payload) {
    this.sent.push(payload);
  }

  close(code = 1000) {
    this.closeCode = code;
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

test("presence transport connects by public key and sends a heartbeat", () => {
  FakeWebSocket.instances = [];
  const presence = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    60_000,
    60_000,
  );

  presence.connect("Tg2wbdIU3C0JRfSX");
  const socket = FakeWebSocket.instances[0];
  const url = new URL(socket.url);
  assert.equal(url.protocol, "wss:");
  assert.equal(url.pathname, "/api/v1/client-auth/presence/ws");
  assert.equal(url.searchParams.get("public_key"), "Tg2wbdIU3C0JRfSX");

  socket.open();
  assert.deepEqual(socket.sent, [JSON.stringify({ type: "heartbeat" })]);

  presence.disconnect();
  assert.equal(socket.closeCode, 1000);
});
