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

The server-side deploy script creates `/opt/mimir/dashboard.env` with minimal placeholder values if the file does not already exist. That is enough to start the container, but production integrations need real values.

The remote source lives at `/opt/mimir-src`. The deployed container is `mimir-dashboard`, bound to host port `80`.
