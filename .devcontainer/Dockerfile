FROM mcr.microsoft.com/devcontainers/base:noble
RUN userdel -r vscode 2>/dev/null || true \
    && groupdel vscode 2>/dev/null || true

RUN groupadd --gid 1000 coder \
    && useradd --uid 1000 --gid 1000 --shell /bin/bash --create-home coder || true \
    && echo "coder ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/coder \
    && chmod 0440 /etc/sudoers.d/coder

# Node.js 24 (matches CI and the production image). pnpm comes from corepack, pinned by package.json#packageManager.
RUN apt-get update && apt-get install -y curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && corepack enable \
    && rm -rf /var/lib/apt/lists/*

# Tooling: git/gh for the repo, sqlite3 to inspect the local database in .data/db/sqlite.db.
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    iproute2 \
    net-tools \
    iputils-ping \
    gh \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

COPY ./scripts/setup/git.sh /usr/local/bin/setup-git.sh
COPY ./scripts/setup/dev.sh /usr/local/bin/setup-dev.sh
RUN chmod +x /usr/local/bin/setup-git.sh /usr/local/bin/setup-dev.sh

# Named volumes copy ownership from the image on first mount; create the pnpm store dir as coder so installs can write.
RUN mkdir -p /home/coder/.local/share/pnpm && chown -R coder:coder /home/coder/.local

USER coder
