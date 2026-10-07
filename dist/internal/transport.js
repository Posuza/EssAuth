import { connectionError, responseError } from "./errors.js";
export class JsonTransport {
    #baseUrl;
    #fetcher;
    constructor(baseUrl, fetcher) {
        this.#baseUrl = baseUrl;
        this.#fetcher = fetcher.bind(globalThis);
    }
    async post(path, body, fallbackError, keepalive = false) {
        let response;
        try {
            response = await this.#fetcher(`${this.#baseUrl}/${path.replace(/^\/+/, "")}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                keepalive,
            });
        }
        catch (error) {
            throw connectionError(error);
        }
        if (!response.ok)
            throw await responseError(response, fallbackError);
        return response.json();
    }
}
//# sourceMappingURL=transport.js.map