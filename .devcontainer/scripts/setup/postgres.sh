#!/usr/bin/env bash
set -e

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

echo "[postgres] Installing PostgreSQL..."
apt-get update -y
apt-get install -y postgresql postgresql-client sudo
rm -rf /var/lib/apt/lists/*

version_major=$(psql --version | awk '{print $3}' | cut -d. -f1)

mkdir -p "$PGDATA"
chown -R postgres:postgres "$PGDATA"
chmod 0700 "$PGDATA"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[postgres] Initializing database..."

    PWFILE=$(mktemp)
    echo "${POSTGRES_PASSWORD}" > "$PWFILE"
    chmod 600 "$PWFILE"
    chown postgres:postgres "$PWFILE"

    sudo -u postgres /usr/lib/postgresql/${version_major}/bin/initdb \
      -D "$PGDATA" \
      --username="$POSTGRES_USER" \
      --auth=scram-sha-256 \
      --pwfile="$PWFILE"

    rm -f "$PWFILE"

    echo "[postgres] Setting pg_hba.conf to scram-sha-256 for initdb..."
    cat > "$PGDATA/pg_hba.conf" <<EOF
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
host    all             all             0.0.0.0/0               scram-sha-256
EOF
    chown postgres:postgres "$PGDATA/pg_hba.conf"
fi

echo "[postgres] Temporarily switching pg_hba.conf to trust..."
cat > "$PGDATA/pg_hba.conf" <<EOF
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
host    all             all             0.0.0.0/0               trust
EOF
chown postgres:postgres "$PGDATA/pg_hba.conf"

echo "[postgres] Starting PostgreSQL service..."
service postgresql start

echo "[postgres] Setting user password and creating DB..."
sudo -u postgres psql <<EOF
ALTER USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';
CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};
EOF

echo "[postgres] Locking down pg_hba.conf to scram-sha-256..."
cat > "$PGDATA/pg_hba.conf" <<EOF
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
host    all             all             0.0.0.0/0               scram-sha-256
EOF
chown postgres:postgres "$PGDATA/pg_hba.conf"

echo "[postgres] Restarting PostgreSQL to apply secure auth..."
service postgresql restart

if [ -d "/etc/postgresql" ]; then
  echo "[postgres] Fixing Debian cluster pg_hba.conf to avoid peer auth issues..."
  DEBIAN_PG_HBA=$(find /etc/postgresql -name pg_hba.conf | head -n1)
  sed -i 's/local\s\+all\s\+postgres\s\+peer/local all postgres scram-sha-256/' "$DEBIAN_PG_HBA"
  service postgresql restart
fi

echo "[postgres] PostgreSQL setup is complete ✅"
