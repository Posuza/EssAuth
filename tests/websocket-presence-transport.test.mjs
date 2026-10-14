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
  onmessage = null;

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

  receive(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  close(code = 1000) {
    this.closeCode = code;
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

class FakeLockManager {
  holders = new Set();
  queues = new Map();

  request(name, options, callback) {
    return new Promise((resolve, reject) => {
      const entry = { callback, reject, resolve, started: false };
      const queue = this.queues.get(name) ?? [];
      queue.push(entry);
      this.queues.set(name, queue);

      options.signal.addEventListener("abort", () => {
        if (entry.started) return;
        const waiting = this.queues.get(name) ?? [];
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        reject(new DOMException("Lock request aborted", "AbortError"));
      }, { once: true });

      this.#drain(name);
    });
  }

  #drain(name) {
    if (this.holders.has(name)) return;
    const entry = this.queues.get(name)?.shift();
    if (!entry) return;
    entry.started = true;
    this.holders.add(name);
    Promise.resolve(entry.callback()).then(
      () => entry.resolve(),
      (error) => entry.reject(error),
    ).finally(() => {
      this.holders.delete(name);
      this.#drain(name);
    });
  }
}

test("presence transport connects after authentication with user and device identity", () => {
  FakeWebSocket.instances = [];
  const presence = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    60_000,
    60_000,
  );

  presence.connect({
    publicKey: "Tg2wbdIU3C0JRfSX",
    employeeId: "680708",
    deviceId: "device_test_1234",
  });
  const socket = FakeWebSocket.instances[0];
  const url = new URL(socket.url);
  assert.equal(url.protocol, "wss:");
  assert.equal(url.pathname, "/api/v1/client-auth/presence/ws");
  assert.equal(url.searchParams.get("public_key"), "Tg2wbdIU3C0JRfSX");
  assert.equal(url.searchParams.get("employee_id"), "680708");
  assert.equal(url.searchParams.get("device_id"), "device_test_1234");

  socket.open();
  assert.deepEqual(socket.sent, [JSON.stringify({
    type: "heartbeat",
    employee_id: "680708",
    device_id: "device_test_1234",
  })]);

  presence.disconnect();
  assert.equal(socket.closeCode, 1000);
});

test("presence heartbeat includes coordinates when browser location is available", () => {
  FakeWebSocket.instances = [];
  let clearedWatchId = null;
  const geolocation = {
    watchPosition(success) {
      success({ coords: { latitude: 13.7563, longitude: 100.5018 } });
      return 7;
    },
    clearWatch(watchId) {
      clearedWatchId = watchId;
    },
  };
  const presence = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    60_000,
    60_000,
    null,
    geolocation,
  );

  presence.connect({
    publicKey: "Tg2wbdIU3C0JRfSX",
    employeeId: "680708",
    deviceId: "device_test_1234",
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();

  assert.deepEqual(JSON.parse(socket.sent[0]), {
    type: "heartbeat",
    employee_id: "680708",
    device_id: "device_test_1234",
    latitude: 13.7563,
    longitude: 100.5018,
  });
  presence.disconnect();
  assert.equal(clearedWatchId, 7);
});

test("presence connects when browser location startup throws", () => {
  FakeWebSocket.instances = [];
  const geolocation = {
    watchPosition() {
      throw new DOMException("Location blocked", "SecurityError");
    },
    clearWatch() {},
  };
  const presence = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    60_000,
    60_000,
    null,
    geolocation,
  );

  presence.connect({
    publicKey: "Tg2wbdIU3C0JRfSX",
    employeeId: "680708",
    deviceId: "device_test_1234",
  });

  assert.equal(FakeWebSocket.instances.length, 1);
  presence.disconnect();
});

test("presence remains connected while the client tab is hidden", (context) => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  context.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete globalThis.document;
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { visibilityState: "hidden" },
  });

  FakeWebSocket.instances = [];
  const presence = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    60_000,
    60_000,
    null,
    null,
  );

  presence.connect({
    publicKey: "Tg2wbdIU3C0JRfSX",
    employeeId: "680708",
    deviceId: "device_test_1234",
  });

  assert.equal(FakeWebSocket.instances.length, 1);
  presence.disconnect();
});

test("tabs sharing one identity elect a single presence connection", async () => {
  FakeWebSocket.instances = [];
  const locks = new FakeLockManager();
  const first = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    60_000,
    60_000,
    locks,
  );
  const second = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    60_000,
    60_000,
    locks,
  );
  const identity = {
    publicKey: "Tg2wbdIU3C0JRfSX",
    employeeId: "680708",
    deviceId: "device_test_1234",
  };

  first.connect(identity);
  second.connect(identity);
  assert.equal(FakeWebSocket.instances.length, 1);

  first.disconnect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(FakeWebSocket.instances.length, 2);

  second.disconnect();
});

test("presence transport does not retry a policy-rejected identity", async () => {
  FakeWebSocket.instances = [];
  const presence = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    60_000,
    1,
    null,
  );

  presence.connect({
    publicKey: "Tg2wbdIU3C0JRfSX",
    employeeId: "680708",
    deviceId: "device_test_1234",
  });
  FakeWebSocket.instances[0].close(1008);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(FakeWebSocket.instances.length, 1);
});

test("presence connect is idempotent and can restart after a policy rejection", () => {
  FakeWebSocket.instances = [];
  const presence = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    60_000,
    60_000,
    null,
  );
  const identity = {
    publicKey: "Tg2wbdIU3C0JRfSX",
    employeeId: "680708",
    deviceId: "device_test_1234",
  };

  presence.connect(identity);
  presence.connect(identity);
  assert.equal(FakeWebSocket.instances.length, 1);

  FakeWebSocket.instances[0].close(1008);
  presence.connect(identity);
  assert.equal(FakeWebSocket.instances.length, 2);
  presence.disconnect();
});

test("presence replaces a stale open socket when heartbeat acknowledgements stop", async (context) => {
  FakeWebSocket.instances = [];
  const presence = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    5,
    1,
    null,
    null,
  );
  context.after(() => presence.disconnect());

  presence.connect({
    publicKey: "Tg2wbdIU3C0JRfSX",
    employeeId: "680708",
    deviceId: "device_test_1234",
  });
  FakeWebSocket.instances[0].open();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(FakeWebSocket.instances[0].closeCode, 4000);
  assert.equal(FakeWebSocket.instances.length, 2);
});

test("heartbeat acknowledgements keep the current socket alive", async (context) => {
  FakeWebSocket.instances = [];
  const presence = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    5,
    1,
    null,
    null,
  );
  context.after(() => presence.disconnect());

  presence.connect({
    publicKey: "Tg2wbdIU3C0JRfSX",
    employeeId: "680708",
    deviceId: "device_test_1234",
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({ type: "heartbeat_ack" });
  await new Promise((resolve) => setTimeout(resolve, 6));
  socket.receive({ type: "heartbeat_ack" });
  await new Promise((resolve) => setTimeout(resolve, 6));
  socket.receive({ type: "heartbeat_ack" });
  await new Promise((resolve) => setTimeout(resolve, 1));

  assert.equal(FakeWebSocket.instances.length, 1);
});
