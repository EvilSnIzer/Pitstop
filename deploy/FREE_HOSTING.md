# Free assignment hosting

The selected setup is now **Vercel frontend + Render Free backend**, with **Supabase Free PostgreSQL/private media** and **Upstash Free Redis**. It supersedes the earlier two-Render-service proposal.

Follow **[the Vercel + Render deployment guide](VERCEL_RENDER.md)**. It includes dashboard steps, exact environment variables, a private PostgreSQL schema, upload/download routing and the submission smoke-test checklist.

The source now contains:

- `render.yaml`: one explicitly free Docker backend service.
- `backend/start-render.sh`: single-instance startup/migrations and Gunicorn settings.
- `frontend/vercel.json`: framework-aware frontend build configuration.
- Upload-only tickets and direct browser-to-Render uploads, preserving the existing media size limits without proxying large bodies through Vercel.
- Owner-checked redirects to expiring private-storage read URLs.

**Budget remains $0. No paid resources are authorized. No cloud resources or live URLs have been provisioned.** Free-plan availability/eligibility must be checked in your own accounts. There is no always-on guarantee: Render can sleep, databases can pause and quotas can be exhausted. See the linked guide for verified provider references and remaining hosted validation steps.
