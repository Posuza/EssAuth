const DEVICE_STORAGE_PREFIX = "ess-auth-o1.device.v1";
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
        if (stored)
            return stored;
        const created = randomId();
        globalThis.localStorage?.setItem(key, created);
        return created;
    }
    catch {
        return randomId();
    }
}
export function createPresenceIdentity(publicKey, employeeId) {
    return {
        publicKey,
        employeeId,
        deviceId: deviceId(publicKey),
    };
}
//# sourceMappingURL=presence-identity.js.map