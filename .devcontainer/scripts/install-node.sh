#!/usr/bin/env bash
set -euo pipefail

if [ ! -w "$HOME/.local/share" ]; then
  sudo chown -R "$(id -u):$(id -g)" "$HOME/.local"
fi

FNM_DIR="$HOME/.local/share/fnm"

if [ ! -x "$FNM_DIR/fnm" ]; then
  curl -fsSL https://fnm.vercel.app/install -o /tmp/fnm-install.sh
  bash /tmp/fnm-install.sh --skip-shell --install-dir "$FNM_DIR"
fi

export PATH="$FNM_DIR:$PATH"
eval "$(fnm env --shell bash)"

fnm install --lts
fnm default lts-latest
fnm use lts-latest

node -v

if ! grep -q 'fnm env' "$HOME/.bashrc"; then
  echo 'export PATH="$HOME/.local/share/fnm:$PATH"' >> "$HOME/.bashrc"
  echo 'eval "$(fnm env --shell bash)"' >> "$HOME/.bashrc"
fi