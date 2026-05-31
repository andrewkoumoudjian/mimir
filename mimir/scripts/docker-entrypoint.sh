#!/bin/sh
set -e

GIT_COMMIT_SHA="${GIT_COMMIT_SHA:-$(cat /tmp/git-sha.txt 2>/dev/null || echo "")}"
export GIT_COMMIT_SHA

SENTRY_RELEASE="${SENTRY_RELEASE:-$GIT_COMMIT_SHA}"
export SENTRY_RELEASE

exec "$@"
