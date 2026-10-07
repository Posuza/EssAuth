import { connectionError, responseError } from "../core/errors.js";
export class FetchTransport {
    #baseUrl;
    #fetcher;
    constructor(baseUrl, fetcher) {
        this.#baseUrl = baseUrl;
        this.#fetcher = fetcher.bind(globalThis);
    }
    async post(path, body, options) {
        let response;
        try {
            response = await this.#fetcher(`${this.#baseUrl}/${path.replace(/^\/+/, "")}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                keepalive: options.keepalive ?? false,
            });
        }
        catch (error) {
            throw connectionError(error);
        }
        if (!response.ok) {
            throw await responseError(response, options.fallbackError);
        }
        return response.json();
    }
}
//# sourceMappingURL=fetch-transport.js.map