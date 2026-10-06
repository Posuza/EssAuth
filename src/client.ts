import { connectionError, EssAuthError, responseError } from "./errors.js";
import { defaultStorage, MemoryStorage } from "./storage.js";
import type {
  AuthStateListener,
  EmployeeProfile,
  EssAuthClientOptions,
  EssAuthSession,
  FaceEnrollInput,
  FaceEnrollResult,
  FaceVerifyInput,
  FaceVerifyResult,
  LoginCredentials,
  LoginResponse,
  LogoutResponse,
  StorageLike,
} from "./types.js";

const DEFAULT_STORAGE_KEY = "ess-auth-o1.session.v1";
const EMPLOYEE_CODE = /^[A-Za-z0-9]{6}$/;

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) throw new EssAuthError("baseUrl cannot be empty.", { code: "INVALID_BASE_URL" });
  return normalized;
}

function normalizeEmployeeCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!EMPLOYEE_CODE.test(code)) {
    throw new EssAuthError("Employee code must contain exactly 6 letters or numbers.", {
      code: "INVALID_EMPLOYEE_CODE",
    });
  }
  return code;
}

function isEmployeeProfile(value: unknown): value is EmployeeProfile {
  if (!value || typeof value !== "object") return false;
  const employee = value as Partial<EmployeeProfile>;
  return typeof employee.employee_code === "string"
    && typeof employee.first_name === "string"
    && typeof employee.last_name === "string"
    && typeof employee.role_name === "string";
}

function isSession(value: unknown): value is EssAuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<EssAuthSession>;
  return session.version === 1
    && session.authMethod === "employee-code"
    && typeof session.authenticatedAt === "string"
    && isEmployeeProfile(session.employee);
}

export class EssAuthClient {
  readonly baseUrl: string;
  private readonly storage: StorageLike;
  private readonly storageKey: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly listeners = new Set<AuthStateListener>();
  private session: EssAuthSession | null = null;

  constructor(options: EssAuthClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "/api/v1");
    this.storage = options.storage === null
      ? new MemoryStorage()
      : options.storage ?? defaultStorage();
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    const fetcher = options.fetch ?? globalThis.fetch;
    if (typeof fetcher !== "function") {
      throw new EssAuthError("A fetch implementation is required.", { code: "FETCH_REQUIRED" });
    }
    this.fetcher = fetcher.bind(globalThis);
  }

  start(): EssAuthSession | null {
    const stored = this.storage.getItem(this.storageKey);
    if (!stored) return null;
    try {
      const session: unknown = JSON.parse(stored);
      if (!isSession(session)) throw new Error("Invalid session shape");
      this.session = session;
      return session;
    } catch {
      this.storage.removeItem(this.storageKey);
      return null;
    }
  }

  getSession(): EssAuthSession | null {
    return this.session;
  }

  getUser(): EmployeeProfile | null {
    return this.session?.employee ?? null;
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }

  onAuthStateChange(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async login(credentials: LoginCredentials): Promise<EssAuthSession> {
    const employeeCode = normalizeEmployeeCode(credentials.employeeCode);
    const result = await this.json<LoginResponse>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_code: employeeCode, password: credentials.password }),
    }, false, "Login failed.");

    if (!isEmployeeProfile(result.employee)) {
      throw new EssAuthError("The server returned an incomplete employee profile.", {
        code: "INVALID_LOGIN_RESPONSE",
        details: result,
      });
    }

    const session: EssAuthSession = {
      version: 1,
      employee: result.employee,
      authenticatedAt: new Date().toISOString(),
      authMethod: "employee-code",
    };
    this.setSession(session);
    return session;
  }

  async logout(): Promise<LogoutResponse | null> {
    const employeeCode = this.session?.employee.employee_code;
    if (!employeeCode) return null;
    try {
      return await this.json<LogoutResponse>(
        `/auth/logout?employee_code=${encodeURIComponent(employeeCode)}`,
        { method: "POST" },
        false,
        "Logout failed.",
      );
    } finally {
      this.setSession(null);
    }
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.json<T>(path, init, true, "ESS request failed.");
  }

  async lookupEmployee(employeeCode: string): Promise<EmployeeProfile> {
    const code = normalizeEmployeeCode(employeeCode);
    return this.json<EmployeeProfile>(
      `/faces/employees/${encodeURIComponent(code)}`,
      { cache: "no-store" },
      false,
      "Employee lookup failed.",
    );
  }

  async getProfileImage(employeeCode: string): Promise<Blob | null> {
    const code = normalizeEmployeeCode(employeeCode);
    const response = await this.send(
      `/faces/${encodeURIComponent(code)}/profile-image`,
      { cache: "no-store" },
      false,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw await responseError(response, "Profile image request failed.");
    return response.blob();
  }

  async verifyFace(input: FaceVerifyInput): Promise<FaceVerifyResult> {
    const employeeCode = normalizeEmployeeCode(input.employeeCode);
    return this.json<FaceVerifyResult>("/faces/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_code: employeeCode, image_data_url: input.imageDataUrl }),
    }, false, "Face verification failed.");
  }

  async enrollFace(input: FaceEnrollInput): Promise<FaceEnrollResult> {
    const employeeCode = normalizeEmployeeCode(input.employeeCode);
    const body = {
      employee_code: employeeCode,
      image_data_url: input.imageDataUrl,
      ...(input.createdBy !== undefined ? { created_by: input.createdBy } : {}),
    };
    return this.json<FaceEnrollResult>("/faces/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, true, "Face enrollment failed.");
  }

  private setSession(session: EssAuthSession | null): void {
    this.session = session;
    if (session) this.storage.setItem(this.storageKey, JSON.stringify(session));
    else this.storage.removeItem(this.storageKey);
    for (const listener of this.listeners) listener(session);
  }

  private url(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      throw new EssAuthError("request() only accepts paths for the configured ESS API.", {
        code: "CROSS_ORIGIN_REQUEST",
      });
    }
    return `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
  }

  private async send(path: string, init: RequestInit, authenticated: boolean): Promise<Response> {
    const headers = new Headers(init.headers);
    if (authenticated) {
      const employeeCode = this.session?.employee.employee_code;
      if (!employeeCode) {
        throw new EssAuthError("An authenticated ESS session is required.", {
          code: "AUTHENTICATION_REQUIRED",
        });
      }
      headers.set("X-Employee-Code", employeeCode);
    }
    try {
      return await this.fetcher(this.url(path), { ...init, headers });
    } catch (error) {
      throw connectionError(error);
    }
  }

  private async json<T>(
    path: string,
    init: RequestInit,
    authenticated: boolean,
    fallbackError: string,
  ): Promise<T> {
    const response = await this.send(path, init, authenticated);
    if (!response.ok) throw await responseError(response, fallbackError);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}
