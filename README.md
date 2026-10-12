# EssAuth SDK

Browser SDK for redirect-based ESS authentication. Its public entry exports
only the default `EssAuth` API. Client applications use three methods only:
`init`, `login`, and `logout`. The SDK handles the ESS
redirect, ticket verification, callback URL cleanup, and session persistence.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module ownership, dependency
rules, and the extension points for future telemetry and heartbeat support.

## Install

Install a tagged release from GitHub:

```bash
npm install github:Posuza/EssAuth#v0.1.0
```

Or load the compiled SDK directly from the ESS CDN:

```js
import EssAuth from "https://cdn.jsdelivr.net/gh/Posuza/EssAuth@1/cdn/v1/index.js";
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

The published `cdn/v1/index.js` is a self-contained browser bundle. Keeping the
CDN entry in one file prevents a floating major-version URL from temporarily
mixing cached internal modules from different compatible releases.

The stable client URL does not change. Create `cdn/v2` only for a future
breaking API version.

## Use

```js
import EssAuth from "@ess/auth-o1";

const auth = await EssAuth.init({
  publicKey: "Ab3dE6gH9jKm2NpQ",
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
    // The time bucket refreshes the floating v1 release at most once every
    // five minutes without requiring a client deployment for each SDK update.
    const sdkVersionBucket = Math.floor(Date.now() / 300_000);
    const sdkUrl =
      `https://cdn.jsdelivr.net/gh/Posuza/EssAuth@release-v1/cdn/v1/index.js?v=${sdkVersionBucket}`;
    const { default: EssAuth } = await import(sdkUrl);

    const auth = await EssAuth.init({
      publicKey: document.body.dataset.publicKey,
    });

    if (!auth.employeeId && !auth.error) auth.login();
    if (auth.error) console.error(auth.error.message);

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
const sdkVersionBucket = Math.floor(Date.now() / 300_000);
const SDK_URL =
  `https://cdn.jsdelivr.net/gh/Posuza/EssAuth@release-v1/cdn/v1/index.js?v=${sdkVersionBucket}`;

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
else if (auth.employeeId) console.log(auth.employeeId);
else auth.login();
```

Components call `loginWithEss()` and `logoutFromEss()` from the shared module.
The client does not parse callback tickets, persist the employee ID, create a
presence WebSocket, or construct an ESS logout request. The SDK owns those
steps. A full page reload is required before an already-open page can execute a
newly published SDK; restarting the client development server is not required.

The five-minute query bucket is recommended for clients that follow the
floating `release-v1` channel. It avoids indefinitely reusing a browser-cached
bundle while still allowing ordinary CDN caching. Clients that require a
reviewed, reproducible dependency should instead pin an immutable release such
as `@v1.2.0` and update that URL as part of their own deployment process.

## Client login flow

Every browser client follows the same integration flow, regardless of whether
it uses plain HTML, React, Vue, or another frontend framework:

1. Import the SDK once and call `EssAuth.init({ publicKey })` during application
   startup.
2. When `auth.employeeId` is present, load the application's employee profile
   and render its authenticated UI.
3. When `auth.error` is present, show a retry or unavailable state. Do not start
   another redirect automatically.
4. When both values are absent, call `auth.login()` to redirect to ESS. ESS
   returns to the same client URL, and the next `EssAuth.init()` verifies and
   removes the one-time ticket.
5. Call `await auth.logout()` before clearing the application's own UI state.
   The SDK removes its stored identity first and treats ESS notification as
   best effort.

### `EssAuth.init(options)`

Call this once whenever the page loads. It automatically:

- validates the public key, current page origin, and backend IP-block status;
- reads an ESS ticket from the callback URL;
- verifies the ticket with the configured public key;
- removes the ticket from the browser URL;
- stores verified employee sessions in shared `localStorage` with a tab-local
  active employee pointer; and
- restores that employee ID on later page loads.

Presence starts when an employee identity has been verified or restored. Web
Locks elect one presence-owning tab for each public application, employee, and
device. Matching tabs remain on standby and automatically take ownership when
the leader closes. Different applications, employees, or devices use separate
connections. Browsers without Web Locks fall back to one connection per tab,
while backend counting still deduplicates the logical clients.

On a later page load, an identity already verified and stored for this client
is restored without making another ESS request. Each local record is scoped by
public key and employee ID, while a small `sessionStorage` pointer selects the
active employee independently in each tab. This allows different employees to
use the same client in separate tabs without overwriting each other. New logins
and returned callback tickets still require ESS, and an explicit callback
rejection still fails closed.

If ESS rejects a callback address, it may return the browser to the registered
application origin with `essauth_error`. `EssAuth.init()` removes that marker
and returns it as `auth.error`, preventing applications that automatically call
`auth.login()` from entering a redirect loop.

The returned object exposes `employeeId` and `error`. The client never reads or
verifies a ticket itself. When preflight validation fails, the SDK returns the
backend error and disables `auth.login()`, so the browser remains on the client
page even if application code tries to start login.

### `auth.login()`

Redirects to ESS with the registered public key and the current page as the
callback URL. A full-page redirect means the employee ID becomes available
from `EssAuth.init()` when ESS returns to the client page.

### `auth.logout()`

Clears the employee ID and the SDK's local session for the current client, then
sends a best-effort logout notification containing the configured public key
and verified employee ID to ESS for audit logging. Consumers do not build or
send that payload themselves. A notification failure never prevents local
logout. This notification does not revoke a server session or token.

## Local testing

The test build connects through the local ESS Caddy reverse proxy:

- API: `https://essauth.localhost/api/v1`
- Login: `https://essauth.localhost/client-auth/login`

Self-hosted and local environments can override either endpoint:

```js
const auth = await EssAuth.init({
  publicKey: "Ab3dE6gH9jKm2NpQ",
  apiUrl: "https://custom-ess.example.com/api/v1",
  loginUrl: "https://custom-ess.example.com/client-auth/login",
});
```

Production CDN builds should set their deployment defaults so ordinary HTML
clients need to provide only `publicKey`.

## Security boundary

The public key is safe to include in browser code. Never put an application
private key or another secret in an HTML page.

The SDK stores verified employee records in `localStorage` and an active
employee pointer in each tab's `sessionStorage`. Logout removes only the active
client and employee record; the browser storage event clears matching tabs and
stops their presence connection. This is useful for client-side identity and
UI state, but it is not a secure authorization session. Applications
protecting sensitive APIs should exchange the ESS result on their backend and
use a secure `HttpOnly` session cookie.
