function detailMessage(payload) {
    if (!payload || typeof payload !== "object")
        return null;
    const detail = payload.detail;
    if (typeof detail === "string" && detail.trim())
        return detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        const message = detail.message;
        if (typeof message === "string" && message.trim())
            return message;
    }
    if (Array.isArray(detail)) {
        const first = detail[0];
        if (first && typeof first === "object") {
            const message = first.msg;
            if (typeof message === "string" && message.trim())
                return message;
        }
    }
    return null;
}
export class EssAuthError extends Error {
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
}
export async function responseError(response, fallback) {
    const payload = await response.json().catch(() => null);
    return new EssAuthError(detailMessage(payload) ?? fallback, {
        code: `HTTP_${response.status}`,
        status: response.status,
        details: payload,
    });
}
export function connectionError(cause) {
    if (cause instanceof EssAuthError)
        return cause;
    return new EssAuthError("Unable to connect to the ESS server.", {
        code: "NETWORK_ERROR",
        details: cause,
    });
}
//# sourceMappingURL=errors.js.map