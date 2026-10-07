# EssAuth SDK

Browser SDK for redirect-based ESS authentication. Client applications use
three methods only: `init`, `login`, and `logout`. The SDK handles the ESS
redirect, ticket verification, callback URL cleanup, and session persistence.

## Install

Install a tagged release from GitHub:

```bash
npm install github:Posuza/EssAuth#v0.1.0
```

Or load the compiled SDK directly from the ESS CDN:

```js
import EssAuth from "https://cdn.jsdelivr.net/gh/Posuza/EssAuth@main/dist/index.js";
```

jsDelivr serves the complete compiled `dist` directory directly from GitHub.
The stable `@main` URL follows compatible SDK updates without requiring clients
to change their import URL.

## Use

```js
import EssAuth from "@ess/auth-o1";

const auth = await EssAuth.init({
  publicKey: "your-registered-public-key",
});

if (auth.error) {
  console.error(auth.error.message);
}

if (auth.employeeId) {
  console.log("Authenticated employee:", auth.employeeId);
}

document.querySelector("#login").onclick = () => auth.login();
document.querySelector("#logout").onclick = () => auth.logout();
```

### `EssAuth.init(options)`

Call this once whenever the page loads. It automatically:

- reads an ESS ticket from the callback URL;
- verifies the ticket with the configured public key;
- removes the ticket from the browser URL;
- stores the verified employee ID in `sessionStorage`; and
- restores that employee ID on later page loads.

The returned object exposes `employeeId` and `error`. The client never reads or
verifies a ticket itself.

### `auth.login()`

Redirects to ESS with the registered public key and the current page as the
callback URL. A full-page redirect means the employee ID becomes available
from `EssAuth.init()` when ESS returns to the client page.

### `auth.logout()`

Clears the employee ID and the SDK's local session for the current client.

## Local testing

The test build connects through the local ESS Caddy reverse proxy:

- API: `https://essauth.localhost/api/v1`
- Login: `https://essauth.localhost/client-auth/login`

Self-hosted and local environments can override either endpoint:

```js
const auth = await EssAuth.init({
  publicKey: "your-registered-public-key",
  apiUrl: "https://custom-ess.example.com/api/v1",
  loginUrl: "https://custom-ess.example.com/client-auth/login",
});
```

Production CDN builds should set their deployment defaults so ordinary HTML
clients need to provide only `publicKey`.

## Security boundary

The public key is safe to include in browser code. Never put an application
private key or another secret in an HTML page.

The SDK stores only a verified employee ID in `sessionStorage`. This is useful
for client-side identity and UI state, but it is not a secure authorization
session. Applications protecting sensitive APIs should exchange the ESS result
on their backend and use a secure `HttpOnly` session cookie.
