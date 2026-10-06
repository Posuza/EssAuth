# EssAuth1.0 SDK

Standalone browser SDK for the current ESS backend. It covers employee login,
session persistence, identity-aware API requests, and face profile operations.
It does not modify or depend on the existing frontend application.

## Install

Install the latest code directly from GitHub:

```bash
npm install github:Posuza/EssAuth1.0
```

For a reproducible installation, use a tagged release:

```bash
npm install github:Posuza/EssAuth1.0#v0.1.0
```

The package has no runtime dependencies. The repository includes the compiled
`dist` output, while the `prepare` script rebuilds it when npm installs from Git.

## Start and log in

```ts
import { getClient, getUser, login, logout, start } from "@ess/auth-o1";

start({ baseUrl: "http://127.0.0.1:8000/api/v1" });

await login({ employeeCode: "680708", password: "123456" });
console.log(getUser());

const directory = await getClient().request("/employee-directory");
await logout();
```

`request()` automatically adds the backend's current `X-Employee-Code` header.
It accepts only paths belonging to the configured API, preventing identity
headers from being sent to another origin.

## Use an isolated client

```ts
import { EssAuthClient } from "@ess/auth-o1";

const auth = new EssAuthClient({ baseUrl: "/api/v1" });
auth.start();

await auth.login({ employeeCode: "680708", password: "123456" });

const result = await auth.verifyFace({
  employeeCode: "680708",
  imageDataUrl: "data:image/jpeg;base64,...",
});
```

Available face methods are `lookupEmployee`, `getProfileImage`, `verifyFace`,
and `enrollFace`. All public methods and response objects are fully typed.
Pass `storage: null` to keep the session in memory instead of session storage.

## Current authentication boundary

The current backend login response contains an employee profile, but no access
token, refresh token, cookie, or session-verification endpoint. EssAuthO1 stores
that profile in `sessionStorage` and uses the server's existing employee-code
identity header for protected requests. This preserves the current behavior but
is not a cryptographically verifiable session.

When the backend adds OAuth authorization and token endpoints, the transport can
move to bearer tokens without changing the SDK's `start`, `login`, `logout`,
`getUser`, or `request` entry points.

## Development

```bash
npm install
npm test
npm run check
```
