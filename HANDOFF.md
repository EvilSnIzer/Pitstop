# Pitstop handoff

Deliverable status, live URLs and verification evidence live in
**[DELIVERABLES.md](DELIVERABLES.md)** — that file is the single place to keep current.

Summary:

| Deliverable | Status |
|---|---|
| GitHub repository | Published: <https://github.com/EvilSnIzer/Pitstop> (public, default branch `main`) |
| Live frontend URL | **Live:** <https://pitstop-pi-ochre.vercel.app> — see [DELIVERABLES.md](DELIVERABLES.md) |
| Live backend API URL | **Live:** <https://pitstop-pi-ochre.vercel.app/api/v1>; the Django service's own hostname is the one field left to publish |
| README with setup instructions | [README.md](README.md) |
| API documentation | [docs/API_REFERENCE.md](docs/API_REFERENCE.md), [docs/openapi.yaml](docs/openapi.yaml), live `/api/docs/` |
| Short architecture explanation | [ARCHITECTURE.md](ARCHITECTURE.md) |

Also included: [deployment/recovery runbook](deploy/README.md),
[verification results and limitations](VERIFICATION.md),
[hosting adaptation notes](HOSTING_VERIFICATION.md), migrations, automated tests and
[CI](.github/workflows/ci.yml).

## Working with the published repository

`main` holds the released state. Do work on a branch and open a pull request so CI
(`backend`, `frontend`, `e2e` jobs) runs before merging:

```bash
git switch -c my-change
git add -A && git commit -m "Describe the change"
git push -u origin my-change
gh pr create --fill
```

Authenticate with your own credential helper or `gh auth login`; never put a token in the
remote URL or commit credentials.

## Remaining hosting work

The frontend is live on Vercel at <https://pitstop-pi-ochre.vercel.app> and reaches a real
Django API through the BFF. Two items remain:

1. **Publish the Django hostname** in [DELIVERABLES.md](DELIVERABLES.md) — the value of the
   Vercel project's `NEXT_PUBLIC_DIRECT_API_URL`, or Render → `pitstop-api` → Settings →
   Domains. That is where `/api/docs/`, `/api/schema/` and `/health/live/` are exposed.
2. **Enable the API variables for Vercel Preview** (`API_PROXY_URL`,
   `NEXT_PUBLIC_DIRECT_API_URL`) so preview deployments build; production already works.
   `APP_ORIGIN` needs no value — `next.config.mjs` derives it from `VERCEL_URL`.

If you would rather run everything on one free provider, the all-Render path is still here:
the root [`render.yaml`](render.yaml) Blueprint creates the Next.js website, the Django API,
PostgreSQL and Redis (Key Value) in one workspace, wired over the private network — no
Supabase, Upstash, Vercel or object-storage account. Media is stored in Postgres rows
because free instances cannot attach persistent disks. Follow
[deploy/RENDER_ONE_CLICK.md](deploy/RENDER_ONE_CLICK.md); the
[Vercel + Render + Supabase + Upstash variant](deploy/VERCEL_RENDER.md) (direct upload
tickets, signed media redirects) remains documented as an alternative.

For any further rollout you need:

- Target hosting provider/account, or an existing Docker-capable server.
- Authorized deployment access through a secure mechanism; do not paste private keys or
  cloud secrets into chat.
- Hostname/domain ownership, or acceptance of a provider-supplied hostname.
- Free-plan account eligibility; any paid resource needs separate approval.
- A backend-only Gemini key if real diagnosis should be enabled.

In the all-Render topology, browsers only talk to the frontend BFF; Django is additionally
reachable at its own `onrender.com` URL for bearer-auth clients and docs, with production
admin routes disabled. Record the permanent URLs in
[DELIVERABLES.md](DELIVERABLES.md) only after HTTPS, authentication, ownership checks,
persistence and the health endpoints have been smoke-tested on that host. A backup/restore
drill and independent operational/security review remain release gates.
