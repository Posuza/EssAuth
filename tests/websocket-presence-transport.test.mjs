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
  const geolocation = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 13.7563, longitude: 100.5018 } });
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
});

test("presence heartbeat reuses coordinates already captured by the client app", () => {
  FakeWebSocket.instances = [];
  const locationStorage = {
    getItem(key) {
      return { geo_lat: "13.7563", geo_lng: "100.5018" }[key] ?? null;
    },
  };
  const presence = new WebSocketPresenceTransport(
    "https://ess.example.test/api/v1",
    FakeWebSocket,
    60_000,
    60_000,
    null,
    null,
    locationStorage,
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
