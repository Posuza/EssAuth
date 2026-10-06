function detailMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (first && typeof first === "object") {
      const message = (first as { msg?: unknown }).msg;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return null;
}

export class EssAuthError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details: unknown;

  constructor(message: string, options: { code?: string; status?: number | null; details?: unknown } = {}) {
    super(message);
    this.name = "EssAuthError";
    this.code = options.code ?? "ESS_AUTH_ERROR";
    this.status = options.status ?? null;
    this.details = options.details;
  }
}

export async function responseError(response: Response, fallback: string): Promise<EssAuthError> {
  const payload: unknown = await response.json().catch(() => null);
  return new EssAuthError(detailMessage(payload) ?? fallback, {
    code: `HTTP_${response.status}`,
    status: response.status,
    details: payload,
  });
}

export function connectionError(cause: unknown): EssAuthError {
  if (cause instanceof EssAuthError) return cause;
  return new EssAuthError("Unable to connect to the ESS server.", {
    code: "NETWORK_ERROR",
    details: cause,
  });
}
