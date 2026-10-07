# Internal SDK boundaries

These modules are implementation details. Client applications import only the
package root and use `EssAuth.init()`, `auth.login()`, and `auth.logout()`.

- `config.ts` validates and resolves SDK configuration.
- `redirect.ts` owns browser callback and redirect URL behavior.
- `transport.ts` is the only module that performs HTTP requests.
- `ticket.ts` owns the ESS ticket and logout endpoint contracts.
- `identity-storage.ts` owns the per-application browser identity.
- `lifecycle.ts` coordinates initialization without exposing internal services.

Future telemetry should be added behind a dedicated `telemetry.ts` module and
called from `lifecycle.ts`. Heartbeats should be added only after ESS provides
an opaque server session identifier; they belong in `heartbeat.ts` and must not
change the public facade. IP and OS policy enforcement belongs to ESS/Caddy,
not to browser SDK modules.
