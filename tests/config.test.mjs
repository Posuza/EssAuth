import assert from "node:assert/strict";
import test from "node:test";

import { resolveConfig } from "../dist/internal/core/config.js";

test("baseUrl derives the API and hosted login endpoints", () => {
  const config = resolveConfig({
    publicKey: "Ab3dE6gH9jKm2NpQ",
    baseUrl: "https://ess.example.test/",
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  });

  assert.equal(config.apiUrl, "https://ess.example.test/api/v1");
  assert.equal(config.loginUrl, "https://ess.example.test/client-auth/login");
});

test("advanced endpoint overrides take precedence over baseUrl", () => {
  const config = resolveConfig({
    publicKey: "Ab3dE6gH9jKm2NpQ",
    baseUrl: "https://ess.example.test",
    apiUrl: "https://api.example.test/v2",
    loginUrl: "https://login.example.test/sign-in",
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  });

  assert.equal(config.apiUrl, "https://api.example.test/v2");
  assert.equal(config.loginUrl, "https://login.example.test/sign-in");
});
