#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="${SRC_DIR:-/opt/mimir-src}"
APP_DIR="${APP_DIR:-/opt/mimir}"
CONTAINER_NAME="${CONTAINER_NAME:-mimir-dashboard}"
IMAGE_TAG="${IMAGE_TAG:-mimir-dashboard:${GITHUB_SHA:-remote}}"
ENV_FILE="${ENV_FILE:-$APP_DIR/dashboard.env}"
PUBLIC_PORT="${PUBLIC_PORT:-80}"
INTERNAL_PORT="${INTERNAL_PORT:-3000}"
PUBLIC_URL="${PUBLIC_URL:-http://216.128.154.247}"
API_URL="${API_URL:-$PUBLIC_URL}"
MIMIR_API_URL="${MIMIR_API_URL:-$API_URL}"
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:-$(openssl rand -base64 32)}"

log() {
  printf '[mimir-remote-deploy] %s\n' "$*"
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi

  log "Docker not found; installing it"
  if command -v pacman >/dev/null 2>&1; then
    pacman -Sy --noconfirm docker
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y --no-install-recommends ca-certificates curl docker.io
  else
    log "No supported package manager found. Install Docker manually and rerun."
    exit 1
  fi
}

ensure_docker_running() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now docker
  else
    service docker start || true
  fi
}

write_default_env() {
  if [ -f "$ENV_FILE" ]; then
    return
  fi

  log "Creating default runtime env at $ENV_FILE"
  mkdir -p "$APP_DIR"
  cat >"$ENV_FILE" <<ENV
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
NEXT_PUBLIC_URL=$PUBLIC_URL
NEXT_PUBLIC_API_URL=$API_URL
NEXT_PUBLIC_MIMIR_API_URL=$MIMIR_API_URL
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder
NEXT_PUBLIC_SUPABASE_ID=local
NEXT_PUBLIC_DESKTOP_SCHEME=midday
INVOICE_JWT_SECRET=change-me
FILE_KEY_SECRET=change-me
WEBHOOK_SECRET_KEY=change-me
MIDDAY_ENCRYPTION_KEY=
REDIS_URL=redis://localhost:6379
REDIS_QUEUE_URL=redis://localhost:6379
ENV
  chmod 600 "$ENV_FILE"
}

main() {
  if [ "$(id -u)" -ne 0 ]; then
    log "This script must run as root so it can install Docker and bind port $PUBLIC_PORT."
    exit 1
  fi
  if [ ! -d "$SRC_DIR" ]; then
    log "Source directory not found: $SRC_DIR"
    exit 1
  fi

  ensure_docker
  ensure_docker_running
  write_default_env

  cd "$SRC_DIR"
  if [ -n "${GITHUB_SHA:-}" ]; then
    printf '%s\n' "$GITHUB_SHA" > .git-commit-sha
  elif [ ! -f .git-commit-sha ]; then
    printf 'remote\n' > .git-commit-sha
  fi

  log "Building $IMAGE_TAG on $(hostname)"
  docker build \
    --file apps/dashboard/Dockerfile \
    --tag "$IMAGE_TAG" \
    --build-arg NEXT_PUBLIC_URL="$PUBLIC_URL" \
    --build-arg NEXT_PUBLIC_API_URL="$API_URL" \
    --build-arg NEXT_PUBLIC_MIMIR_API_URL="$MIMIR_API_URL" \
    --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://localhost:54321}" \
    --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-placeholder}" \
    --build-arg NEXT_PUBLIC_SUPABASE_ID="${NEXT_PUBLIC_SUPABASE_ID:-local}" \
    --build-arg NEXT_PUBLIC_OPENPANEL_CLIENT_ID="${NEXT_PUBLIC_OPENPANEL_CLIENT_ID:-}" \
    --build-arg NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN:-}" \
    --build-arg NEXT_PUBLIC_PLAID_ENVIRONMENT="${NEXT_PUBLIC_PLAID_ENVIRONMENT:-sandbox}" \
    --build-arg NEXT_PUBLIC_TELLER_APPLICATION_ID="${NEXT_PUBLIC_TELLER_APPLICATION_ID:-}" \
    --build-arg NEXT_PUBLIC_TELLER_ENVIRONMENT="${NEXT_PUBLIC_TELLER_ENVIRONMENT:-sandbox}" \
    --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-}" \
    --build-arg NEXT_PUBLIC_GOOGLE_API_KEY="${NEXT_PUBLIC_GOOGLE_API_KEY:-}" \
    --build-arg NEXT_PUBLIC_DESKTOP_SCHEME="${NEXT_PUBLIC_DESKTOP_SCHEME:-midday}" \
    --build-arg NEXT_PUBLIC_WHATSAPP_NUMBER="${NEXT_PUBLIC_WHATSAPP_NUMBER:-}" \
    --build-arg NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME:-}" \
    --build-arg NEXT_PUBLIC_SENDBLUE_NUMBER="${NEXT_PUBLIC_SENDBLUE_NUMBER:-}" \
    --build-arg SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}" \
    --build-arg SENTRY_ORG="${SENTRY_ORG:-}" \
    --build-arg SENTRY_PROJECT="${SENTRY_PROJECT:-}" \
    --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" \
    .

  log "Replacing $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --env-file "$ENV_FILE" \
    -p "$PUBLIC_PORT:$INTERNAL_PORT" \
    "$IMAGE_TAG" >/dev/null

  log "Waiting for health check"
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$PUBLIC_PORT/api/health" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:$PUBLIC_PORT/" >/dev/null 2>&1; then
      log "Deployment healthy"
      exit 0
    fi
    sleep 2
  done

  log "Container did not become healthy; recent logs follow"
  docker logs --tail=120 "$CONTAINER_NAME" || true
  exit 1
}

main "$@"
