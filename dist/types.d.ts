export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export interface EmployeeProfile {
    employee_code: string;
    first_name: string;
    last_name: string;
    email: string | null;
    role_name: string;
    name_prefix: string;
    field_id: number | null;
    field_name: string | null;
    position_id: number | null;
    position_name: string;
    department_id: number | null;
    department_name: string | null;
    division_id: number | null;
    division_name: string | null;
    route_id: number | null;
    route_name: string | null;
    has_face_profile: boolean;
}
export interface LoginCredentials {
    employeeCode: string;
    password: string;
}
export interface LoginResponse {
    employee: EmployeeProfile;
    message: string;
}
export interface LogoutResponse {
    message: string;
    tokens_revoked: number;
}
export interface EssAuthSession {
    version: 1;
    employee: EmployeeProfile;
    authenticatedAt: string;
    authMethod: "employee-code";
}
export interface FaceVerifyInput {
    employeeCode: string;
    imageDataUrl: string;
}
export interface FaceVerifyResult {
    is_match: boolean;
    message: string;
    score: number | null;
    threshold: number | null;
}
export interface FaceEnrollInput extends FaceVerifyInput {
    createdBy?: string | null;
}
export interface FaceEnrollResult {
    employee_code: string;
    profile_image_path: string;
    profile_image_updated_at: string | null;
}
export type AuthStateListener = (session: EssAuthSession | null) => void;
export interface EssAuthClientOptions {
    /** API root including the version prefix. Defaults to `/api/v1`. */
    baseUrl?: string;
    /** Storage used for the session. Defaults to sessionStorage; null keeps it in memory. */
    storage?: StorageLike | null;
    storageKey?: string;
    /** Injectable transport for tests, SSR, and non-browser runtimes. */
    fetch?: typeof globalThis.fetch;
}
//# sourceMappingURL=types.d.ts.map