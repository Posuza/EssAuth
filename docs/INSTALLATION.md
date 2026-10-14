# EssAuth Installation

Use one SDK instance for the entire browser application. ESS assigns each
registered application a 16-character public key. The public key is safe in
frontend code; never place a private key or application secret in the browser.

## Choose a delivery method

### Automatic compatible updates

Use the `@1` semantic-version channel when clients should receive compatible
SDK updates without another client deployment:

```js
const bucket = Math.floor(Date.now() / 300_000);
const sdkUrl =
  `https://cdn.jsdelivr.net/gh/Posuza/EssAuth@release-v1/cdn/v1/index.js?v=${bucket}`;
const { default: EssAuth } = await import(sdkUrl);
```

The query bucket changes every five minutes. It lets a reloaded page discover a
newly published v1 tag while preserving short-term browser caching. A page that
is already open continues running its loaded SDK until the user reloads it. The
frontend development server does not need to restart.

### Pinned CDN release

Use an immutable tag when the client team reviews and deploys every dependency
update explicitly:

```js
import EssAuth from
  "https://cdn.jsdelivr.net/gh/Posuza/EssAuth@v1.3.0/cdn/v1/index.js";
```

Pinned clients update by changing the tag in their own release. Keep old tags
available so existing deployments remain reproducible and can roll back.

### Package installation

Install a tagged GitHub release:

```bash
npm install github:Posuza/EssAuth#v1.3.0
```

Then import the package:

```js
import EssAuth from "@ess/auth-o1";
```

Package installations are bundled with the client application and therefore
update when that client is rebuilt and deployed.

## Required client configuration

1. Register the client application's allowed origin and callback address in
   ESS.
2. Give the frontend only its 16-character public key.
3. Initialize the SDK once during application startup.
4. Use `auth.employeeId` to request the matching application profile.
5. Use `auth.login()` and `auth.logout()` instead of constructing ESS requests.

Continue with the framework guide:

- [Plain HTML](./PLAIN_HTML.md)
- [React and Vite](./REACT_VITE.md)
