#!/usr/bin/env sh
# Checks a Ticketer API key without changing anything: lists the tickets of an address that can't exist.
# A valid key answers 200 with []. Needs curl.
#
#   TICKETER_URL=https://tickets.example.com TICKETER_API_KEY=tkt_… sh check-key.sh
set -eu

: "${TICKETER_URL:?Set TICKETER_URL to the Ticketer address, such as https://tickets.example.com}"
: "${TICKETER_API_KEY:?Set TICKETER_API_KEY to the app's API key}"

url="${TICKETER_URL%/}/api/integrations/v1/tickets?email=key-check%40example.invalid&limit=1"
body=$(mktemp)
trap 'rm -f "$body"' EXIT
status=$(curl -sS -o "$body" -w '%{http_code}' -H "Authorization: Bearer $TICKETER_API_KEY" "$url")
message=$(sed -n -E 's/.*"message": *"(([^"\\]|\\.)*)".*/\1/p' "$body" | head -n 1 | sed 's/\\"/"/g')

case "$status" in
  200) echo "OK: the key works (200 $(cat "$body"))." ;;
  401) echo "FAIL 401: the key is missing, wrong or was rotated. Ticketer says: $message"; exit 1 ;;
  403) echo "FAIL 403: the app is turned off. Ticketer says: $message"; exit 1 ;;
  404) echo "FAIL 404: no Ticketer integration API at $TICKETER_URL. Check the address."; exit 1 ;;
  *) echo "FAIL $status: ${message:-$(head -c 300 "$body")}"; exit 1 ;;
esac
