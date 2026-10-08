import { IdentityStore } from "../storage/identity-store.js";
import { CallbackService } from "./callback-service.js";
import { TicketService } from "./ticket-service.js";
import type { AuthInitialization } from "../../public/types.js";
export declare function initializeIdentity(identity: IdentityStore, tickets: TicketService, callbacks: CallbackService): Promise<AuthInitialization>;
//# sourceMappingURL=lifecycle.d.ts.map