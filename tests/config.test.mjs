import assert from "node:assert/strict";
import test from "node:test";

import { resolveConfig } from "../dist/internal/core/config.js";

test("SDK uses the build-time ESS origin for API and login endpoints", () => {
  const config = resolveConfig({
    publicKey: "Ab3dE6gH9jKm2NpQ",
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  });

  assert.equal(
    config.apiUrl,
    "http://localhost:9091/api/v1",
  );
  assert.equal(
    config.loginUrl,
    "http://localhost:9091/client-auth/login",
  );
});
