#!/bin/sh
# Loads Docker/Compose secrets (/run/secrets/<name>) into the environment, checks required settings, then starts the
# server. Database migrations are applied by the server itself on boot (server/plugins/migrations.ts).
set -eu

required_vars="NUXT_APP_SECRET"

if [ -d /run/secrets ]; then
  for f in /run/secrets/*; do
    [ -f "$f" ] || continue
    name="$(basename "$f" | tr '[:lower:]' '[:upper:]')"
    case "$name" in
      ''|*[!A-Z0-9_]*)
        echo "Skipping secret with invalid name: $name" >&2
        continue
        ;;
    esac
    value="$(cat "$f")"
    [ -n "$value" ] || continue
    export "$name=$value"
  done
fi

for name in $required_vars; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing required setting: $name (generate one with: openssl rand -base64 32)" >&2
    exit 1
  fi
done

mkdir -p /app/.data/db /app/.data/blob
exec "$@"
