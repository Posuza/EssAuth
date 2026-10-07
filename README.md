# EssAuth SDK

Browser SDK for redirect-based ESS authentication. Its public entry exports
only the default `EssAuth` API. Client applications use three methods only:
`init`, `login`, and `logout`. The SDK handles the ESS
redirect, ticket verification, callback URL cleanup, and session persistence.

## Install

Install a tagged release from GitHub:

```bash
npm install github:Posuza/EssAuth#v0.1.0
```

Or load the compiled SDK directly from the ESS CDN:

```js
import EssAuth from "https://cdn.jsdelivr.net/gh/Posuza/EssAuth@main/cdn/v1/index.js";
```

The `cdn/v1` directory is the separately managed client release. Normal SDK
builds update `dist` only and do not change what CDN clients receive. Publish a
tested compatible build deliberately with:

```bash
npm run publish:cdn
git add cdn/v1
git commit -m "Publish SDK CDN v1"
git push
```

The stable client URL does not change. Create `cdn/v2` only for a future
breaking API version.

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
document.querySelector("#logout").onclick = async () => auth.logout();
```

Only `publicKey` is required by the SDK. An application name belongs to the ESS
registry and may also be used by the client UI, but it is not passed to
`EssAuth.init()`.

## Plain HTML

HTML clients may keep the registered key in a data attribute:

```html
<body data-public-key="Ab3dE6gH9jKm2NpQ">
  <button id="login">Sign in with ESS</button>
  <button id="logout">Sign out</button>

  <script type="module">
    import EssAuth from "https://cdn.jsdelivr.net/gh/Posuza/EssAuth@main/cdn/v1/index.js";

    const auth = await EssAuth.init({
      publicKey: document.body.dataset.publicKey,
    });

    document.querySelector("#login").onclick = () => auth.login();
    document.querySelector("#logout").onclick = () => auth.logout();
  </script>
</body>
```

`data-app-name` is optional client display data. ESS identifies the registered
application from `publicKey`.

## React or Vite with the CDN

Store the public key in the application's environment configuration:

```dotenv
VITE_ESS_PUBLIC_KEY=Ab3dE6gH9jKm2NpQ
```

Create one shared SDK module. Do not initialize a separate instance inside each
component or route:

```js
// src/ess-auth.js
const SDK_URL =
  "https://cdn.jsdelivr.net/gh/Posuza/EssAuth@main/cdn/v1/index.js";

let authPromise;

export function getEssAuth() {
  authPromise ??= import(/* @vite-ignore */ SDK_URL).then(({ default: EssAuth }) =>
    EssAuth.init({ publicKey: import.meta.env.VITE_ESS_PUBLIC_KEY }),
  );
  return authPromise;
}

export async function loginWithEss() {
  (await getEssAuth()).login();
}

export async function logoutFromEss() {
  await (await getEssAuth()).logout();
}
```

Initialize it once when the application starts so callback tickets are handled
on every route reload:

```js
const auth = await getEssAuth();

if (auth.error) console.error(auth.error.message);
if (auth.employeeId) console.log(auth.employeeId);
```

Components call `loginWithEss()` and `logoutFromEss()` from the shared module.
React routing on the same origin keeps the SDK identity available in the same
browser tab.

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

Clears the employee ID and the SDK's local session for the current client, then
sends an internal logout notification containing the configured public key and
verified employee ID to ESS for audit logging. Consumers do not build or send
that payload themselves. This notification does not revoke a server session or
token.

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
