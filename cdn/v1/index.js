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
  onRemoved(employeeId, listener) {
    const coordinated = this.#storage;
    return coordinated.subscribe?.(this.#storageKey, employeeId, listener) ?? (() => {
    });
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
  const restoredEmployeeId = !ticket && !returnedError ? identity.restore() : null;
  if (restoredEmployeeId) {
    return {
      employeeId: restoredEmployeeId,
      error: null,
      callbackValidated: true
    };
  }
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
      employeeId: restoredEmployeeId,
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
function browserStorage(name) {
  try {
    return globalThis[name] ?? null;
  } catch {
    return null;
  }
}
function employeeIdFromValue(value) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed.employeeId === "string" && parsed.employeeId.trim() ? parsed.employeeId.trim() : null;
  } catch {
    return null;
  }
}
var BrowserIdentityStorage = class {
  #local;
  #session;
  constructor(local, session) {
    this.#local = local;
    this.#session = session;
  }
  getItem(key) {
    const activeKey = `${key}.active`;
    const activeEmployeeId = this.#session.getItem(activeKey)?.trim();
    if (activeEmployeeId) {
      const stored = this.#local.getItem(`${key}.${activeEmployeeId}`);
      if (stored) return stored;
      this.#session.removeItem(activeKey);
    }
    const legacy = this.#session.getItem(key);
    if (!legacy) return null;
    const employeeId = employeeIdFromValue(legacy);
    if (!employeeId) {
      this.#session.removeItem(key);
      return null;
    }
    this.setItem(key, legacy);
    return legacy;
  }
  setItem(key, value) {
    const employeeId = employeeIdFromValue(value);
    if (!employeeId) throw new Error("SDK identity requires an employee ID");
    this.#local.setItem(`${key}.${employeeId}`, value);
    this.#session.setItem(`${key}.active`, employeeId);
    this.#session.removeItem(key);
  }
  removeItem(key) {
    const activeKey = `${key}.active`;
    const employeeId = this.#session.getItem(activeKey)?.trim();
    if (employeeId) this.#local.removeItem(`${key}.${employeeId}`);
    this.#session.removeItem(activeKey);
    this.#session.removeItem(key);
  }
  subscribe(key, employeeId, onRemoved) {
    if (typeof globalThis.addEventListener !== "function") return () => {
    };
    const recordKey = `${key}.${employeeId}`;
    const listener = (event) => {
      if (event.storageArea !== globalThis.localStorage) return;
      if (event.key !== recordKey || event.newValue !== null) return;
      this.#session.removeItem(`${key}.active`);
      onRemoved();
    };
    globalThis.addEventListener("storage", listener);
    return () => globalThis.removeEventListener("storage", listener);
  }
};
function defaultStorage() {
  const local = browserStorage("localStorage");
  const session = browserStorage("sessionStorage");
  if (local && session) return new BrowserIdentityStorage(local, session);
  return session ?? local ?? new MemoryStorage();
}

// src/internal/core/config.ts
var ESS_ORIGIN = "https://refine-treatments-polo-par.trycloudflare.com";
var ESS_API_URL = `${ESS_ORIGIN}/api/v1`;
var ESS_LOGIN_URL = `${ESS_ORIGIN}/client-auth/login`;
var DEFAULT_STORAGE_KEY = "ess-auth-o1.client-identity.v1";
var PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{16}$/;
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
    apiUrl: ESS_API_URL,
    loginUrl: ESS_LOGIN_URL,
    storage: options.storage ?? defaultStorage(),
    storageKey: options.storageKey?.trim() || `${DEFAULT_STORAGE_KEY}.${publicKey}`,
    fetcher
  };
}

// src/internal/storage/presence-identity.ts
var DEVICE_STORAGE_PREFIX = "ess-auth-o1.device.v1";
function randomId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
function deviceId(publicKey) {
  const key = `${DEVICE_STORAGE_PREFIX}.${publicKey}`;
  try {
    const stored = globalThis.localStorage?.getItem(key)?.trim();
    if (stored) return stored;
    const created = randomId();
    globalThis.localStorage?.setItem(key, created);
    return created;
  } catch {
    return randomId();
  }
}
function createPresenceIdentity(publicKey, employeeId) {
  return {
    publicKey,
    employeeId,
    deviceId: deviceId(publicKey)
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
function defaultLockManager() {
  try {
    return globalThis.navigator?.locks ?? null;
  } catch {
    return null;
  }
}
function defaultGeolocation() {
  try {
    return globalThis.navigator?.geolocation ?? null;
  } catch {
    return null;
  }
}
var WebSocketPresenceTransport = class {
  #apiUrl;
  #webSocketConstructor;
  #heartbeatIntervalMs;
  #reconnectDelayMs;
  #lockManager;
  #geolocation;
  #active = false;
  #identity = null;
  #socket = null;
  #heartbeatTimer = null;
  #awaitingHeartbeatAck = false;
  #reconnectTimer = null;
  #lockAbortController = null;
  #releaseLock = null;
  #generation = 0;
  #location = null;
  #locationWatchId = null;
  #locationDisabled = false;
  constructor(apiUrl, webSocketConstructor, heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS, reconnectDelayMs = RECONNECT_DELAY_MS, lockManager = defaultLockManager(), geolocation = defaultGeolocation()) {
    this.#apiUrl = apiUrl;
    this.#webSocketConstructor = webSocketConstructor;
    this.#heartbeatIntervalMs = heartbeatIntervalMs;
    this.#reconnectDelayMs = reconnectDelayMs;
    this.#lockManager = lockManager;
    this.#geolocation = geolocation;
  }
  connect(identity) {
    if (this.#active && this.#identity?.publicKey === identity.publicKey && this.#identity.employeeId === identity.employeeId && this.#identity.deviceId === identity.deviceId) return;
    this.disconnect();
    if (!this.#webSocketConstructor) return;
    this.#active = true;
    this.#identity = identity;
    this.#startPresenceOwner();
  }
  disconnect() {
    this.#active = false;
    this.#generation++;
    this.#releaseLock?.();
    this.#releaseLock = null;
    this.#lockAbortController?.abort();
    this.#lockAbortController = null;
    this.#clearHeartbeatTimer();
    this.#stopLocationWatch();
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    const socket = this.#socket;
    this.#socket = null;
    this.#identity = null;
    this.#location = null;
    this.#locationDisabled = false;
    if (socket && socket.readyState < 2) socket.close(1e3, "Client stopped");
  }
  #startPresenceOwner() {
    if (!this.#active || !this.#identity) return;
    if (!this.#lockManager) {
      this.#openSocket();
      return;
    }
    const identity = this.#identity;
    const generation = ++this.#generation;
    const abortController = new AbortController();
    this.#lockAbortController = abortController;
    const lockName = [
      "ess-auth-o1.presence.v2",
      identity.publicKey,
      identity.employeeId,
      identity.deviceId
    ].join(":");
    void this.#lockManager.request(
      lockName,
      { signal: abortController.signal },
      async () => {
        if (!this.#active || generation !== this.#generation) return;
        await new Promise((resolve) => {
          this.#releaseLock = resolve;
          this.#openSocket();
        });
        if (generation === this.#generation) this.#releaseLock = null;
      }
    ).catch((error) => {
      if (error?.name !== "AbortError") {
      }
    });
  }
  #openSocket() {
    if (!this.#active || !this.#webSocketConstructor) return;
    if (this.#socket && this.#socket.readyState < 2) return;
    const url = new URL(this.#apiUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/client-auth/presence/ws`;
    url.search = "";
    if (!this.#identity) return;
    this.#startLocationWatch();
    url.searchParams.set("public_key", this.#identity.publicKey);
    url.searchParams.set("employee_id", this.#identity.employeeId);
    url.searchParams.set("device_id", this.#identity.deviceId);
    const socket = new this.#webSocketConstructor(url);
    this.#socket = socket;
    socket.onopen = () => {
      if (!this.#active || this.#socket !== socket) return;
      this.#sendHeartbeat(socket, true);
      this.#heartbeatTimer = setInterval(
        () => {
          if (this.#awaitingHeartbeatAck) {
            this.#restartSocket(socket);
            return;
          }
          this.#sendHeartbeat(socket, true);
        },
        this.#heartbeatIntervalMs
      );
    };
    socket.onmessage = (event) => {
      if (this.#socket !== socket) return;
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === "heartbeat_ack") this.#awaitingHeartbeatAck = false;
      } catch {
      }
    };
    socket.onerror = () => {
    };
    socket.onclose = (event) => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#clearHeartbeatTimer();
      this.#stopLocationWatch();
      if (!this.#active) return;
      if (event.code === 1003 || event.code === 1008) {
        this.#active = false;
        return;
      }
      this.#scheduleReconnect();
    };
  }
  #sendHeartbeat(socket, trackAck = false) {
    if (this.#socket !== socket || socket.readyState !== 1 || !this.#identity) return;
    try {
      socket.send(JSON.stringify({
        type: "heartbeat",
        employee_id: this.#identity.employeeId,
        device_id: this.#identity.deviceId,
        ...this.#location ?? {}
      }));
      if (trackAck) this.#awaitingHeartbeatAck = true;
    } catch {
      this.#restartSocket(socket);
    }
  }
  #restartSocket(socket) {
    if (this.#socket !== socket) return;
    this.#socket = null;
    this.#clearHeartbeatTimer();
    this.#stopLocationWatch();
    try {
      if (socket.readyState < 2) socket.close(4e3, "Heartbeat acknowledgement timed out");
    } catch {
    }
    if (this.#active) this.#scheduleReconnect();
  }
  #scheduleReconnect() {
    if (this.#reconnectTimer !== null) return;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#openSocket();
    }, this.#reconnectDelayMs);
  }
  #startLocationWatch() {
    if (!this.#active || !this.#geolocation || this.#locationWatchId !== null || this.#locationDisabled) return;
    try {
      this.#locationWatchId = this.#geolocation.watchPosition(
        (position) => {
          if (!this.#active) return;
          this.#location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
        },
        (error) => {
          if (error.code === 1) {
            this.#locationDisabled = true;
            this.#stopLocationWatch();
          }
        },
        {
          enableHighAccuracy: false,
          maximumAge: 15e3,
          timeout: 1e4
        }
      );
    } catch {
      this.#locationDisabled = true;
      this.#locationWatchId = null;
    }
  }
  #stopLocationWatch() {
    if (this.#locationWatchId === null || !this.#geolocation) return;
    this.#geolocation.clearWatch(this.#locationWatchId);
    this.#locationWatchId = null;
  }
  #clearHeartbeatTimer() {
    this.#awaitingHeartbeatAck = false;
    if (this.#heartbeatTimer === null) return;
    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
  }
};

// src/public/ess-auth.ts
var PRESENCE_SETTINGS_REFRESH_MS = 6e4;
var EssAuth = class _EssAuth {
  employeeId = null;
  error = null;
  #publicKey;
  #loginUrl;
  #identity;
  #tickets;
  #callbacks;
  #presence;
  #apiUrl;
  #fetcher;
  #callbackValidated = false;
  #unsubscribeIdentity = null;
  #presenceIdentity = null;
  #presenceEnabled = null;
  #presenceSettingsTimer = null;
  constructor(options) {
    const config = resolveConfig(options);
    this.#publicKey = config.publicKey;
    this.#loginUrl = config.loginUrl;
    this.#apiUrl = config.apiUrl;
    this.#fetcher = config.fetcher;
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
    if (result.callbackValidated && result.employeeId) {
      auth.#startPresenceMonitoring(result.employeeId);
      auth.#unsubscribeIdentity = auth.#identity.onRemoved(
        result.employeeId,
        () => auth.#handleRemoteLogout()
      );
    }
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
    this.#stopPresenceMonitoring();
    this.#clearIdentity();
    redirectToLogin(this.#loginUrl, this.#publicKey);
  }
  async logout() {
    const employeeId = this.employeeId;
    this.#stopPresenceMonitoring();
    this.#clearIdentity();
    if (!employeeId) return;
    try {
      await this.#tickets.notifyLogout(employeeId);
    } catch {
    }
  }
  #clearIdentity() {
    this.#unsubscribeIdentity?.();
    this.#unsubscribeIdentity = null;
    this.employeeId = null;
    this.error = null;
    this.#identity.clear();
  }
  #handleRemoteLogout() {
    this.#unsubscribeIdentity?.();
    this.#unsubscribeIdentity = null;
    this.#stopPresenceMonitoring();
    this.employeeId = null;
    this.error = null;
    if (typeof globalThis.location?.reload === "function") {
      globalThis.location.reload();
    }
  }
  #startPresenceMonitoring(employeeId) {
    this.#presenceIdentity = createPresenceIdentity(this.#publicKey, employeeId);
    this.#presenceEnabled = true;
    this.#presence.connect(this.#presenceIdentity);
    void this.#syncPresenceMonitoring();
    this.#presenceSettingsTimer = setInterval(
      () => void this.#syncPresenceMonitoring(),
      PRESENCE_SETTINGS_REFRESH_MS
    );
  }
  #stopPresenceMonitoring() {
    if (this.#presenceSettingsTimer !== null) {
      clearInterval(this.#presenceSettingsTimer);
      this.#presenceSettingsTimer = null;
    }
    this.#presenceIdentity = null;
    this.#presenceEnabled = null;
    this.#presence.disconnect();
  }
  async #syncPresenceMonitoring() {
    if (!this.#presenceIdentity) return;
    let enabled;
    try {
      const response = await this.#fetcher(
        `${this.#apiUrl}/client-auth/presence/settings`,
        { method: "GET", cache: "no-store" }
      );
      const settings = await response.json();
      enabled = response.ok && settings.enabled === true;
    } catch {
      return;
    }
    this.#presenceEnabled = enabled;
    if (enabled) {
      this.#presence.connect(this.#presenceIdentity);
    } else {
      this.#presence.disconnect();
    }
  }
};
export {
  EssAuth as default
};
