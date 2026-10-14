# EssAuth SDK

Browser SDK for redirect-based ESS authentication. Its public entry exports
only the default `EssAuth` API. Client applications use three methods only:
`init`, `login`, and `logout`. The SDK handles the ESS
redirect, ticket verification, callback URL cleanup, and session persistence.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module ownership, dependency
rules, and the extension points for future telemetry and heartbeat support.

## Install

Choose the integration that matches the client application:

- [Installation and CDN options](./docs/INSTALLATION.md)
- [Plain HTML integration](./docs/PLAIN_HTML.md)
- [React and Vite integration](./docs/REACT_VITE.md)

For an automatic CDN channel, client applications load the latest compatible
semantic v1 release with a five-minute URL bucket:

```js
const bucket = Math.floor(Date.now() / 300_000);
const sdkUrl =
  `https://cdn.jsdelivr.net/gh/Posuza/EssAuth@1/cdn/v1/index.js?v=${bucket}`;
const { default: EssAuth } = await import(sdkUrl);
```

This one-time client loader allows compatible `v1.x.x` SDK updates without
changing or restarting the client application server. Publish each update as a
new semantic version tag; never replace an existing tag. An already-open page
must reload before it can execute newly published JavaScript.

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

The client does not parse callback tickets, persist the SDK employee identity,
create a presence WebSocket, or construct an ESS logout request. The SDK owns
those operations.

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

When presence monitoring is enabled, the presence-owning tab also requests
browser location permission. If the user approves, heartbeats include the
latest live `latitude` and `longitude` from `watchPosition`. Location watching
stops when monitoring is disabled or the SDK disconnects. Background tabs stay
connected so the live monitor continues to represent authenticated clients.
Location denial, timeout, or lack of browser support does not interrupt
authentication or presence. ESS keeps only the latest coordinates in its live
in-memory monitor; it does not write heartbeat locations to the database.

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

Self-hosted and local environments configure one ESS base URL. The SDK derives
the API and hosted login paths internally:

```js
const auth = await EssAuth.init({
  publicKey: "Ab3dE6gH9jKm2NpQ",
  baseUrl: "https://custom-ess.example.com",
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
