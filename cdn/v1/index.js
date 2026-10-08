// src/internal/storage/identity-store.ts
var IdentityStore = class {
  #publicKey;
  #storage;
  #storageKey;
  constructor(storage, storageKey, publicKey) {
    this.#storage = storage;
    this.#storageKey = storageKey;
    this.#publicKey = publicKey;
  }
  restore() {
    const stored = this.#storage.getItem(this.#storageKey);
    if (!stored) return null;
    try {
      const identity = JSON.parse(stored);
      if (identity.publicKey !== this.#publicKey || typeof identity.employeeId !== "string" || !identity.employeeId.trim()) {
        throw new Error("Invalid stored identity");
      }
      return identity.employeeId;
    } catch {
      this.clear();
      return null;
    }
  }
  save(employeeId) {
    this.#storage.setItem(
      this.#storageKey,
      JSON.stringify({ employeeId, publicKey: this.#publicKey })
    );
  }
  clear() {
    this.#storage.removeItem(this.#storageKey);
  }
};

// src/internal/core/errors.ts
function detailMessage(payload) {
  if (!payload || typeof payload !== "object") return null;
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const message = detail.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (first && typeof first === "object") {
      const message = first.msg;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return null;
}
var EssAuthError = class extends Error {
  code;
  status;
  details;
  constructor(message, options = {}) {
    super(message);
    this.name = "EssAuthError";
    this.code = options.code ?? "ESS_AUTH_ERROR";
    this.status = options.status ?? null;
    this.details = options.details;
  }
};
async function responseError(response, fallback) {
  const payload = await response.json().catch(() => null);
  return new EssAuthError(detailMessage(payload) ?? fallback, {
    code: `HTTP_${response.status}`,
    status: response.status,
    details: payload
  });
}
function connectionError(cause) {
  if (cause instanceof EssAuthError) return cause;
  return new EssAuthError("Unable to connect to the ESS server.", {
    code: "NETWORK_ERROR",
    details: cause
  });
}

// src/internal/auth/callback-service.ts
var CallbackService = class {
  #publicKey;
  #transport;
  constructor(publicKey, transport) {
    this.#publicKey = publicKey;
    this.#transport = transport;
  }
  async validate(returnTo) {
    const result = await this.#transport.post(
      "/client-auth/callback/validate",
      { public_key: this.#publicKey, return_to: returnTo },
      { fallbackError: "ESS client application validation failed." }
    );
    if (result.valid !== true) {
      throw new EssAuthError("ESS returned an invalid callback validation response.", {
        code: "INVALID_CALLBACK_RESPONSE",
        details: result
      });
    }
  }
};

// src/internal/auth/redirect.ts
function browserUrl() {
  if (typeof globalThis.location === "undefined") {
    throw new EssAuthError("EssAuth redirect login requires a browser.", {
      code: "BROWSER_REQUIRED"
    });
  }
  return new URL(globalThis.location.href);
}
function redirectToLogin(loginUrl, publicKey) {
  const callback = browserUrl();
  callback.searchParams.delete("ticket");
  const login = new URL(loginUrl);
  login.searchParams.set("public_key", publicKey);
  login.searchParams.set("return_to", callback.toString());
  globalThis.location.assign(login.toString());
}
function callbackTicket(url) {
  return url.searchParams.get("ticket");
}
function callbackError(url) {
  return url.searchParams.get("essauth_error");
}
function cleanCallbackUrl(url) {
  url.searchParams.delete("ticket");
  url.searchParams.delete("essauth_error");
  globalThis.history.replaceState(globalThis.history.state, "", url.toString());
}

// src/internal/auth/ticket-service.ts
var TicketService = class {
  #publicKey;
  #transport;
  constructor(publicKey, transport) {
    this.#publicKey = publicKey;
    this.#transport = transport;
  }
  async verify(ticket) {
    const normalizedTicket = ticket.trim();
    if (!normalizedTicket) {
      throw new EssAuthError("Ticket cannot be empty.", {
        code: "INVALID_CLIENT_TICKET"
      });
    }
    const result = await this.#transport.post(
      "/client-auth/tickets/verify",
      { public_key: this.#publicKey, ticket: normalizedTicket },
      { fallbackError: "Ticket verification failed." }
    );
    if (typeof result.employee_id !== "string" || !result.employee_id.trim()) {
      throw new EssAuthError("ESS returned an invalid employee identity.", {
        code: "INVALID_TICKET_RESPONSE",
        details: result
      });
    }
    return result.employee_id;
  }
  async notifyLogout(employeeId) {
    await this.#transport.post(
      "/client-auth/logout",
      { public_key: this.#publicKey, employee_id: employeeId },
      { fallbackError: "Logout notification failed.", keepalive: true }
    );
  }
};

// src/internal/auth/lifecycle.ts
async function initializeIdentity(identity, tickets, callbacks) {
  const url = browserUrl();
  const returnedError = callbackError(url);
  const ticket = callbackTicket(url);
  try {
    await callbacks.validate(url.toString());
  } catch (error) {
    cleanCallbackUrl(url);
    return {
      employeeId: null,
      error: error instanceof Error ? error : new Error("ESS client validation failed."),
      callbackValidated: false
    };
  }
  if (returnedError) {
    cleanCallbackUrl(url);
    return {
      employeeId: null,
      error: new EssAuthError(
        returnedError === "invalid_callback" ? "ESS rejected an unregistered callback address." : "ESS login could not continue.",
        { code: returnedError.toUpperCase() }
      ),
      callbackValidated: true
    };
  }
  if (!ticket) {
    return {
      employeeId: identity.restore(),
      error: null,
      callbackValidated: true
    };
  }
  identity.clear();
  try {
    const employeeId = await tickets.verify(ticket);
    identity.save(employeeId);
    return { employeeId, error: null, callbackValidated: true };
  } catch (error) {
    return {
      employeeId: null,
      error: error instanceof Error ? error : new Error("ESS login failed."),
      callbackValidated: true
    };
  } finally {
    cleanCallbackUrl(url);
  }
}

// src/internal/storage/browser-storage.ts
var MemoryStorage = class {
  #values = /* @__PURE__ */ new Map();
  getItem(key) {
    return this.#values.get(key) ?? null;
  }
  setItem(key, value) {
    this.#values.set(key, value);
  }
  removeItem(key) {
    this.#values.delete(key);
  }
};
function defaultStorage() {
  try {
    if (typeof globalThis.sessionStorage !== "undefined") {
      return globalThis.sessionStorage;
    }
  } catch {
  }
  return new MemoryStorage();
}

// src/internal/core/config.ts
var DEFAULT_API_URL = "https://essauth.localhost/api/v1";
var DEFAULT_LOGIN_URL = "https://essauth.localhost/client-auth/login";
var DEFAULT_STORAGE_KEY = "ess-auth-o1.client-identity.v1";
var PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{16}$/;
function normalizedUrl(value, name) {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new EssAuthError(`${name} cannot be empty.`, { code: "INVALID_CONFIG" });
  }
  try {
    return new URL(normalized).toString().replace(/\/+$/, "");
  } catch {
    throw new EssAuthError(`${name} must be a valid URL.`, { code: "INVALID_CONFIG" });
  }
}
function resolveConfig(options) {
  const publicKey = options.publicKey.trim();
  if (!PUBLIC_KEY_PATTERN.test(publicKey)) {
    throw new EssAuthError(
      "The registered client public key must contain exactly 16 URL-safe characters.",
      { code: "INVALID_CLIENT_PUBLIC_KEY" }
    );
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new EssAuthError("A fetch implementation is required.", {
      code: "FETCH_REQUIRED"
    });
  }
  return {
    publicKey,
    apiUrl: normalizedUrl(options.apiUrl ?? DEFAULT_API_URL, "apiUrl"),
    loginUrl: normalizedUrl(options.loginUrl ?? DEFAULT_LOGIN_URL, "loginUrl"),
    storage: options.storage ?? defaultStorage(),
    storageKey: options.storageKey?.trim() || `${DEFAULT_STORAGE_KEY}.${publicKey}`,
    fetcher
  };
}

// src/internal/transport/fetch-transport.ts
var FetchTransport = class {
  #baseUrl;
  #fetcher;
  constructor(baseUrl, fetcher) {
    this.#baseUrl = baseUrl;
    this.#fetcher = fetcher.bind(globalThis);
  }
  async post(path, body, options) {
    let response;
    try {
      response = await this.#fetcher(`${this.#baseUrl}/${path.replace(/^\/+/, "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: options.keepalive ?? false
      });
    } catch (error) {
      throw connectionError(error);
    }
    if (!response.ok) {
      throw await responseError(response, options.fallbackError);
    }
    return response.json();
  }
};

// src/internal/transport/websocket-presence-transport.ts
var HEARTBEAT_INTERVAL_MS = 15e3;
var RECONNECT_DELAY_MS = 5e3;
var WebSocketPresenceTransport = class {
  #apiUrl;
  #webSocketConstructor;
  #heartbeatIntervalMs;
  #reconnectDelayMs;
  #active = false;
  #publicKey = "";
  #socket = null;
  #heartbeatTimer = null;
  #reconnectTimer = null;
  constructor(apiUrl, webSocketConstructor, heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS, reconnectDelayMs = RECONNECT_DELAY_MS) {
    this.#apiUrl = apiUrl;
    this.#webSocketConstructor = webSocketConstructor;
    this.#heartbeatIntervalMs = heartbeatIntervalMs;
    this.#reconnectDelayMs = reconnectDelayMs;
  }
  connect(publicKey) {
    this.disconnect();
    if (!this.#webSocketConstructor) return;
    this.#active = true;
    this.#publicKey = publicKey;
    this.#openSocket();
  }
  disconnect() {
    this.#active = false;
    this.#clearHeartbeatTimer();
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    const socket = this.#socket;
    this.#socket = null;
    if (socket && socket.readyState < 2) socket.close(1e3, "Client stopped");
  }
  #openSocket() {
    if (!this.#active || !this.#webSocketConstructor) return;
    const url = new URL(this.#apiUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/client-auth/presence/ws`;
    url.search = "";
    url.searchParams.set("public_key", this.#publicKey);
    const socket = new this.#webSocketConstructor(url);
    this.#socket = socket;
    socket.onopen = () => {
      if (!this.#active || this.#socket !== socket) return;
      this.#sendHeartbeat(socket);
      this.#heartbeatTimer = setInterval(
        () => this.#sendHeartbeat(socket),
        this.#heartbeatIntervalMs
      );
    };
    socket.onerror = () => {
    };
    socket.onclose = () => {
      if (this.#socket === socket) this.#socket = null;
      this.#clearHeartbeatTimer();
      if (!this.#active) return;
      this.#reconnectTimer = setTimeout(() => {
        this.#reconnectTimer = null;
        this.#openSocket();
      }, this.#reconnectDelayMs);
    };
  }
  #sendHeartbeat(socket) {
    if (this.#socket !== socket || socket.readyState !== 1) return;
    socket.send(JSON.stringify({ type: "heartbeat" }));
  }
  #clearHeartbeatTimer() {
    if (this.#heartbeatTimer === null) return;
    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
  }
};

// src/public/ess-auth.ts
var EssAuth = class _EssAuth {
  employeeId = null;
  error = null;
  #publicKey;
  #loginUrl;
  #identity;
  #tickets;
  #callbacks;
  #presence;
  #callbackValidated = false;
  constructor(options) {
    const config = resolveConfig(options);
    this.#publicKey = config.publicKey;
    this.#loginUrl = config.loginUrl;
    this.#identity = new IdentityStore(
      config.storage,
      config.storageKey,
      config.publicKey
    );
    const transport = new FetchTransport(config.apiUrl, config.fetcher);
    this.#tickets = new TicketService(config.publicKey, transport);
    this.#callbacks = new CallbackService(config.publicKey, transport);
    this.#presence = new WebSocketPresenceTransport(
      config.apiUrl,
      typeof globalThis.window !== "undefined" && typeof globalThis.WebSocket === "function" ? globalThis.WebSocket : null
    );
  }
  static async init(options) {
    const auth = new _EssAuth(options);
    const result = await initializeIdentity(
      auth.#identity,
      auth.#tickets,
      auth.#callbacks
    );
    auth.employeeId = result.employeeId;
    auth.error = result.error;
    auth.#callbackValidated = result.callbackValidated;
    if (result.callbackValidated) auth.#presence.connect(auth.#publicKey);
    return auth;
  }
  login() {
    if (!this.#callbackValidated) {
      const error = new EssAuthError(
        "ESS login is unavailable because this client application was not validated.",
        { code: "CLIENT_VALIDATION_REQUIRED" }
      );
      this.error = error;
      throw error;
    }
    this.#clearIdentity();
    redirectToLogin(this.#loginUrl, this.#publicKey);
  }
  async logout() {
    const employeeId = this.employeeId;
    this.#clearIdentity();
    if (!employeeId) return;
    await this.#tickets.notifyLogout(employeeId);
  }
  #clearIdentity() {
    this.employeeId = null;
    this.error = null;
    this.#identity.clear();
  }
};
export {
  EssAuth as default
};
