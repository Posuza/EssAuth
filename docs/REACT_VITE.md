# React and Vite Integration

Create one shared SDK module for the whole application. Do not initialize the
SDK separately in components, routes, or React effects.

## 1. Configure the public key

Add the registered public key to the client environment:

```dotenv
VITE_ESS_PUBLIC_KEY=Ab3dE6gH9jKm2NpQ
```

Vite exposes `VITE_` variables to the browser. The ESS public key is an
identifier, not a secret.

## 2. Create the shared SDK service

Create `src/services/ess-auth.ts`:

```ts
const bucket = Math.floor(Date.now() / 300_000);
const SDK_URL =
  `https://cdn.jsdelivr.net/gh/Posuza/EssAuth@release-v1/cdn/v1/index.js?v=${bucket}`;

type EssAuthClient = {
  employeeId: string | null;
  error: Error | null;
  login(): void;
  logout(): Promise<void>;
};

let authPromise: Promise<EssAuthClient> | undefined;

export function getEssAuth(): Promise<EssAuthClient> {
  authPromise ??= import(/* @vite-ignore */ SDK_URL).then(
    ({ default: EssAuth }) =>
      EssAuth.init({ publicKey: import.meta.env.VITE_ESS_PUBLIC_KEY }),
  );
  return authPromise;
}

export async function loginWithEss(): Promise<void> {
  (await getEssAuth()).login();
}

export async function logoutFromEss(): Promise<void> {
  await (await getEssAuth()).logout();
}
```

The shared promise also prevents React Strict Mode from creating two SDK
instances during development.

## 3. Initialize authentication at the application boundary

The application shell initializes authentication once and selects the UI from
`employeeId` and `error`:

```tsx
import { useEffect, useState } from "react";
import {
  getEssAuth,
  loginWithEss,
  logoutFromEss,
} from "./services/ess-auth";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; employeeId: string }
  | { status: "error"; message: string };

export default function App() {
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    getEssAuth().then((auth) => {
      if (!active) return;
      if (auth.error) {
        setAuthState({ status: "error", message: auth.error.message });
      } else if (auth.employeeId) {
        setAuthState({
          status: "authenticated",
          employeeId: auth.employeeId,
        });
      } else {
        setAuthState({ status: "anonymous" });
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (authState.status === "loading") return <p>Loading...</p>;
  if (authState.status === "error") {
    return <p>ESS unavailable: {authState.message}</p>;
  }
  if (authState.status === "anonymous") {
    return <button onClick={loginWithEss}>Sign in with ESS</button>;
  }

  return (
    <main>
      <p>Employee: {authState.employeeId}</p>
      <button
        onClick={async () => {
          await logoutFromEss();
          window.location.reload();
        }}
      >
        Sign out
      </button>
    </main>
  );
}
```

After authentication, use `employeeId` to load the employee profile from the
client application's own API. Do not treat a browser-stored employee ID as
authorization for sensitive backend operations.

## Redirect behavior

`auth.login()` sends the current URL to ESS as the callback. When ESS returns,
the application reloads, the shared service initializes again, and the SDK
verifies and removes the one-time ticket automatically. React Router does not
need a special callback route when the registered application URLs permit the
current route.

If the application prefers automatic login, call `loginWithEss()` after the
SDK returns neither an employee ID nor an error. Never redirect automatically
from the error state.

## SDK updates

The five-minute bucket lets a page reload discover compatible updates from
`release-v1` without changing client code or restarting Vite. It does not
replace JavaScript inside a page that is already open.

See [Installation](./INSTALLATION.md) for pinned CDN and package alternatives.
