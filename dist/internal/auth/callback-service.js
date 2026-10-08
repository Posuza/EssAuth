import { EssAuthError } from "../core/errors.js";
export class CallbackService {
    #publicKey;
    #transport;
    constructor(publicKey, transport) {
        this.#publicKey = publicKey;
        this.#transport = transport;
    }
    async validate(returnTo) {
        const result = await this.#transport.post("/client-auth/callback/validate", { public_key: this.#publicKey, return_to: returnTo }, { fallbackError: "ESS client application validation failed." });
        if (result.valid !== true) {
            throw new EssAuthError("ESS returned an invalid callback validation response.", {
                code: "INVALID_CALLBACK_RESPONSE",
                details: result,
            });
        }
    }
}
//# sourceMappingURL=callback-service.js.map