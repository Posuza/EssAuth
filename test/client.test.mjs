import assert from "node:assert/strict";
import test from "node:test";

import { EssAuthClient, EssAuthError, MemoryStorage } from "../dist/index.js";

const employee = {
  employee_code: "680708",
  first_name: "Test",
  last_name: "Employee",
  email: null,
  role_name: "Employee",
  name_prefix: "Mr.",
  field_id: null,
  field_name: null,
  position_id: null,
  position_name: "Operator",
  department_id: null,
  department_name: null,
  division_id: null,
  division_name: null,
  route_id: null,
  route_name: null,
  has_face_profile: true,
};

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

test("login maps credentials and persists a restorable session", async () => {
  const storage = new MemoryStorage();
  let request;
  const fetch = async (url, init) => {
    request = { url, init };
    return jsonResponse({ employee, message: "Login successful" });
  };
  const client = new EssAuthClient({ baseUrl: "http://localhost:8000/api/v1/", storage, fetch });

  const session = await client.login({ employeeCode: " 680708 ", password: "secret" });

  assert.equal(request.url, "http://localhost:8000/api/v1/auth/login");
  assert.deepEqual(JSON.parse(request.init.body), { employee_code: "680708", password: "secret" });
  assert.equal(session.employee.employee_code, "680708");
  assert.equal(client.getUser()?.first_name, "Test");

  const restored = new EssAuthClient({ storage, fetch });
  assert.equal(restored.start()?.employee.employee_code, "680708");
});

test("authenticated requests carry the current employee identity", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).endsWith("/auth/login")) {
      return jsonResponse({ employee, message: "ok" });
    }
    return jsonResponse({ items: [] });
  };
  const client = new EssAuthClient({ storage: new MemoryStorage(), fetch });
  await client.login({ employeeCode: "680708", password: "secret" });
  await client.request("/employee-directory");

  assert.equal(new Headers(calls[1].init.headers).get("X-Employee-Code"), "680708");
});

test("face verification maps camelCase input to the backend contract", async () => {
  let body;
  const fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return jsonResponse({ is_match: true, message: "ok", score: 0.9, threshold: 0.5 });
  };
  const client = new EssAuthClient({ storage: new MemoryStorage(), fetch });
  const result = await client.verifyFace({ employeeCode: "680708", imageDataUrl: "data:image/jpeg;base64,abc" });

  assert.deepEqual(body, { employee_code: "680708", image_data_url: "data:image/jpeg;base64,abc" });
  assert.equal(result.is_match, true);
});

test("server detail is exposed through EssAuthError", async () => {
  const fetch = async () => jsonResponse({ detail: "Invalid credentials" }, { status: 401 });
  const client = new EssAuthClient({ storage: new MemoryStorage(), fetch });

  await assert.rejects(
    client.login({ employeeCode: "680708", password: "bad" }),
    (error) => error instanceof EssAuthError
      && error.message === "Invalid credentials"
      && error.status === 401,
  );
});

test("logout clears local state even when the server is unavailable", async () => {
  let shouldFail = false;
  const fetch = async () => {
    if (shouldFail) throw new TypeError("offline");
    return jsonResponse({ employee, message: "ok" });
  };
  const client = new EssAuthClient({ storage: new MemoryStorage(), fetch });
  await client.login({ employeeCode: "680708", password: "secret" });
  shouldFail = true;

  await assert.rejects(client.logout(), { code: "NETWORK_ERROR" });
  assert.equal(client.isAuthenticated(), false);
});
