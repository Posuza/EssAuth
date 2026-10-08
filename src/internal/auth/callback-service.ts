import { EssAuthError } from "../core/errors.js";
import type { RequestTransport } from "../transport/request-transport.js";

type CallbackValidationResponse = {
  valid: boolean;
};

export class CallbackService {
  readonly #publicKey: string;
  readonly #transport: RequestTransport;

  constructor(publicKey: string, transport: RequestTransport) {
    this.#publicKey = publicKey;
    this.#transport = transport;
  }

  async validate(returnTo: string): Promise<void> {
    const result = await this.#transport.post<CallbackValidationResponse>(
      "/client-auth/callback/validate",
      { public_key: this.#publicKey, return_to: returnTo },
      { fallbackError: "ESS client application validation failed." },
    );
    if (result.valid !== true) {
      throw new EssAuthError("ESS returned an invalid callback validation response.", {
        code: "INVALID_CALLBACK_RESPONSE",
        details: result,
      });
    }
  }
}
