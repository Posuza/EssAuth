const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 5_000;
const LOCATION_REFRESH_MS = 5 * 60_000;
function defaultLockManager() {
    try {
        return globalThis.navigator?.locks ?? null;
    }
    catch {
        return null;
    }
}
function defaultGeolocation() {
    try {
        return globalThis.navigator?.geolocation ?? null;
    }
    catch {
        return null;
    }
}
export class WebSocketPresenceTransport {
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
    #reconnectTimer = null;
    #lockAbortController = null;
    #releaseLock = null;
    #generation = 0;
    #paused = false;
    #visibilityListener = null;
    #location = null;
    #lastLocationRequestAt = 0;
    #locationRequestPending = false;
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
        this.disconnect();
        if (!this.#webSocketConstructor)
            return;
        this.#active = true;
        this.#identity = identity;
        this.#watchVisibility();
        this.#startPresenceOwner();
    }
    disconnect() {
        this.#active = false;
        this.#paused = false;
        this.#unwatchVisibility();
        this.#generation++;
        this.#releaseLock?.();
        this.#releaseLock = null;
        this.#lockAbortController?.abort();
        this.#lockAbortController = null;
        this.#clearHeartbeatTimer();
        if (this.#reconnectTimer !== null) {
            clearTimeout(this.#reconnectTimer);
            this.#reconnectTimer = null;
        }
        const socket = this.#socket;
        this.#socket = null;
        this.#identity = null;
        this.#location = null;
        this.#lastLocationRequestAt = 0;
        this.#locationRequestPending = false;
        this.#locationDisabled = false;
        if (socket && socket.readyState < 2)
            socket.close(1000, "Client stopped");
    }
    #startPresenceOwner() {
        if (!this.#active || !this.#identity)
            return;
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
        void this.#lockManager.request(lockName, { signal: abortController.signal }, async () => {
            if (!this.#active || generation !== this.#generation)
                return;
            await new Promise((resolve) => {
                this.#releaseLock = resolve;
                this.#openSocket();
            });
            if (generation === this.#generation)
                this.#releaseLock = null;
        }).catch((error) => {
            if (error?.name !== "AbortError") {
                // Presence telemetry must never interrupt client authentication.
            }
        });
    }
    #openSocket() {
        if (!this.#active || this.#paused || !this.#webSocketConstructor)
            return;
        if (this.#socket && this.#socket.readyState < 2)
            return;
        const url = new URL(this.#apiUrl);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.pathname = `${url.pathname.replace(/\/+$/, "")}/client-auth/presence/ws`;
        url.search = "";
        if (!this.#identity)
            return;
        this.#refreshLocation();
        url.searchParams.set("public_key", this.#identity.publicKey);
        url.searchParams.set("employee_id", this.#identity.employeeId);
        url.searchParams.set("device_id", this.#identity.deviceId);
        const socket = new this.#webSocketConstructor(url);
        this.#socket = socket;
        socket.onopen = () => {
            if (!this.#active || this.#socket !== socket)
                return;
            this.#sendHeartbeat(socket);
            this.#heartbeatTimer = setInterval(() => this.#sendHeartbeat(socket), this.#heartbeatIntervalMs);
        };
        socket.onerror = () => {
            // Browsers emit a close event after a connection error; reconnect there.
        };
        socket.onclose = (event) => {
            if (this.#socket === socket)
                this.#socket = null;
            this.#clearHeartbeatTimer();
            if (!this.#active)
                return;
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
    #sendHeartbeat(socket) {
        if (this.#socket !== socket
            || socket.readyState !== 1
            || !this.#identity)
            return;
        this.#refreshLocation();
        socket.send(JSON.stringify({
            type: "heartbeat",
            employee_id: this.#identity.employeeId,
            device_id: this.#identity.deviceId,
            ...(this.#location ?? {}),
        }));
    }
    #refreshLocation() {
        if (!this.#active
            || !this.#geolocation
            || this.#locationRequestPending
            || this.#locationDisabled)
            return;
        const now = Date.now();
        if (this.#lastLocationRequestAt && now - this.#lastLocationRequestAt < LOCATION_REFRESH_MS)
            return;
        this.#lastLocationRequestAt = now;
        this.#locationRequestPending = true;
        this.#geolocation.getCurrentPosition((position) => {
            this.#locationRequestPending = false;
            if (!this.#active)
                return;
            this.#location = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
            };
            const socket = this.#socket;
            if (socket?.readyState === 1)
                this.#sendHeartbeat(socket);
        }, (error) => {
            this.#locationRequestPending = false;
            if (error.code === 1)
                this.#locationDisabled = true;
        }, {
            enableHighAccuracy: false,
            maximumAge: LOCATION_REFRESH_MS,
            timeout: 10_000,
        });
    }
    #clearHeartbeatTimer() {
        if (this.#heartbeatTimer === null)
            return;
        clearInterval(this.#heartbeatTimer);
        this.#heartbeatTimer = null;
    }
    #watchVisibility() {
        const documentRef = globalThis.document;
        if (!documentRef?.addEventListener || this.#visibilityListener)
            return;
        this.#paused = documentRef.visibilityState === "hidden";
        this.#visibilityListener = () => {
            const hidden = documentRef.visibilityState === "hidden";
            if (hidden === this.#paused)
                return;
            this.#paused = hidden;
            if (hidden) {
                this.#clearHeartbeatTimer();
                const socket = this.#socket;
                this.#socket = null;
                if (socket && socket.readyState < 2)
                    socket.close(1000, "Page hidden");
                return;
            }
            this.#openSocket();
        };
        documentRef.addEventListener("visibilitychange", this.#visibilityListener);
    }
    #unwatchVisibility() {
        const documentRef = globalThis.document;
        if (this.#visibilityListener && documentRef?.removeEventListener) {
            documentRef.removeEventListener("visibilitychange", this.#visibilityListener);
        }
        this.#visibilityListener = null;
    }
}
//# sourceMappingURL=websocket-presence-transport.js.map