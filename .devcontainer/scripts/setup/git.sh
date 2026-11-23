#!/usr/bin/env bash
set -e

is_interactive() {
  [[ -t 0 && -t 1 ]]
}

token_has_scopes() {
  local required=("read:packages" "repo")
  local scopes

  scopes="$(
    gh api -i /user 2>/dev/null \
      | awk -F': ' 'tolower($1)=="x-oauth-scopes"{print $2}' \
      | tr -d '\r'
  )" || return 1

  for scope in "${required[@]}"; do
    if ! grep -Eq "(^|, )${scope}(,|$)" <<< "$scopes"; then
      return 1
    fi
  done
}

setup_git_for_npm() {
  echo "🔎 Checking GitHub CLI authentication..."

  if gh auth status >/dev/null 2>&1 && token_has_scopes; then
    echo "✔ GitHub CLI already authenticated with package scopes"
  else
    if ! is_interactive; then
      echo "⚠️ Missing GitHub auth/scopes, but shell is non-interactive. Skipping login."
      return 0
    fi

    if gh auth status >/dev/null 2>&1; then
      echo "🔐 Refreshing GitHub token scopes..."
      gh auth refresh -h github.com -s read:packages -s repo
    else
      echo "🔐 Not authenticated — starting gh auth login"
      gh auth login --web --git-protocol ssh --scopes "read:packages,repo"
    fi
  fi

  NODE_AUTH_TOKEN="$(gh auth token 2>/dev/null || true)"

  if [ -n "$NODE_AUTH_TOKEN" ]; then
    export NODE_AUTH_TOKEN

    if ! grep -q 'export NODE_AUTH_TOKEN=' "$HOME/.bashrc" 2>/dev/null; then
      echo 'export NODE_AUTH_TOKEN="$(gh auth token 2>/dev/null || true)"' >> "$HOME/.bashrc"
    fi

    echo "✔ NODE_AUTH_TOKEN exported for npm private registry access."
  else
    echo "⚠️ Could not retrieve NODE_AUTH_TOKEN from gh."
  fi
}

setup_git_for_npm || echo "Error: pnpm setup skipped"
pnpm config set "//npm.pkg.github.com/:_authToken" "$NODE_AUTH_TOKEN" || echo "Error: pnpm config skipped"

if [[ -n "${NODE_AUTH_TOKEN:-}" ]] ; then
  echo "📡 Fetching GitHub user info..."
  GH_LOGIN="$(gh api user -q .login)"
  GIT_NAME="$(gh api user -q '.name // .login')"
  GIT_EMAIL="$(gh api user -q '.email // empty')"

  if [ -z "$GIT_EMAIL" ]; then
    echo "⚠️  GitHub email not public — using noreply address"
    GIT_EMAIL="${GH_LOGIN}@users.noreply.github.com"
  fi

  echo "🛠️  Configuring git identity..."
  git config --global user.name "$GIT_NAME"
  git config --global user.email "$GIT_EMAIL"

  echo "🔐 Configuring git to use GitHub CLI credentials..."
  gh auth setup-git

  # Configure SSH for better compatibility
  echo "🔑 Configuring SSH for Git repositories..."
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh

  # Add GitHub to known_hosts if not already there
  if ! grep -q "github.com" ~/.ssh/known_hosts 2>/dev/null; then
    ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null || true
    ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts 2>/dev/null || true
  fi

  echo "✅ Git setup complete"
  git config --list | grep '^user\.'

  # Clone additional services
  echo ""
  echo "📦 Cloning additional services..."
  /usr/local/bin/clone-services.sh
fi
