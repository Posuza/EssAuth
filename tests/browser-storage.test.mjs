import assert from "node:assert/strict";
import test from "node:test";

import { defaultStorage } from "../dist/internal/storage/browser-storage.js";

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function defineStorage(name, value) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

test("browser storage keeps different employees separate across tabs", (context) => {
  const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  context.after(() => {
    if (originalLocal) Object.defineProperty(globalThis, "localStorage", originalLocal);
    else delete globalThis.localStorage;
    if (originalSession) Object.defineProperty(globalThis, "sessionStorage", originalSession);
    else delete globalThis.sessionStorage;
  });

  const local = memoryStorage();
  const firstTab = memoryStorage();
  const secondTab = memoryStorage();
  const key = "ess-auth-o1.client-identity.v1.Tg2wbdIU3C0JRfSX";
  const firstIdentity = JSON.stringify({
    employeeId: "680708",
    publicKey: "Tg2wbdIU3C0JRfSX",
  });
  const secondIdentity = JSON.stringify({
    employeeId: "620488",
    publicKey: "Tg2wbdIU3C0JRfSX",
  });

  defineStorage("localStorage", local);
  defineStorage("sessionStorage", firstTab);
  const firstStore = defaultStorage();
  firstStore.setItem(key, firstIdentity);

  defineStorage("sessionStorage", secondTab);
  const secondStore = defaultStorage();
  secondStore.setItem(key, secondIdentity);

  assert.equal(firstStore.getItem(key), firstIdentity);
  assert.equal(secondStore.getItem(key), secondIdentity);
  assert.equal(local.values.size, 2);

  firstStore.removeItem(key);
  assert.equal(firstStore.getItem(key), null);
  assert.equal(secondStore.getItem(key), secondIdentity);
  assert.equal(local.values.size, 1);
});

test("browser storage migrates the previous tab-local identity", (context) => {
  const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  context.after(() => {
    if (originalLocal) Object.defineProperty(globalThis, "localStorage", originalLocal);
    else delete globalThis.localStorage;
    if (originalSession) Object.defineProperty(globalThis, "sessionStorage", originalSession);
    else delete globalThis.sessionStorage;
  });

  const local = memoryStorage();
  const session = memoryStorage();
  const key = "ess-auth-o1.client-identity.v1.Tg2wbdIU3C0JRfSX";
  const identity = JSON.stringify({
    employeeId: "680708",
    publicKey: "Tg2wbdIU3C0JRfSX",
  });
  session.setItem(key, identity);
  defineStorage("localStorage", local);
  defineStorage("sessionStorage", session);

  const storage = defaultStorage();
  assert.equal(storage.getItem(key), identity);
  assert.equal(session.getItem(key), null);
  assert.equal(session.getItem(`${key}.active`), "680708");
  assert.equal(local.getItem(`${key}.680708`), identity);
});

test("removing one employee session notifies matching tabs only", (context) => {
  const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const originalAdd = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
  const originalRemove = Object.getOwnPropertyDescriptor(globalThis, "removeEventListener");
  context.after(() => {
    for (const [name, descriptor] of [
      ["localStorage", originalLocal],
      ["sessionStorage", originalSession],
      ["addEventListener", originalAdd],
      ["removeEventListener", originalRemove],
    ]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });

  const listeners = new Set();
  const local = memoryStorage();
  const firstTab = memoryStorage();
  const secondTab = memoryStorage();
  const key = "ess-auth-o1.client-identity.v1.Tg2wbdIU3C0JRfSX";
  const identity = JSON.stringify({
    employeeId: "680708",
    publicKey: "Tg2wbdIU3C0JRfSX",
  });
  defineStorage("localStorage", local);
  Object.defineProperty(globalThis, "addEventListener", {
    configurable: true,
    value: (type, listener) => {
      if (type === "storage") listeners.add(listener);
    },
  });
  Object.defineProperty(globalThis, "removeEventListener", {
    configurable: true,
    value: (type, listener) => {
      if (type === "storage") listeners.delete(listener);
    },
  });

  defineStorage("sessionStorage", firstTab);
  const firstStore = defaultStorage();
  firstStore.setItem(key, identity);
  defineStorage("sessionStorage", secondTab);
  const secondStore = defaultStorage();
  secondStore.setItem(key, identity);

  let removed = false;
  secondStore.subscribe(key, "680708", () => {
    removed = true;
  });
  firstStore.removeItem(key);
  for (const listener of listeners) {
    listener({
      key: `${key}.680708`,
      newValue: null,
      storageArea: local,
    });
  }

  assert.equal(removed, true);
  assert.equal(secondTab.getItem(`${key}.active`), null);
});
