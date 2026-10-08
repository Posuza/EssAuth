# Internal SDK boundaries

These modules are implementation details. Client applications import only the
package root and use `EssAuth.init()`, `auth.login()`, and `auth.logout()`.

- `auth/` owns redirect behavior, ticket/logout endpoint contracts, and the
  initialization lifecycle.
- `core/` validates SDK configuration and normalizes internal errors.
- `storage/` owns browser-storage fallback and the per-application identity.
- `transport/` defines separate request and presence contracts. Fetch handles
  request/response calls; WebSocket handles test client-presence heartbeats.

Future telemetry should be added as its own feature folder and coordinated by
`auth/lifecycle.ts`. Current presence heartbeats identify only the registered
application and must not be used as user authentication. Authenticated session
heartbeats require an opaque server session identifier. IP and OS policy
enforcement belongs to ESS/Caddy, not to browser SDK modules.
