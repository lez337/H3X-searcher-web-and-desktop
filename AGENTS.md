# Shared H3X project

`src/` is the only active React application. `worker/` is the common Cloudflare backend. `desktop/` is a restricted Electron launcher for the configured HTTPS origin; it must not persist investigation state or provider keys to disk. `electron/` contains shared search/export engines and native adapters.

The two `H3X v2 ...` folders are ignored legacy backups. Edit this root project. Both former launch folders forward their npm commands to this root.

Use `npm test`, `npm run build`, and `npm run deploy:check`. Keep Durable Object migration tags, Worker name, and account identifiers stable to preserve deployed accounts. Provider credentials belong only in encrypted account storage. Never add keys to renderer storage or a repository.
