# EssAuth Installation

Use one SDK instance for the entire browser application. ESS assigns each
registered application a 16-character public key. The public key is safe in
frontend code; never place a private key or application secret in the browser.

## Load the hosted SDK

Client applications load the SDK from the ESS deployment:

```js
const SDK_URL = "https://ess-faceregister.esscentor.com/sdk/v1/index.js";
const { default: EssAuth } = await import(SDK_URL);
```

The fixed URL serves the SDK version currently deployed by ESS. Client source
code does not change when ESS updates the SDK. A page that is already open
continues running its loaded version until the user reloads it.

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
