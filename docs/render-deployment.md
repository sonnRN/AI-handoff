# Render Free Server Deployment

## Goal

Deploy a free remote server so GitHub Pages can call live synthetic FHIR/MCP-backed endpoints.

## Why this is needed

- GitHub Pages serves static files only.
- The MCP server and FHIR gateway need a running server process.
- A free Render web service is the simplest way to host that process without Netlify.

## Repo files used

- `src/server/httpServer.js`
- `src/server/handlers/patientsApi.js`
- `src/server/handlers/patientsMcpApi.js`
- `render.yaml`
- `runtime-config.js`
- `runtime-config.example.js`

## Render setup

1. Create a new Web Service on Render from this GitHub repo.
2. Keep the default free plan.
3. Render will use:
   - build command: `npm install`
   - start command: `npm start`
4. After deploy, copy the Render service URL.

## Frontend connection

Update `runtime-config.js`:

```js
window.AI_HANDOFF_RUNTIME_CONFIG = {
  apiBase: "https://your-render-service.onrender.com"
};
```

Push that file to GitHub so GitHub Pages can call the remote server.

## Runtime behavior

The browser tries these sources in order:

1. configured remote server in `runtime-config.js`
2. same-origin `/api/patients-mcp`
3. `public-demo-data/patients-bundle.json`

## Health check

The remote server exposes:

- `/health`
- `/api/patients`
- `/api/patients-mcp`

## Free-tier note

On a free service, the first request after idle time may be slow. The frontend keeps the static synthetic snapshot fallback so the demo still opens safely.
