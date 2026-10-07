# Internal SDK boundaries

These modules are implementation details. Client applications import only the
package root and use `EssAuth.init()`, `auth.login()`, and `auth.logout()`.

- `auth/` owns redirect behavior, ticket/logout endpoint contracts, and the
  initialization lifecycle.
- `core/` validates SDK configuration and normalizes internal errors.
- `storage/` owns browser-storage fallback and the per-application identity.
- `transport/` defines the request contract and contains its Fetch
  implementation. Endpoint services depend on the contract, not on Fetch.

Future telemetry should be added as its own feature folder and coordinated by
`auth/lifecycle.ts`. Heartbeats should be added only after ESS provides an
opaque server session identifier; they belong in a separate feature folder and
must not change the public facade. IP and OS policy enforcement belongs to
ESS/Caddy, not to browser SDK modules.
