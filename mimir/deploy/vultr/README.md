# Vultr deployment

The GitHub Actions workflow at `.github/workflows/deploy-vultr.yml` syncs the `mimir/` source tree to the Vultr instance on every push to `main`, builds the dashboard Docker image on the Vultr instance, and replaces the running container.

Required GitHub secret:

- `VULTR_SSH_PRIVATE_KEY`: private key for a user that can SSH to the Vultr instance and run Docker as root.

Recommended GitHub secrets:

- `DASHBOARD_ENV_FILE`: full runtime env file written to `/opt/mimir/dashboard.env`.
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: stable base64-encoded 32-byte key.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ID`

Useful GitHub variables:

- `VULTR_HOST`: defaults to `173.199.93.71`.
- `VULTR_USER`: defaults to `root`.
- `NEXT_PUBLIC_URL`: defaults to `http://173.199.93.71`.
- `NEXT_PUBLIC_API_URL`: defaults to `http://173.199.93.71`.
- `NEXT_PUBLIC_MIMIR_API_URL`: defaults to `http://173.199.93.71:8787`.

The server-side deploy script creates `/opt/mimir/dashboard.env` with minimal placeholder values if the file does not already exist. That is enough to start the container, but production integrations need real values.
The fraud API is deployed as a separate `mimir-api` container on port `8787`. CI syncs `valsoft/data` to `/opt/mimir/valsoft/data` and preserves `/opt/mimir/valsoft/output` across deploys for review state and audit output.

The remote source lives at `/opt/mimir-src`. The deployed containers are `mimir-api`, bound to host port `8787`, and `mimir-dashboard`, bound to host port `80`.
