# Pitstop handoff

Deliverable status, live URLs and verification evidence live in
**[DELIVERABLES.md](DELIVERABLES.md)** — that file is the single place to keep current.

Summary:

| Deliverable | Status |
|---|---|
| GitHub repository | Published: <https://github.com/EvilSnIzer/Pitstop> (public, default branch `main`) |
| Live frontend URL | Running session preview — see [DELIVERABLES.md](DELIVERABLES.md); permanent host pending |
| Live backend API URL | Running session preview — see [DELIVERABLES.md](DELIVERABLES.md); permanent host pending |
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

## Information needed for permanent hosting

The requested budget is **$0**, and the selected stack is one click, entirely on Render's
free plan: the root [`render.yaml`](render.yaml) Blueprint creates the Next.js website, the
Django API, PostgreSQL and Redis (Key Value) in one workspace, wired over the private
network — no Supabase, Upstash, Vercel or object-storage account. Media is stored in
Postgres rows because free instances cannot attach persistent disks. Follow
[deploy/RENDER_ONE_CLICK.md](deploy/RENDER_ONE_CLICK.md); the earlier
[Vercel + Render + Supabase + Upstash variant](deploy/VERCEL_RENDER.md) (direct upload
tickets, signed media redirects) remains documented as an alternative.

To finish a permanent rollout you need:

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
