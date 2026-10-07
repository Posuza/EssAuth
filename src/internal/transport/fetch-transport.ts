import { connectionError, responseError } from "../core/errors.js";
import type { RequestOptions, RequestTransport } from "./request-transport.js";

export class FetchTransport implements RequestTransport {
  readonly #baseUrl: string;
  readonly #fetcher: typeof globalThis.fetch;

  constructor(baseUrl: string, fetcher: typeof globalThis.fetch) {
    this.#baseUrl = baseUrl;
    this.#fetcher = fetcher.bind(globalThis);
  }

  async post<T>(
    path: string,
    body: Record<string, string>,
    options: RequestOptions,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetcher(`${this.#baseUrl}/${path.replace(/^\/+/, "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: options.keepalive ?? false,
      });
    } catch (error) {
      throw connectionError(error);
    }

    if (!response.ok) {
      throw await responseError(response, options.fallbackError);
    }
    return response.json() as Promise<T>;
  }
}
