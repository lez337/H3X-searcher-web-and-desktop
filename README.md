# H3X — web and desktop

One React application, one Cloudflare backend, one account workspace.

- Website: [h3x-web.h3x-project.workers.dev](https://h3x-web.h3x-project.workers.dev/)
- Source and Windows releases: [lez337/H3X-searcher-web-and-desktop](https://github.com/lez337/H3X-searcher-web-and-desktop)
- Edit `src/` for shared features, `worker/` for account APIs, and `desktop/` for the Windows launcher.
- The two old `H3X v2 ...` folders are ignored backups. Their npm launch/build commands forward to this root project. Do new development here.

The Windows app opens the website in a sandboxed Electron window. Every web deployment updates both interfaces on their next reload or launch. Investigations, people, evidence, graph connections, map pins, history, and settings are stored in the same signed-in account's Cloudflare Durable Object. Active workspaces are held only in memory on the client. There is no offline investigation database or filesystem autosave. An internet connection is required.

Changes from another device are checked every two seconds while visible, and on focus or reconnect. Unsaved edits block background replacement. Revision checks reject simultaneous conflicting writes instead of silently overwriting another device; download the offered backup before reloading a conflicted workspace.

## Run and verify

Requires Node.js 22 or newer and npm.

```powershell
npm ci
npm test
npm run build
npm run deploy:check
npm start
```

`npm start` opens the production website in the Windows app. For local development use three terminals:

```powershell
npm run dev:worker
npm run dev
npm run dev:desktop
```

The frontend uses `http://127.0.0.1:5173`, proxying APIs to the Worker at port 8787. Local accounts are separate from production. Rebuild/restart the Worker after backend changes. `H3X_DEV_URL` can override the local development origin.

## Accounts and provider keys

Create an account and save its eight-digit login key. Names are case insensitive. Login keys are salted PBKDF2 hashes and cannot be recovered. **Remember me for 30 days** uses an HttpOnly, SameSite=Strict, Secure-on-HTTPS cookie with a matching server-side expiry. Otherwise sessions last eight hours. Sign out revokes that session; changing the login key revokes other sessions.

Save your OathNet key once in **Settings → OathNet**. Other provider keys can be saved under **Settings → Free APIs**. They persist across refreshes and devices and are encrypted with AES-GCM in the owning account's Durable Object. Browser APIs return saved-status booleans, never saved keys. Keys are absent from workspace exports, local storage and normal search request bodies.

An account API key generated under **Account information → Equicord / account API** resolves to the same account and uses its saved OathNet key. Replacing/revoking the account API key invalidates the previous key. It permits Discord searches only; it cannot access investigations or manage provider keys. The former shared `OATHNET_API_KEY` Worker secret is no longer a fallback for account searches.

Configure the encryption secret once before saving provider keys:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put H3X_CREDENTIALS_KEY
```

Keep this secret stable and backed up: replacing it prevents decryption of previously saved provider keys. Never commit it or put it in a `VITE_*` variable. For local development, copy `.dev.vars.example` to `.dev.vars` and use a separate local key.

## Move existing investigations

Sign into the same H3X account in the browser and updated Windows app. In **Settings → Search → Account workspace**, use **Import previous Windows workspace** in Windows, **Import previous browser workspace**, or **Restore backup** with an old `workspace.json`. Importing requires confirmation because it replaces the target account workspace. Download a backup first if that account already contains investigations. Existing local files remain available as backups; the connected app does not write new investigation data to them.

Telegram sessions remain encrypted by Windows on their device. Telegram and GHunt are enabled only in Electron. Searches, reports and provider credentials otherwise use the same cloud backend. File scanning remains local and does not upload file contents; exports download only when requested.

## GitHub and automatic updates

GitHub Actions runs tests and production build checks, then builds the Windows installer for every push to `main`. Download the **H3X-Windows** workflow artifact. Pushing a `v<package version>` tag also creates a GitHub release with the installer and `SHA256SUMS.txt`; installed Windows apps check this repository for native-shell updates.

Connect the existing Cloudflare Worker **h3x-web** to **lez337/H3X-searcher-web-and-desktop** under **Settings → Builds**. Use branch `main`, root `/`, build command `npm ci && npm test && npm run build`, and deploy command `npx wrangler deploy`. Keep `H3X_CREDENTIALS_KEY` as a runtime secret. This one-time Cloudflare repository connection is separate from the Git remote. The existing Wrangler login can deploy but does not grant Workers Builds Configuration permissions.

After that connection, pushing `main` updates the hosted interface used by browser and Windows. Reopen or reload either client to load the deployment. Frontend changes do not require reinstalling Windows. Changes to `desktop/` require an updated installer, published by a version tag.

```powershell
npm run deploy
npm run dist:win
```

`desktop/config.json` contains the production origin. Change it with `npm run desktop:configure -- https://your-worker.example/` before packaging a different deployment. Production origins require HTTPS. Native IPC accepts only the configured site's main frame; report iframes have no native access. Windows binaries are unsigned.

Preserve the Worker name, Durable Object bindings, and migration tags in `wrangler.jsonc` to retain accounts and reports. Report links remain snapshots, separate from synchronized editable investigations. Investigation connection, save and sharing dialogs ignore outside clicks; Cancel and the close cross dismiss them. Successful save actions still complete normally.

References: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

Original source: [H3X-v2](https://github.com/lez337/H3X-v2). Username rules adapted from [Maigret](https://github.com/soxoj/maigret) under MIT; notice retained in `electron/MAIGRET-LICENSE.txt`.
