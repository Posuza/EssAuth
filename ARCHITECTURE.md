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
    ├── auth/
    │   ├── lifecycle.ts       # initialization coordinator
    │   ├── redirect.ts        # browser redirects and callback cleanup
    │   └── ticket-service.ts  # ESS ticket and logout endpoint contracts
    ├── core/
    │   ├── config.ts          # validated runtime configuration
    │   └── errors.ts          # normalized internal errors
    ├── storage/
    │   ├── browser-storage.ts # browser storage fallback
    │   └── identity-store.ts  # per-app sessionStorage identity
    └── transport/
        ├── presence-transport.ts # live client-presence capability
        ├── request-transport.ts # protocol-independent request contract
        ├── fetch-transport.ts   # Fetch-based HTTP implementation
        └── websocket-presence-transport.ts # heartbeat connection
```

## Dependency rules

1. `index.ts` exports only the default `EssAuth` facade and its init type.
2. `public/ess-auth.ts` coordinates internal services but contains no raw HTTP.
3. Only `transport/fetch-transport.ts` calls `fetch`.
4. Only `auth/ticket-service.ts` knows backend endpoint paths and payload
   shapes.
5. Only `storage/identity-store.ts` reads or writes the stored employee
   identity.
6. Client applications never receive tickets, private keys, or internal
   service instances.
7. A compatible `cdn/v1` release cannot add another public method or export.
8. Feature services depend on `RequestTransport`, so transport implementations
   can change without changing the public facade.
9. WebSocket presence is an operational signal only. It must never authorize a
   user or replace ticket verification.

## Future features

Add telemetry only when its backend event contract exists. Put event mapping in
an `internal/telemetry/` feature folder, send through `RequestTransport`, and
trigger it from `auth/lifecycle.ts` or the facade. It must remain invisible to
integrators.

The presence WebSocket reports that a registered client application is online.
It sends only the public application key during connection and a small
heartbeat message afterward. The backend observes network metadata from the
connection. Presence does not receive an employee ID and is not authentication.

Any future authenticated session heartbeat still requires an opaque server
session identifier. It must use a separate feature contract and must not change
`EssAuth.init()`, `auth.login()`, or `auth.logout()`.

IP blocking, operating-system policy, rate limits, allowed callback URLs, and
application activation are server or reverse-proxy responsibilities. Browser
signals are untrusted inputs and must never be the enforcement boundary.

## Release safety

`npm run build` removes `dist` before compiling so deleted internal modules do
not survive as stale artifacts. `npm run publish:cdn` then replaces `cdn/v1`
with that clean build. Run `npm run check` and `npm test` before publishing.
