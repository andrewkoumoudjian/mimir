#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAR="${1:?image tar path is required}"
IMAGE_TAG="${2:?image tag is required}"
APP_DIR="${APP_DIR:-/opt/mimir}"
CONTAINER_NAME="${CONTAINER_NAME:-mimir-dashboard}"
ENV_FILE="${ENV_FILE:-$APP_DIR/dashboard.env}"
PUBLIC_PORT="${PUBLIC_PORT:-80}"
INTERNAL_PORT="${INTERNAL_PORT:-3000}"

log() {
  printf '[mimir-deploy] %s\n' "$*"
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
  cat >"$ENV_FILE" <<'ENV'
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
NEXT_PUBLIC_URL=http://216.128.154.247
NEXT_PUBLIC_API_URL=http://216.128.154.247
NEXT_PUBLIC_MIMIR_API_URL=http://216.128.154.247
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

  mkdir -p "$APP_DIR"
  ensure_docker
  ensure_docker_running
  write_default_env

  log "Loading image $IMAGE_TAG"
  gzip -dc "$IMAGE_TAR" | docker load >/dev/null

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
