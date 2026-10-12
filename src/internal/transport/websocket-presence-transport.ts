import type {
  PresenceIdentity,
  PresenceTransport,
} from "./presence-transport.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 5_000;

type PresenceLocation = {
  latitude: number;
  longitude: number;
};

type PresenceGeolocation = Pick<Geolocation, "watchPosition" | "clearWatch">;

type PresenceLockManager = {
  request(
    name: string,
    options: { signal: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void>;
};

function defaultLockManager(): PresenceLockManager | null {
  try {
    return globalThis.navigator?.locks as PresenceLockManager | undefined ?? null;
  } catch {
    return null;
  }
}

function defaultGeolocation(): PresenceGeolocation | null {
  try {
    return globalThis.navigator?.geolocation ?? null;
  } catch {
    return null;
  }
}

export class WebSocketPresenceTransport implements PresenceTransport {
  readonly #apiUrl: string;
  readonly #webSocketConstructor: typeof WebSocket | null;
  readonly #heartbeatIntervalMs: number;
  readonly #reconnectDelayMs: number;
  readonly #lockManager: PresenceLockManager | null;
  readonly #geolocation: PresenceGeolocation | null;

  #active = false;
  #identity: PresenceIdentity | null = null;
  #socket: WebSocket | null = null;
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #lockAbortController: AbortController | null = null;
  #releaseLock: (() => void) | null = null;
  #generation = 0;
  #paused = false;
  #visibilityListener: (() => void) | null = null;
  #location: PresenceLocation | null = null;
  #locationWatchId: number | null = null;
  #locationDisabled = false;

  constructor(
    apiUrl: string,
    webSocketConstructor: typeof WebSocket | null,
    heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
    reconnectDelayMs = RECONNECT_DELAY_MS,
    lockManager: PresenceLockManager | null = defaultLockManager(),
    geolocation: PresenceGeolocation | null = defaultGeolocation(),
  ) {
    this.#apiUrl = apiUrl;
    this.#webSocketConstructor = webSocketConstructor;
    this.#heartbeatIntervalMs = heartbeatIntervalMs;
    this.#reconnectDelayMs = reconnectDelayMs;
    this.#lockManager = lockManager;
    this.#geolocation = geolocation;
  }

  connect(identity: PresenceIdentity): void {
    this.disconnect();
    if (!this.#webSocketConstructor) return;

    this.#active = true;
    this.#identity = identity;
    this.#watchVisibility();
    this.#startPresenceOwner();
  }

  disconnect(): void {
    this.#active = false;
    this.#paused = false;
    this.#unwatchVisibility();
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
    if (socket && socket.readyState < 2) socket.close(1000, "Client stopped");
  }

  #startPresenceOwner(): void {
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
      "ess-auth-o1.presence.v1",
      identity.publicKey,
      identity.employeeId,
      identity.deviceId,
    ].join(":");

    void this.#lockManager.request(
      lockName,
      { signal: abortController.signal },
      async () => {
        if (!this.#active || generation !== this.#generation) return;
        await new Promise<void>((resolve) => {
          this.#releaseLock = resolve;
          this.#openSocket();
        });
        if (generation === this.#generation) this.#releaseLock = null;
      },
    ).catch((error: unknown) => {
      if ((error as { name?: unknown })?.name !== "AbortError") {
        // Presence telemetry must never interrupt client authentication.
      }
    });
  }

  #openSocket(): void {
    if (!this.#active || this.#paused || !this.#webSocketConstructor) return;
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
      this.#sendHeartbeat(socket);
      this.#heartbeatTimer = setInterval(
        () => this.#sendHeartbeat(socket),
        this.#heartbeatIntervalMs,
      );
    };
    socket.onerror = () => {
      // Browsers emit a close event after a connection error; reconnect there.
    };
    socket.onclose = (event) => {
      if (this.#socket === socket) this.#socket = null;
      this.#clearHeartbeatTimer();
      this.#stopLocationWatch();
      if (!this.#active) return;
      if (event.code === 1003 || event.code === 1008) {
        this.#active = false;
        return;
      }
      this.#reconnectTimer = setTimeout(() => {
        this.#reconnectTimer = null;
        this.#openSocket();
      }, this.#reconnectDelayMs);
    };
  }

  #sendHeartbeat(socket: WebSocket): void {
    if (
      this.#socket !== socket
      || socket.readyState !== 1
      || !this.#identity
    ) return;
    socket.send(JSON.stringify({
      type: "heartbeat",
      employee_id: this.#identity.employeeId,
      device_id: this.#identity.deviceId,
      ...(this.#location ?? {}),
    }));
  }

  #startLocationWatch(): void {
    if (
      !this.#active
      || !this.#geolocation
      || this.#locationWatchId !== null
      || this.#locationDisabled
    ) return;
    this.#locationWatchId = this.#geolocation.watchPosition(
      (position) => {
        if (!this.#active) return;
        this.#location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const socket = this.#socket;
        if (socket?.readyState === 1) this.#sendHeartbeat(socket);
      },
      (error) => {
        if (error.code === 1) {
          this.#locationDisabled = true;
          this.#stopLocationWatch();
        }
      },
      {
        enableHighAccuracy: false,
        maximumAge: 15_000,
        timeout: 10_000,
      },
    );
  }

  #stopLocationWatch(): void {
    if (this.#locationWatchId === null || !this.#geolocation) return;
    this.#geolocation.clearWatch(this.#locationWatchId);
    this.#locationWatchId = null;
  }

  #clearHeartbeatTimer(): void {
    if (this.#heartbeatTimer === null) return;
    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
  }

  #watchVisibility(): void {
    const documentRef = globalThis.document;
    if (!documentRef?.addEventListener || this.#visibilityListener) return;
    this.#paused = documentRef.visibilityState === "hidden";
    this.#visibilityListener = () => {
      const hidden = documentRef.visibilityState === "hidden";
      if (hidden === this.#paused) return;
      this.#paused = hidden;
      if (hidden) {
        this.#clearHeartbeatTimer();
        this.#stopLocationWatch();
        const socket = this.#socket;
        this.#socket = null;
        if (socket && socket.readyState < 2) socket.close(1000, "Page hidden");
        return;
      }
      this.#openSocket();
    };
    documentRef.addEventListener("visibilitychange", this.#visibilityListener);
  }

  #unwatchVisibility(): void {
    const documentRef = globalThis.document;
    if (this.#visibilityListener && documentRef?.removeEventListener) {
      documentRef.removeEventListener("visibilitychange", this.#visibilityListener);
    }
    this.#visibilityListener = null;
  }
}
