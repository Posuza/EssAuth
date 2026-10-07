import type { AuthStateListener, ClientLogoutNotificationResult, ClientTicketVerificationResult, EmployeeProfile, EssAuthClientOptions, EssAuthSession, FaceEnrollInput, FaceEnrollResult, FaceVerifyInput, FaceVerifyResult, LoginCredentials, LogoutResponse } from "./types.js";
export declare class EssAuthClient {
    readonly baseUrl: string;
    readonly publicKey: string | null;
    private readonly storage;
    private readonly storageKey;
    private readonly fetcher;
    private readonly listeners;
    private session;
    constructor(options?: EssAuthClientOptions);
    start(): EssAuthSession | null;
    getSession(): EssAuthSession | null;
    getUser(): EmployeeProfile | null;
    isAuthenticated(): boolean;
    onAuthStateChange(listener: AuthStateListener): () => void;
    login(credentials: LoginCredentials): Promise<EssAuthSession>;
    logout(): Promise<LogoutResponse | null>;
    request<T>(path: string, init?: RequestInit): Promise<T>;
    lookupEmployee(employeeCode: string): Promise<EmployeeProfile>;
    getProfileImage(employeeCode: string): Promise<Blob | null>;
    verifyFace(input: FaceVerifyInput): Promise<FaceVerifyResult>;
    enrollFace(input: FaceEnrollInput): Promise<FaceEnrollResult>;
    verifyTicket(ticket: string): Promise<ClientTicketVerificationResult>;
    notifyClientLogout(employeeId: string): Promise<ClientLogoutNotificationResult>;
    private setSession;
    private url;
    private send;
    private json;
}
//# sourceMappingURL=client.d.ts.map