# SDK architecture

EssAuth is a redirect-authentication SDK with one intentionally small public
facade. Client applications import the package root; they never import from
`internal` paths.

```text
src/
├── index.ts
├── public/
│   ├── ess-auth.ts          # init, login, logout
│   └── types.ts             # public initialization contract
└── internal/
    ├── config.ts            # validated runtime configuration
    ├── redirect.ts          # browser redirects and callback cleanup
    ├── transport.ts         # HTTP boundary
    ├── ticket.ts            # ESS endpoint contracts
    ├── identity-storage.ts  # per-app sessionStorage identity
    ├── lifecycle.ts         # initialization coordinator
    ├── storage.ts           # browser storage fallback
    └── errors.ts            # normalized internal errors
```

## Dependency rules

1. `index.ts` exports only the default `EssAuth` facade and its init type.
2. `public/ess-auth.ts` coordinates internal services but contains no raw HTTP.
3. Only `transport.ts` calls `fetch`.
4. Only `ticket.ts` knows backend endpoint paths and payload shapes.
5. Only `identity-storage.ts` reads or writes the stored employee identity.
6. Client applications never receive tickets, private keys, or internal
   service instances.
7. A compatible `cdn/v1` release cannot add another public method or export.

## Future features

Add telemetry only when its backend event contract exists. Put network event
mapping in `internal/telemetry.ts`, send through `transport.ts`, and trigger it
from `lifecycle.ts` or the facade. It must remain invisible to integrators.

Add heartbeat support only after ticket verification returns an opaque server
session identifier. Store that identifier internally, place scheduling in
`internal/heartbeat.ts`, and stop it during logout. The public logout call must
remain `auth.logout()` with no arguments.

IP blocking, operating-system policy, rate limits, allowed callback URLs, and
application activation are server or reverse-proxy responsibilities. Browser
signals are untrusted inputs and must never be the enforcement boundary.

## Release safety

`npm run build` removes `dist` before compiling so deleted internal modules do
not survive as stale artifacts. `npm run publish:cdn` then replaces `cdn/v1`
with that clean build. Run `npm run check` and `npm test` before publishing.
