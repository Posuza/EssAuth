import { connectionError, responseError } from "./errors.js";

export class JsonTransport {
  readonly #baseUrl: string;
  readonly #fetcher: typeof globalThis.fetch;

  constructor(baseUrl: string, fetcher: typeof globalThis.fetch) {
    this.#baseUrl = baseUrl;
    this.#fetcher = fetcher.bind(globalThis);
  }

  async post<T>(
    path: string,
    body: Record<string, string>,
    fallbackError: string,
    keepalive = false,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetcher(`${this.#baseUrl}/${path.replace(/^\/+/, "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive,
      });
    } catch (error) {
      throw connectionError(error);
    }

    if (!response.ok) throw await responseError(response, fallbackError);
    return response.json() as Promise<T>;
  }
}
