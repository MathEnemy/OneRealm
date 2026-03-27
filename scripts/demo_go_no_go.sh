#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_ENV_FILE="${ROOT_DIR}/game-server/.env"
FRONTEND_ENV_FILE="${ROOT_DIR}/frontend/.env.local"

FAILURES=()
WARNINGS=()

fail() {
  FAILURES+=("$1")
}

warn() {
  WARNINGS+=("$1")
}

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    fail "Missing required env file: ${file}"
  fi
}

is_placeholder() {
  local value="${1:-}"
  [[ -z "$value" || "$value" == *"REPLACE_WITH"* || "$value" == *"_REPLACE_"* ]]
}

extract_port_from_url() {
  node -e "const raw = process.argv[1]; try { const u = new URL(raw); console.log(u.port || (u.protocol === 'https:' ? '443' : '80')); } catch { process.exit(1); }" "$1"
}

check_http_json() {
  local url="$1"
  local output="$2"
  local origins=(
    "http://localhost:3003"
    "http://127.0.0.1:3003"
  )

  for origin in "${origins[@]}"; do
    if ! curl -fsS -H "Origin: ${origin}" "$url" >"$output" 2>/dev/null; then
      return 1
    fi
  done
}

require_file "$BACKEND_ENV_FILE"
require_file "$FRONTEND_ENV_FILE"

if (( ${#FAILURES[@]} > 0 )); then
  printf 'DEMO GO/NO-GO: NO-GO\n'
  printf '\nBlocking issues:\n'
  for issue in "${FAILURES[@]}"; do
    printf -- '- %s\n' "$issue"
  done
  exit 1
fi

load_env_file() {
  local file="$1"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue
    local key="${line%%=*}"
    local value="${line#*=}"
    key="$(printf '%s' "$key" | xargs)"
    export "$key=$value"
  done < "$file"
}

load_env_file "$BACKEND_ENV_FILE"
load_env_file "$FRONTEND_ENV_FILE"

BACKEND_PORT="${PORT:-3001}"
FRONTEND_SERVER_PORT=""
if ! FRONTEND_SERVER_PORT="$(extract_port_from_url "${NEXT_PUBLIC_GAME_SERVER_URL:-}")"; then
  fail "NEXT_PUBLIC_GAME_SERVER_URL is missing or invalid"
fi

if [[ "$BACKEND_PORT" != "$FRONTEND_SERVER_PORT" ]]; then
  fail "Frontend points to backend port ${FRONTEND_SERVER_PORT}, but game-server PORT is ${BACKEND_PORT}"
fi

if is_placeholder "${ONEREALM_PACKAGE_ID:-}"; then
  fail "ONEREALM_PACKAGE_ID is missing or still a placeholder"
fi
if is_placeholder "${SPONSOR_PRIVATE_KEY:-}"; then
  fail "SPONSOR_PRIVATE_KEY is missing or still a placeholder"
fi
if is_placeholder "${GAME_AUTHORITY_OBJECT_ID:-}"; then
  fail "GAME_AUTHORITY_OBJECT_ID is missing or still a placeholder"
fi
if is_placeholder "${AUTH_SESSION_SECRET:-}"; then
  fail "AUTH_SESSION_SECRET is missing or still a placeholder"
fi
if is_placeholder "${GOOGLE_CLIENT_ID:-}"; then
  warn "GOOGLE_CLIENT_ID is missing or placeholder; Judge Mode demo still works, Google login demo may fail"
fi
if is_placeholder "${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}"; then
  warn "NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing or placeholder; Judge Mode demo still works, Google login demo may fail"
fi

if [[ "${JUDGE_MODE:-false}" != "true" ]]; then
  warn "game-server JUDGE_MODE is not true; expedition timer will be long for live recording"
fi
if [[ "${NEXT_PUBLIC_JUDGE_MODE:-false}" != "true" ]]; then
  warn "frontend NEXT_PUBLIC_JUDGE_MODE is not true; Enter Judge Mode button will not be shown"
fi

if [[ "${CHAIN_FLAVOR:-}" != "${NEXT_PUBLIC_CHAIN_FLAVOR:-}" ]]; then
  warn "Backend CHAIN_FLAVOR (${CHAIN_FLAVOR:-unset}) != frontend NEXT_PUBLIC_CHAIN_FLAVOR (${NEXT_PUBLIC_CHAIN_FLAVOR:-unset})"
fi
if [[ "${CHAIN_NETWORK:-}" != "${NEXT_PUBLIC_CHAIN_NETWORK:-}" ]]; then
  warn "Backend CHAIN_NETWORK (${CHAIN_NETWORK:-unset}) != frontend NEXT_PUBLIC_CHAIN_NETWORK (${NEXT_PUBLIC_CHAIN_NETWORK:-unset})"
fi
if [[ "${ONEREALM_PACKAGE_ID:-}" != "${NEXT_PUBLIC_ONEREALM_PACKAGE_ID:-}" ]]; then
  fail "Backend ONEREALM_PACKAGE_ID does not match frontend NEXT_PUBLIC_ONEREALM_PACKAGE_ID"
fi

HEALTH_JSON="$(mktemp)"
if check_http_json "http://127.0.0.1:${BACKEND_PORT}/health" "$HEALTH_JSON"; then
  if ! node - "$HEALTH_JSON" "$ONEREALM_PACKAGE_ID" "$GAME_AUTHORITY_OBJECT_ID" <<'EOF'
const fs = require('fs');
const [,, file, expectedPkg, expectedAuthority] = process.argv;
const body = JSON.parse(fs.readFileSync(file, 'utf8'));
if (body?.status !== 'ok') process.exit(10);
if (body?.project?.packageId !== expectedPkg) process.exit(11);
if (body?.project?.gameAuthorityObjectId !== expectedAuthority) process.exit(12);
process.exit(0);
EOF
  then
    fail "Backend /health is reachable but does not match expected package/authority configuration"
  fi
else
  warn "Backend health endpoint is not reachable at http://127.0.0.1:${BACKEND_PORT}/health"
fi
rm -f "$HEALTH_JSON"

FRONTEND_URL="http://127.0.0.1:3003"
if ! curl -fsSI "$FRONTEND_URL" >/dev/null 2>&1; then
  warn "Frontend is not reachable at ${FRONTEND_URL}; start it before recording"
fi

if (( ${#FAILURES[@]} > 0 )); then
  printf 'DEMO GO/NO-GO: NO-GO\n'
  printf '\nBlocking issues:\n'
  for issue in "${FAILURES[@]}"; do
    printf -- '- %s\n' "$issue"
  done
  if (( ${#WARNINGS[@]} > 0 )); then
    printf '\nWarnings:\n'
    for issue in "${WARNINGS[@]}"; do
      printf -- '- %s\n' "$issue"
    done
  fi
  exit 1
fi

printf 'DEMO GO/NO-GO: GO\n'
printf '\nChecks passed:\n'
printf -- '- Backend/frontend package and port config are aligned\n'
printf -- '- Critical sponsor/auth envs are present\n'
printf -- '- Judge-mode demo path is configured\n'

if (( ${#WARNINGS[@]} > 0 )); then
  printf '\nWarnings:\n'
  for issue in "${WARNINGS[@]}"; do
    printf -- '- %s\n' "$issue"
  done
fi

printf '\nRecommended recording commands:\n'
printf -- '1. Backend:  cd game-server && PORT=%s npm run start\n' "$BACKEND_PORT"
printf -- '2. Frontend: cd frontend && npm run start -- --port 3003\n'
printf -- '3. Preflight: %s\n' "./scripts/demo_go_no_go.sh"
