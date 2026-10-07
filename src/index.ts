export { EssAuth, EssAuth as default } from "./browser-auth.js";
export { EssAuthClient } from "./client.js";
export { EssAuthError } from "./errors.js";
export { MemoryStorage } from "./storage.js";
export { getClient, getSession, getUser, login, logout, start, verifyTicket } from "./singleton.js";
export type { EssAuthInitOptions } from "./browser-auth.js";
export type {
  AuthStateListener,
  ClientLogoutNotificationResult,
  ClientTicketVerificationResult,
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
