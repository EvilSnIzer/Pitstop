# Pitstop deliverables

## Delivery status

| Requested deliverable | Status / location |
|---|---|
| GitHub repository | **Source package ready; not published.** The selected handoff is downloadable source first. Upload instructions are below. |
| Permanent live frontend URL | **Pending hosting target, deployment access and rollout.** No permanent URL has been created or verified. |
| Permanent live backend API URL | **Pending hosting/routing configuration and rollout.** Do not substitute a localhost URL or temporary workspace preview. |
| README with setup instructions | [README.md](README.md) |
| API documentation | [API reference](docs/API_REFERENCE.md), [OpenAPI schema](docs/openapi.yaml), and Django's local `/api/docs/` Swagger UI |
| Short architecture explanation | [ARCHITECTURE.md](ARCHITECTURE.md) |

Also included: [deployment/recovery runbook](deploy/README.md), [prior verification results and limitations](VERIFICATION.md), migrations, automated tests and CI configuration.

## Publish the downloaded source to GitHub

The archive includes source, dependency manifests/locks, example environment files and documentation. It deliberately excludes Git history, installed dependencies, local databases, uploaded user media, build output and real environment/credential files. Install dependencies and build using the README.

Create an empty GitHub repository with your chosen owner/name and visibility. Then, inside the extracted project folder:

```bash
git init -b main
git add .
git commit -m "Initial Pitstop application and documentation"
git remote add origin https://github.com/YOUR_OWNER/YOUR_REPOSITORY.git
git push -u origin main
```

Replace `YOUR_OWNER/YOUR_REPOSITORY` with the actual repository. Configure Git author identity if necessary, and authenticate using your own GitHub credential manager or `gh auth login`. Do not put a token in the remote URL or commit it to the repository. The commands are instructions, not evidence that a repository has already been created.

## Hosting choice

The requested budget is **$0**, and the selected stack is now **one click, entirely on Render's free plan**: the root `render.yaml` Blueprint creates the Next.js website, the Django API, PostgreSQL and Redis (Key Value) in one workspace and wires them over Render's private network — no Supabase, Upstash, Vercel or object-storage account. Media is stored in Postgres rows because free instances cannot attach persistent disks. Follow [the one-click guide](deploy/RENDER_ONE_CLICK.md); the earlier [Vercel + Render + Supabase + Upstash variant](deploy/VERCEL_RENDER.md) (with direct upload tickets and private storage redirects) remains documented as an alternative. Local verification is recorded in [HOSTING_VERIFICATION.md](HOSTING_VERIFICATION.md). No live resources have been provisioned, and no paid resources are authorized.

## Information needed for permanent deployment

- Target hosting provider/account or an existing Docker-capable server.
- Authorized deployment access through a secure mechanism; do not paste private keys or cloud secrets into chat.
- Hostname/domain ownership or an acceptable provider-supplied hostname.
- Free-plan account eligibility and authorized access; any required paid resource needs separate approval.
- A backend-only Gemini key for real diagnosis, if that feature should be enabled.

The included Compose stack uses persistent PostgreSQL, Redis and private media, plus Caddy HTTPS. In the selected all-Render topology, browsers only talk to the frontend BFF; the Django API is additionally reachable at its own `onrender.com` URL for direct bearer-auth clients and docs. Production admin routes are disabled by default. The alternative private Compose gateway keeps Django admin/docs unexposed.

Permanent URLs should be entered here only after HTTPS, authentication, ownership checks, persistence and health endpoints have been smoke-tested on the selected host. A backup/restore drill and independent operational/security review remain release gates.
