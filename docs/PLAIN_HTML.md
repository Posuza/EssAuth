# Plain HTML Integration

This setup works without npm, a bundler, or a frontend framework.

## Complete example

Place the ESS public key in a data attribute and initialize the SDK from one
module script:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Employee application</title>
  </head>
  <body data-ess-public-key="Ab3dE6gH9jKm2NpQ">
    <p id="auth-status">Checking authentication...</p>
    <button id="login" type="button" hidden>Sign in with ESS</button>
    <button id="retry" type="button" hidden>Try again</button>
    <button id="logout" type="button" hidden>Sign out</button>

    <script type="module">
      const SDK_URL =
        "https://ess-faceregister.esscentor.com/sdk/v1/index.js";
      const { default: EssAuth } = await import(SDK_URL);

      const status = document.querySelector("#auth-status");
      const loginButton = document.querySelector("#login");
      const retryButton = document.querySelector("#retry");
      const logoutButton = document.querySelector("#logout");
      const auth = await EssAuth.init({
        publicKey: document.body.dataset.essPublicKey,
      });

      if (auth.error) {
        status.textContent = `ESS unavailable: ${auth.error.message}`;
        retryButton.hidden = false;
      } else if (auth.employeeId) {
        status.textContent = `Employee: ${auth.employeeId}`;
        logoutButton.hidden = false;
      } else {
        status.textContent = "Sign in to continue";
        loginButton.hidden = false;
      }

      loginButton.addEventListener("click", () => auth.login());
      retryButton.addEventListener("click", () => window.location.reload());
      logoutButton.addEventListener("click", async () => {
        await auth.logout();
        window.location.reload();
      });
    </script>
  </body>
</html>
```

To redirect immediately instead of showing a login button, call `auth.login()`
only when both `auth.employeeId` and `auth.error` are absent:

```js
if (!auth.employeeId && !auth.error) auth.login();
```

Do not automatically redirect when `auth.error` exists. That would create a
redirect loop when ESS rejects the callback or is unavailable.

## What happens after login

ESS returns to the same registered client URL with a one-time ticket. The
module script runs again, and `EssAuth.init()` verifies the ticket, removes it
from the address bar, stores the employee identity, and starts presence. The
HTML application does not read or store the ticket itself.

On later reloads, the SDK restores the stored employee identity without
requiring ESS. A new login still requires ESS.

See [Installation](./INSTALLATION.md) for the hosted SDK setup.
