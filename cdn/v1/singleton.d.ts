import { EssAuthClient } from "./client.js";
import type { EssAuthClientOptions, LoginCredentials } from "./types.js";
export declare function start(options?: EssAuthClientOptions): EssAuthClient;
export declare function getClient(): EssAuthClient;
export declare function login(credentials: LoginCredentials): Promise<import("./types.js").EssAuthSession>;
export declare function logout(): Promise<import("./types.js").LogoutResponse | null>;
export declare function getUser(): import("./types.js").EmployeeProfile | null;
export declare function getSession(): import("./types.js").EssAuthSession | null;
export declare function verifyTicket(ticket: string): Promise<import("./types.js").ClientTicketVerificationResult>;
//# sourceMappingURL=singleton.d.ts.map