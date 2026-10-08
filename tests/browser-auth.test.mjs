import assert from "node:assert/strict";
import test from "node:test";

import EssAuth, * as PublicSdk from "../dist/index.js";

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("public entry exposes only the three-method browser API", () => {
  assert.deepEqual(Object.keys(PublicSdk), ["default"]);
  assert.equal(typeof EssAuth.init, "function");
  assert.deepEqual(
    Object.getOwnPropertyNames(EssAuth.prototype),
    ["constructor", "login", "logout"],
  );
});

test("initialization rejects a client key that is not exactly 16 characters", async () => {
  await assert.rejects(
    EssAuth.init({ publicKey: "essmo1234" }),
    (error) => error instanceof Error
      && error.code === "INVALID_CLIENT_PUBLIC_KEY",
  );
});

test("redirect login verifies, restores, and logs out the client identity", async (context) => {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  const originalHistory = Object.getOwnPropertyDescriptor(globalThis, "history");
  context.after(() => {
    if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
    else delete globalThis.location;
    if (originalHistory) Object.defineProperty(globalThis, "history", originalHistory);
    else delete globalThis.history;
  });

  const storage = memoryStorage();
  const requests = [];
  let assignedUrl = null;
  let cleanedUrl = null;
  let currentHref = "https://client.example.test/payroll?view=summary&ticket=opaque-ticket#totals";

  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      get href() {
        return currentHref;
      },
      assign(url) {
        assignedUrl = url;
      },
    },
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: {
      state: { source: "test" },
      replaceState(_state, _title, url) {
        cleanedUrl = url;
        currentHref = url;
      },
    },
  });

  const fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body), keepalive: init.keepalive ?? false });
    const response = url.endsWith("/client-auth/callback/validate")
      ? { valid: true }
      : url.endsWith("/client-auth/logout")
        ? { message: "Logout notification recorded." }
        : { employee_id: "680708" };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const options = {
    publicKey: "Ab3dE6gH9jKm2NpQ",
    apiUrl: "https://api.example.test/api/v1",
    loginUrl: "https://ess.example.test/client-auth/login",
    storage,
    fetch,
  };

  const auth = await EssAuth.init(options);

  assert.equal(auth.employeeId, "680708");
  assert.equal(auth.error, null);
  assert.deepEqual(requests, [
    {
      url: "https://api.example.test/api/v1/client-auth/callback/validate",
      body: {
        public_key: "Ab3dE6gH9jKm2NpQ",
        return_to: "https://client.example.test/payroll?view=summary&ticket=opaque-ticket#totals",
      },
      keepalive: false,
    },
    {
      url: "https://api.example.test/api/v1/client-auth/tickets/verify",
      body: {
        public_key: "Ab3dE6gH9jKm2NpQ",
        ticket: "opaque-ticket",
      },
      keepalive: false,
    },
  ]);
  assert.equal(new URL(cleanedUrl).searchParams.has("ticket"), false);

  const restored = await EssAuth.init(options);
  assert.equal(restored.employeeId, "680708");
  assert.equal(requests.length, 3);

  await restored.logout();
  assert.equal(restored.employeeId, null);
  assert.equal(storage.values.size, 0);
  assert.deepEqual(requests[3], {
    url: "https://api.example.test/api/v1/client-auth/logout",
    body: {
      public_key: "Ab3dE6gH9jKm2NpQ",
      employee_id: "680708",
    },
    keepalive: true,
  });

  const loggedOut = await EssAuth.init(options);
  assert.equal(loggedOut.employeeId, null);
  assert.equal(requests.length, 5);

  loggedOut.login();
  const redirect = new URL(assignedUrl);
  assert.equal(redirect.href.startsWith("https://ess.example.test/client-auth/login?"), true);
  assert.equal(redirect.searchParams.get("public_key"), "Ab3dE6gH9jKm2NpQ");
  assert.equal(redirect.searchParams.get("return_to"), currentHref);
  assert.equal(loggedOut.employeeId, null);
});

test("logout clears restored identity when the notification request fails", async (context) => {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  const originalHistory = Object.getOwnPropertyDescriptor(globalThis, "history");
  context.after(() => {
    if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
    else delete globalThis.location;
    if (originalHistory) Object.defineProperty(globalThis, "history", originalHistory);
    else delete globalThis.history;
  });

  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: "https://client.example.test/payroll" },
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: { state: null, replaceState() {} },
  });

  const publicKey = "Ab3dE6gH9jKm2NpQ";
  const storage = memoryStorage();
  storage.setItem(
    `ess-auth-o1.client-identity.v1.${publicKey}`,
    JSON.stringify({ employeeId: "680708", publicKey }),
  );
  const auth = await EssAuth.init({
    publicKey,
    storage,
    fetch: async (url) => {
      if (url.endsWith("/client-auth/callback/validate")) {
        return new Response(JSON.stringify({ valid: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new TypeError("offline");
    },
  });

  assert.equal(auth.employeeId, "680708");
  await assert.rejects(auth.logout(), (error) => error?.code === "NETWORK_ERROR");
  assert.equal(auth.employeeId, null);
  assert.equal(storage.values.size, 0);
});

test("callback rejection is returned as an SDK error without another login loop", async (context) => {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  const originalHistory = Object.getOwnPropertyDescriptor(globalThis, "history");
  context.after(() => {
    if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
    else delete globalThis.location;
    if (originalHistory) Object.defineProperty(globalThis, "history", originalHistory);
    else delete globalThis.history;
  });

  let cleanedUrl = null;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: "https://client.example.test/?essauth_error=invalid_callback" },
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: {
      state: null,
      replaceState(_state, _title, url) {
        cleanedUrl = url;
      },
    },
  });

  const auth = await EssAuth.init({
    publicKey: "Ab3dE6gH9jKm2NpQ",
    storage: memoryStorage(),
    fetch: async () => new Response(JSON.stringify({ valid: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  assert.equal(auth.employeeId, null);
  assert.equal(auth.error?.code, "INVALID_CALLBACK");
  assert.equal(new URL(cleanedUrl).searchParams.has("essauth_error"), false);
});

test("failed preflight keeps the client on its page and disables login", async (context) => {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  const originalHistory = Object.getOwnPropertyDescriptor(globalThis, "history");
  context.after(() => {
    if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
    else delete globalThis.location;
    if (originalHistory) Object.defineProperty(globalThis, "history", originalHistory);
    else delete globalThis.history;
  });

  let assignedUrl = null;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      href: "https://unregistered.example.test/",
      assign(url) {
        assignedUrl = url;
      },
    },
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: { state: null, replaceState() {} },
  });

  const auth = await EssAuth.init({
    publicKey: "Ab3dE6gH9jKm2NpQ",
    storage: memoryStorage(),
    fetch: async () => new Response(JSON.stringify({
      detail: { message: "Callback URL is not registered." },
    }), {
      status: 403,
      headers: { "content-type": "application/json" },
    }),
  });

  assert.equal(auth.employeeId, null);
  assert.equal(auth.error?.code, "HTTP_403");
  assert.throws(() => auth.login(), (error) => error?.code === "CLIENT_VALIDATION_REQUIRED");
  assert.equal(assignedUrl, null);
});
