#!/usr/bin/env bash
set -e

if [ -n "$SUDO_USER" ]; then
  USER_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
else
  USER_HOME="$HOME"
fi

WAKATIME_CFG="$USER_HOME/.wakatime.cfg"
WAKATIME_API_URL="https://api.wakatime.com/api/v1/"

log() {
  echo "$1"
}

warn() {
  echo "⚠️  $1"
}

error() {
  echo "❌ $1"
}

log "🔎 Checking WakaTime (Wakapi) configuration..."

# ------------------------------------------------------------
# Detect HTTP client
# ------------------------------------------------------------
HTTP_CLIENT=""

if command -v curl >/dev/null 2>&1; then
  HTTP_CLIENT="curl"
elif command -v wget >/dev/null 2>&1; then
  HTTP_CLIENT="wget"
elif command -v python3 >/dev/null 2>&1; then
  HTTP_CLIENT="python3"
elif command -v python >/dev/null 2>&1; then
  HTTP_CLIENT="python"
else
  warn "No HTTP client available (curl, wget, or python). Skipping API validation."
  HTTP_CLIENT="none"
fi

# ------------------------------------------------------------
# Validate Wakapi API key
#
# Return codes:
#   0 = valid
#   1 = invalid
#   2 = server unreachable / network error
# ------------------------------------------------------------
validate_wakapi_key() {
  local api_key="$1"
  local status=""

  [ "$HTTP_CLIENT" = "none" ] && return 2

  case "$HTTP_CLIENT" in
    curl)
      status="$(curl -s --connect-timeout 5 \
        -o /dev/null -w "%{http_code}" \
        -H "Authorization: Basic $(printf '%s' "$api_key" | base64)" \
        "$WAKATIME_API_URL/compat/wakatime/v1/users/current" || echo "000")"
      ;;
    wget)
      status="$(wget -q --timeout=5 --server-response \
        --header="Authorization: Basic $(printf '%s' "$api_key" | base64)" \
        -O /dev/null \
        "$WAKATIME_API_URL/compat/wakatime/v1/users/current" 2>&1 \
        | awk '/^  HTTP/{print $2}' | tail -1 || echo "000")"
      ;;
    python3|python)
      status="$(
        "$HTTP_CLIENT" - <<EOF
import base64, urllib.request, socket

socket.setdefaulttimeout(5)

key = "$api_key"
url = "$WAKATIME_API_URL/compat/wakatime/v1/users/current"

auth = base64.b64encode(key.encode()).decode()
req = urllib.request.Request(url)
req.add_header("Authorization", f"Basic {auth}")

try:
    with urllib.request.urlopen(req) as r:
        print(r.status)
except Exception as e:
    if hasattr(e, "code"):
        print(e.code)
    else:
        print("000")
EOF
      )"
      ;;
  esac

  case "$status" in
    200) return 0 ;;
    401|403) return 1 ;;
    *) return 2 ;;
  esac
}

# ------------------------------------------------------------
# Read existing API key (if any)
# ------------------------------------------------------------
EXISTING_API_KEY=""

if [ -f "$WAKATIME_CFG" ]; then
  EXISTING_API_KEY="$(grep -E '^api_key\s*=' "$WAKATIME_CFG" | cut -d '=' -f2 | xargs || true)"
fi

API_KEY=""

# ------------------------------------------------------------
# Validation flow
# ------------------------------------------------------------
if [ -n "$EXISTING_API_KEY" ]; then
  if validate_wakapi_key "$EXISTING_API_KEY"; then
    log "✔ Wakapi API key is valid"
    API_KEY="$EXISTING_API_KEY"
  else
    case $? in
      1)
        warn "Stored Wakapi API key is invalid"
        ;;
      2)
        warn "Wakapi server unreachable — skipping validation"
        API_KEY="$EXISTING_API_KEY"
        ;;
    esac
  fi
fi


is_interactive() {
  [[ -t 0 && -t 1 ]]
}

timed_read() {
  local __var="$1"
  local prompt="$2"
  local timeout="${3:-5}"

  if ! is_interactive; then
    return 1
  fi

  read -r -t "$timeout" -p "$prompt" "$__var"
}

if [ -z "$API_KEY" ]; then
  log "🔐 Wakapi API key required"

  if ! is_interactive; then
    warn "Non-interactive environment detected — skipping API key setup"
    API_KEY=""
  else
    while true; do
      if ! timed_read INPUT_KEY "Enter your WakaTime API key (optional): " 5; then
        warn "No input received (timeout) — skipping API key setup"
        API_KEY=""
        break
      fi

      if [ -z "$INPUT_KEY" ]; then
        warn "No API key provided"

        if timed_read ABORT_CHOICE "Abort setup? (y/n): " 5; then
          case "$ABORT_CHOICE" in
            [Yy]*)
              log "Setup aborted - config will be created without API key"
              API_KEY=""
              break
              ;;
          esac
        else
          warn "No response — skipping API key setup"
          API_KEY=""
          break
        fi

        continue
      fi

      if validate_wakapi_key "$INPUT_KEY"; then
        log "✔ Wakapi API key is valid"
        API_KEY="$INPUT_KEY"
        break
      else
        case $? in
          1)
            error "API key is invalid"
            if timed_read CHOICE "Retry or abort? (r/a): " 5; then
              case "$CHOICE" in
                [Aa]*)
                  log "Setup aborted - config will be created without API key"
                  API_KEY=""
                  break
                  ;;
              esac
            else
              warn "No response — skipping API key setup"
              API_KEY=""
              break
            fi
            ;;
          2)
            warn "Wakapi server unreachable — saving key without validation"
            API_KEY="$INPUT_KEY"
            break
            ;;
        esac
      fi
    done
  fi
fi

# ------------------------------------------------------------
# Helper: create a temp file, write config, move it into place
# Uses sudo only when necessary, preserves ownership where reasonable
# ------------------------------------------------------------
write_config_atomic() {
  local cfg_path="$1"
  local api_url="$2"
  local api_key_val="$3"
  local tmp
  local can_write=0
  local sudo_used=0

  tmp="$(mktemp)" || { error "Failed to create temp file"; return 1; }

  # write content to temp (variables expanded)
  cat > "$tmp" <<EOF
[settings]
api_url = $api_url
api_key = $api_key_val
EOF

  # Check if we can move the temp file into place without sudo
  if [ -e "$cfg_path" ]; then
    if [ -w "$cfg_path" ]; then
      can_write=1
    else
      can_write=0
    fi
  else
    # cfg doesn't exist: try creating then remove — this tests writability of directory
    if touch "$cfg_path" >/dev/null 2>&1; then
      rm -f "$cfg_path"
      can_write=1
    else
      can_write=0
    fi
  fi

  if [ "$can_write" -eq 1 ]; then
    mv "$tmp" "$cfg_path"
  else
    # Use sudo to move into place and remember that we used sudo so we can chown to the user
    sudo mv "$tmp" "$cfg_path"
    sudo_used=1
  fi

  # Set secure permissions
  if [ "$sudo_used" -eq 1 ]; then
    sudo chmod 600 "$cfg_path"
    # Try to set ownership back to the invoking user (if possible)
    if [ -n "$SUDO_USER" ]; then
      sudo chown "$SUDO_USER:$SUDO_USER" "$cfg_path" >/dev/null 2>&1 || true
    fi
  else
    chmod 600 "$cfg_path"
  fi

  return 0
}

# ------------------------------------------------------------
# Read existing api_url (if any) and warn if it will be overwritten
# ------------------------------------------------------------
EXISTING_API_URL=""
if [ -f "$WAKATIME_CFG" ]; then
  EXISTING_API_URL="$(grep -E '^api_url\s*=' "$WAKATIME_CFG" | cut -d '=' -f2 | xargs || true)"
fi

if [ -n "$EXISTING_API_URL" ] && [ "$EXISTING_API_URL" != "$WAKATIME_API_URL" ]; then
  warn "Overwriting existing api_url ('$EXISTING_API_URL') with '$WAKATIME_API_URL'."
fi

# ------------------------------------------------------------
# Write config (atomic, reliable)
# ------------------------------------------------------------
log "🛠️  Writing WakaTime config..."
# ensure API_KEY variable is either empty string or contains the key (no surrounding quotes)
write_config_atomic "$WAKATIME_CFG" "$WAKATIME_API_URL" "$API_KEY"

log "Checking permissions"

# Fix ownership if run via sudo
if [ -n "$SUDO_USER" ]; then
  log "Giving sudoer the permissions..."
  sudo chown "$SUDO_USER:$SUDO_USER" "$WAKATIME_CFG"
fi

chmod 600 "$WAKATIME_CFG"

log "✅ WakaTime setup complete"