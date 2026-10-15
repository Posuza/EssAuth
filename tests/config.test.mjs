import assert from "node:assert/strict";
import test from "node:test";

import { resolveConfig } from "../dist/internal/core/config.js";

test("SDK owns the fixed ESS API and hosted login endpoints", () => {
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
    "https://programmers-alone-recognized-organizations.trycloudflare.com/api/v1",
  );
  assert.equal(
    config.loginUrl,
    "https://programmers-alone-recognized-organizations.trycloudflare.com/client-auth/login",
  );
});
