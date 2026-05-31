#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="${SRC_DIR:-/opt/mimir-src}"
APP_DIR="${APP_DIR:-/opt/mimir}"
CONTAINER_NAME="${CONTAINER_NAME:-mimir-dashboard}"
IMAGE_TAG="${IMAGE_TAG:-mimir-dashboard:${GITHUB_SHA:-remote}}"
API_CONTAINER_NAME="${API_CONTAINER_NAME:-mimir-api}"
API_IMAGE_TAG="${API_IMAGE_TAG:-mimir-api:${GITHUB_SHA:-remote}}"
NETWORK_NAME="${NETWORK_NAME:-mimir-net}"
ENV_FILE="${ENV_FILE:-$APP_DIR/dashboard.env}"
VALSOFT_DIR="${VALSOFT_DIR:-$APP_DIR/valsoft}"
PUBLIC_PORT="${PUBLIC_PORT:-80}"
INTERNAL_PORT="${INTERNAL_PORT:-3000}"
API_PUBLIC_PORT="${API_PUBLIC_PORT:-8787}"
API_INTERNAL_PORT="${API_INTERNAL_PORT:-8787}"
PUBLIC_URL="${PUBLIC_URL:-http://173.199.93.71}"
API_URL="${API_URL:-$PUBLIC_URL}"
MIMIR_PUBLIC_API_URL="${MIMIR_PUBLIC_API_URL:-${MIMIR_API_URL:-http://173.199.93.71:8787}}"
MIMIR_INTERNAL_API_URL="${MIMIR_INTERNAL_API_URL:-http://$API_CONTAINER_NAME:$API_INTERNAL_PORT}"
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

ensure_network() {
  docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 || docker network create "$NETWORK_NAME" >/dev/null
}

write_default_env() {
  mkdir -p "$APP_DIR" "$VALSOFT_DIR/data" "$VALSOFT_DIR/output"
  if [ ! -f "$ENV_FILE" ]; then
    log "Creating default runtime env at $ENV_FILE"
    cat >"$ENV_FILE" <<ENV
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
NEXT_PUBLIC_URL=$PUBLIC_URL
NEXT_PUBLIC_API_URL=$API_URL
NEXT_PUBLIC_MIMIR_API_URL=$MIMIR_PUBLIC_API_URL
MIMIR_API_URL=$MIMIR_INTERNAL_API_URL
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
  fi
  upsert_env_var NODE_ENV production
  upsert_env_var PORT 3000
  upsert_env_var HOSTNAME 0.0.0.0
  upsert_env_var NEXT_PUBLIC_URL "$PUBLIC_URL"
  upsert_env_var NEXT_PUBLIC_API_URL "$API_URL"
  upsert_env_var NEXT_PUBLIC_MIMIR_API_URL "$MIMIR_PUBLIC_API_URL"
  upsert_env_var MIMIR_API_URL "$MIMIR_INTERNAL_API_URL"
  chmod 600 "$ENV_FILE"
}

upsert_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^$key=" "$ENV_FILE"; then
    sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

ensure_valsoft_data() {
  if [ ! -f "$VALSOFT_DIR/data/transactions.csv" ]; then
    log "Missing API input data: $VALSOFT_DIR/data/transactions.csv"
    exit 1
  fi
  mkdir -p "$VALSOFT_DIR/output"
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
  ensure_network
  write_default_env
  ensure_valsoft_data

  cd "$SRC_DIR"
  if [ -n "${GITHUB_SHA:-}" ]; then
    printf '%s\n' "$GITHUB_SHA" > .git-commit-sha
  elif [ ! -f .git-commit-sha ]; then
    printf 'remote\n' > .git-commit-sha
  fi

  log "Building $API_IMAGE_TAG on $(hostname)"
  docker build \
    --file src/mimir-fraud/Dockerfile \
    --tag "$API_IMAGE_TAG" \
    .

  log "Replacing $API_CONTAINER_NAME"
  docker rm -f "$API_CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$API_CONTAINER_NAME" \
    --restart unless-stopped \
    --network "$NETWORK_NAME" \
    -v "$VALSOFT_DIR/data:/data:ro" \
    -v "$VALSOFT_DIR/output:/output" \
    -p "$API_PUBLIC_PORT:$API_INTERNAL_PORT" \
    "$API_IMAGE_TAG" >/dev/null

  log "Waiting for API health check"
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$API_PUBLIC_PORT/health" >/dev/null 2>&1; then
      log "API healthy"
      break
    fi
    sleep 2
  done
  if ! curl -fsS "http://127.0.0.1:$API_PUBLIC_PORT/health" >/dev/null 2>&1; then
    log "API did not become healthy; recent logs follow"
    docker logs --tail=120 "$API_CONTAINER_NAME" || true
    exit 1
  fi

  log "Building $IMAGE_TAG on $(hostname)"
  export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://localhost:54321}"
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-placeholder}"
  export NEXT_PUBLIC_SUPABASE_ID="${NEXT_PUBLIC_SUPABASE_ID:-local}"
  export NEXT_PUBLIC_OPENPANEL_CLIENT_ID="${NEXT_PUBLIC_OPENPANEL_CLIENT_ID:-}"
  export NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN:-}"
  export NEXT_PUBLIC_PLAID_ENVIRONMENT="${NEXT_PUBLIC_PLAID_ENVIRONMENT:-sandbox}"
  export NEXT_PUBLIC_TELLER_APPLICATION_ID="${NEXT_PUBLIC_TELLER_APPLICATION_ID:-}"
  export NEXT_PUBLIC_TELLER_ENVIRONMENT="${NEXT_PUBLIC_TELLER_ENVIRONMENT:-sandbox}"
  export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-}"
  export NEXT_PUBLIC_GOOGLE_API_KEY="${NEXT_PUBLIC_GOOGLE_API_KEY:-}"
  export NEXT_PUBLIC_DESKTOP_SCHEME="${NEXT_PUBLIC_DESKTOP_SCHEME:-midday}"
  export NEXT_PUBLIC_WHATSAPP_NUMBER="${NEXT_PUBLIC_WHATSAPP_NUMBER:-}"
  export NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME:-}"
  export NEXT_PUBLIC_SENDBLUE_NUMBER="${NEXT_PUBLIC_SENDBLUE_NUMBER:-}"
  export SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}"
  export SENTRY_ORG="${SENTRY_ORG:-}"
  export SENTRY_PROJECT="${SENTRY_PROJECT:-}"
  export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY

  docker build \
    --file apps/dashboard/Dockerfile \
    --tag "$IMAGE_TAG" \
    --build-arg NEXT_PUBLIC_URL="$PUBLIC_URL" \
    --build-arg NEXT_PUBLIC_API_URL="$API_URL" \
    --build-arg NEXT_PUBLIC_MIMIR_API_URL="$MIMIR_PUBLIC_API_URL" \
    --build-arg NEXT_PUBLIC_SUPABASE_URL \
    --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    --build-arg NEXT_PUBLIC_SUPABASE_ID \
    --build-arg NEXT_PUBLIC_OPENPANEL_CLIENT_ID \
    --build-arg NEXT_PUBLIC_SENTRY_DSN \
    --build-arg NEXT_PUBLIC_PLAID_ENVIRONMENT \
    --build-arg NEXT_PUBLIC_TELLER_APPLICATION_ID \
    --build-arg NEXT_PUBLIC_TELLER_ENVIRONMENT \
    --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    --build-arg NEXT_PUBLIC_GOOGLE_API_KEY \
    --build-arg NEXT_PUBLIC_DESKTOP_SCHEME \
    --build-arg NEXT_PUBLIC_WHATSAPP_NUMBER \
    --build-arg NEXT_PUBLIC_TELEGRAM_BOT_USERNAME \
    --build-arg NEXT_PUBLIC_SENDBLUE_NUMBER \
    --build-arg SENTRY_AUTH_TOKEN \
    --build-arg SENTRY_ORG \
    --build-arg SENTRY_PROJECT \
    --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    .

  log "Replacing $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --network "$NETWORK_NAME" \
    --env-file "$ENV_FILE" \
    -p "$PUBLIC_PORT:$INTERNAL_PORT" \
    "$IMAGE_TAG" >/dev/null

  log "Waiting for dashboard health check"
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$PUBLIC_PORT/api/health" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:$PUBLIC_PORT/" >/dev/null 2>&1; then
      log "Dashboard healthy"
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
