FROM mcr.microsoft.com/devcontainers/base:noble
RUN userdel -r vscode 2>/dev/null || true \
    && groupdel vscode 2>/dev/null || true

RUN groupadd --gid 1000 coder \
    && useradd --uid 1000 --gid 1000 --shell /bin/bash --create-home coder || true \
    && echo "coder ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/coder \
    && chmod 0440 /etc/sudoers.d/coder
# Install Node.js
RUN apt-get update && apt-get install -y curl \
    && curl -sL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@latest

# Install other utilities and GitHub CLI
RUN apt-get update && apt-get install -y \
    git \
    ssh-client \
    openssh-client \
    iproute2 \
    net-tools \
    iputils-ping \
    gh \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y \
    libasound2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Create services directory
RUN mkdir -p /workspaces/services && chown coder:coder /workspaces/services

COPY ./scripts/setup/git.sh /usr/local/bin/setup-git.sh
RUN chmod +x /usr/local/bin/setup-git.sh

COPY ./scripts/setup/dev.sh /usr/local/bin/setup-dev.sh
RUN chmod +x /usr/local/bin/setup-dev.sh

COPY ./scripts/install-node.sh /usr/local/bin/install-node.sh
RUN chmod +x /usr/local/bin/install-node.sh

COPY ./scripts/setup/postgres.sh /usr/local/bin/setup-postgres.sh
RUN chmod +x /usr/local/bin/setup-postgres.sh

USER coder
