import { EssAuthClient } from "./client.js";
import { EssAuthError } from "./errors.js";
import type { EssAuthClientOptions, LoginCredentials } from "./types.js";

let client: EssAuthClient | null = null;

function configuredClient(): EssAuthClient {
  if (!client) {
    throw new EssAuthError("Call start() before using the default EssAuth client.", {
      code: "SDK_NOT_STARTED",
    });
  }
  return client;
}

export function start(options: EssAuthClientOptions = {}): EssAuthClient {
  if (!client) {
    client = new EssAuthClient(options);
    client.start();
  }
  return client;
}

export function getClient(): EssAuthClient {
  return configuredClient();
}

export function login(credentials: LoginCredentials) {
  return configuredClient().login(credentials);
}

export function logout() {
  return configuredClient().logout();
}

export function getUser() {
  return configuredClient().getUser();
}

export function getSession() {
  return configuredClient().getSession();
}

export function verifyTicket(ticket: string) {
  return configuredClient().verifyTicket(ticket);
}
