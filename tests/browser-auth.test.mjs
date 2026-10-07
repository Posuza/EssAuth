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
    const response = url.endsWith("/client-auth/logout")
      ? { message: "Logout notification recorded." }
      : { employee_id: "680708" };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const options = {
    publicKey: "registered-public-key",
    apiUrl: "https://api.example.test/api/v1",
    loginUrl: "https://ess.example.test/client-auth/login",
    storage,
    fetch,
  };

  const auth = await EssAuth.init(options);

  assert.equal(auth.employeeId, "680708");
  assert.equal(auth.error, null);
  assert.deepEqual(requests, [{
    url: "https://api.example.test/api/v1/client-auth/tickets/verify",
    body: {
      public_key: "registered-public-key",
      ticket: "opaque-ticket",
    },
    keepalive: false,
  }]);
  assert.equal(new URL(cleanedUrl).searchParams.has("ticket"), false);

  const restored = await EssAuth.init(options);
  assert.equal(restored.employeeId, "680708");
  assert.equal(requests.length, 1);

  await restored.logout();
  assert.equal(restored.employeeId, null);
  assert.equal(storage.values.size, 0);
  assert.deepEqual(requests[1], {
    url: "https://api.example.test/api/v1/client-auth/logout",
    body: {
      public_key: "registered-public-key",
      employee_id: "680708",
    },
    keepalive: true,
  });

  const loggedOut = await EssAuth.init(options);
  assert.equal(loggedOut.employeeId, null);
  assert.equal(requests.length, 2);

  loggedOut.login();
  const redirect = new URL(assignedUrl);
  assert.equal(redirect.href.startsWith("https://ess.example.test/client-auth/login?"), true);
  assert.equal(redirect.searchParams.get("public_key"), "registered-public-key");
  assert.equal(redirect.searchParams.get("return_to"), currentHref);
  assert.equal(loggedOut.employeeId, null);
});
