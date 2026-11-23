#!/usr/bin/env bash
# Forward the host's adb server onto the gateway address of one or more Docker
# bridge networks, so containers can reach it without exposing adb on the LAN.
#
# Usage:   ./start-adb.sh [network ...]      (default network: bridge)
# Example: ./start-adb.sh ticketer_devcontainer_finueva-dev
# Env:     ADB_PORT (default 5037)

set -eo pipefail

ADB_PORT="${ADB_PORT:-5037}"
PIDS=()

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

run_privileged() {
  local uid
  uid=$(id -u)

  if [ "$uid" -eq 0 ]; then
    "$@"
    return
  fi

  sudo "$@"
}

install_socat() {
  if has_cmd socat; then
    return 0
  fi

  echo "socat not found, installing..."

  if has_cmd apt-get; then
    run_privileged apt-get update
    run_privileged apt-get install -y socat
  elif has_cmd dnf; then
    run_privileged dnf install -y socat
  elif has_cmd pacman; then
    run_privileged pacman -S --noconfirm socat
  elif has_cmd zypper; then
    run_privileged zypper install -y socat
  elif has_cmd apk; then
    run_privileged apk add socat
  else
    echo "No supported package manager found. Install socat manually." >&2
    return 1
  fi
}

# Prints the first IPv4 gateway of a Docker network.
get_gateway() {
  local network="$1"
  local template='{{range .IPAM.Config}}{{.Gateway}} {{end}}'
  local gateways
  local gateway

  gateways=$(docker network inspect "$network" --format "$template" 2>/dev/null || true)

  for gateway in $gateways; do
    case "$gateway" in
      *:*) continue ;;
    esac

    echo "$gateway"
    return 0
  done

  return 1
}

probe_tcp() {
  local host="$1"
  local port="$2"

  timeout 2 bash -c "exec 3<>/dev/tcp/${host}/${port}" >/dev/null 2>&1
}

# Prints the socat target for whichever loopback address adb is listening on.
find_upstream() {
  if probe_tcp 127.0.0.1 "$ADB_PORT"; then
    echo "TCP4:127.0.0.1:${ADB_PORT}"
    return 0
  fi

  if probe_tcp ::1 "$ADB_PORT"; then
    echo "TCP6:[::1]:${ADB_PORT}"
    return 0
  fi

  return 1
}

ensure_adb_server() {
  if ! has_cmd adb; then
    echo "adb not found on the host." >&2
    return 1
  fi

  adb start-server
}

cleanup() {
  local pid

  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}

main() {
  local networks=("$@")
  local network
  local gateway
  local upstream
  local listen_arg
  local pid

  if ! has_cmd docker; then
    echo "docker not found on this host." >&2
    return 1
  fi

  install_socat
  ensure_adb_server

  upstream=$(find_upstream || true)

  if [ -z "$upstream" ]; then
    echo "adb server is not accepting connections on 127.0.0.1:${ADB_PORT} or [::1]:${ADB_PORT}." >&2
    echo "Check what owns the port: ss -ltnp | grep ${ADB_PORT}" >&2
    return 1
  fi

  echo "adb server found: ${upstream}"

  if [ "${#networks[@]}" -eq 0 ]; then
    networks=(bridge)
  fi

  trap cleanup EXIT
  trap 'exit 130' INT TERM

  for network in "${networks[@]}"; do
    gateway=$(get_gateway "$network" || true)

    if [ -z "$gateway" ]; then
      echo "Could not find a gateway for Docker network '${network}' (is it created yet?)." >&2
      return 1
    fi

    listen_arg="TCP-LISTEN:${ADB_PORT},bind=${gateway},fork,reuseaddr"

    socat "$listen_arg" "$upstream" &
    pid=$!
    PIDS+=("$pid")

    sleep 0.5

    if ! kill -0 "$pid" 2>/dev/null; then
      echo "socat could not bind ${gateway}:${ADB_PORT}. Is an old socat still running? (ss -ltnp | grep ${ADB_PORT})" >&2
      return 1
    fi

    echo "Forwarding ${gateway}:${ADB_PORT} -> ${upstream} (network: ${network})"
    echo "  container env: ADB_SERVER_SOCKET=tcp:${gateway}:${ADB_PORT}"
  done

  echo "Running. Press Ctrl-C to stop."
  wait
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi