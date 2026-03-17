# Vercel Deployment

## Goal

Deploy the static frontend and dynamic patient API together on Vercel, or connect GitHub Pages to a Vercel-hosted API.

## Repo files used

- `api/patients.js`
- `api/patients-mcp.js`
- `api/health.js`
- `src/server/handlers/patientsApi.js`
- `src/server/handlers/patientsMcpApi.js`
- `vercel.json`
- `runtime-config.js`
- `runtime-config.example.js`

## Recommended deployment modes

### Mode 1. Full Vercel deployment

- Deploy the whole repo to Vercel
- Static pages and `/api/*` run on the same origin
- `runtime-config.js` can stay empty

### Mode 2. GitHub Pages + Vercel API

- Keep GitHub Pages for the frontend
- Deploy the same repo or API subset to Vercel
- Put the Vercel URL into `runtime-config.js`

## Vercel setup

1. Import this GitHub repo into Vercel
2. Use the default Node.js project detection
3. Deploy
4. Confirm:
   - `/`
   - `/algorithm-demo`
   - `/api/health`
   - `/api/patients-mcp`

## Frontend connection

If the frontend is hosted on GitHub Pages, update `runtime-config.js`:

```js
window.AI_HANDOFF_RUNTIME_CONFIG = {
  apiBase: "https://your-project.vercel.app"
};
```

If the entire app is hosted on Vercel, leave `runtime-config.js` empty.

## Runtime behavior

The browser tries these sources in order:

1. configured remote server in `runtime-config.js`
2. same-origin `/api/patients-mcp`

If neither route is reachable, the browser keeps the connection error visible instead of loading a committed patient bundle.

## Health check

- `/api/health`
- `/api/patients`
- `/api/patients-mcp`
- `/api/health` should expose `build`, `version`, and `runtime`
