import assert from "node:assert/strict";
import test from "node:test";

import { TicketService } from "../dist/internal/auth/ticket-service.js";

class FakeTransport {
  calls = [];

  async post(path, body, options) {
    this.calls.push({ path, body, options });
    if (path === "/client-auth/tickets/verify") {
      return { employee_id: "680708" };
    }
    return { message: "ok" };
  }
}

test("ticket service uses the transport contract for verify and logout", async () => {
  const transport = new FakeTransport();
  const tickets = new TicketService("Tg2wbdIU3C0JRfSX", transport);

  assert.equal(await tickets.verify("  callback-ticket  "), "680708");
  await tickets.notifyLogout("680708");

  assert.deepEqual(transport.calls, [
    {
      path: "/client-auth/tickets/verify",
      body: {
        public_key: "Tg2wbdIU3C0JRfSX",
        ticket: "callback-ticket",
      },
      options: { fallbackError: "Ticket verification failed." },
    },
    {
      path: "/client-auth/logout",
      body: {
        public_key: "Tg2wbdIU3C0JRfSX",
        employee_id: "680708",
      },
      options: {
        fallbackError: "Logout notification failed.",
        keepalive: true,
      },
    },
  ]);
});
