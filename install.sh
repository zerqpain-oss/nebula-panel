#!/usr/bin/env bash
set -euo pipefail

# ============ Nebula Panel – Installer ============
# Installation:
#   curl -fsSL https://raw.githubusercontent.com/DEINUSER/nebula-panel/main/install.sh | sudo bash
# Update:
#   gleicher Befehl erneut ausführen (config.json bleibt erhalten)
# Entfernen:
#   sudo bash install.sh --uninstall

REPO="DEINUSER/nebula-panel"   # <-- VOR dem Hochladen anpassen (GitHub-User/Repo)!
BRANCH="main"
DIR="/opt/nebula"
SVC="nebula"
PORT="${PORT:-8484}"

[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo bzw. als root ausführen."; exit 1; }

# --- Deinstallation ---
if [ "${1:-}" = "--uninstall" ]; then
  systemctl disable --now "$SVC" 2>/dev/null || true
  rm -f "/etc/systemd/system/$SVC.service"
  systemctl daemon-reload
  rm -rf "$DIR"
  echo "Nebula Panel wurde entfernt."
  exit 0
fi

echo "==> Nebula Panel Installer"

# --- Node.js >= 18 sicherstellen ---
need_node=1
if command -v node >/dev/null 2>&1; then
  v=$(node -e 'console.log(process.versions.node.split(".")[0])')
  [ "$v" -ge 18 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  echo "==> Node.js 20 wird installiert ..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates >/dev/null
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nodejs >/dev/null
  else
    echo "FEHLER: Weder apt noch dnf gefunden. Bitte Node.js >= 18 manuell installieren und Skript erneut ausführen."
    exit 1
  fi
fi
echo "==> Node $(node -v) vorhanden"

# --- Code von GitHub holen ---
echo "==> Lade Nebula Panel ($REPO, Branch $BRANCH) ..."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar -xz -C "$TMP" --strip-components=1

# --- Dateien installieren (config.json wird nie überschrieben) ---
mkdir -p "$DIR"
cp -rT "$TMP" "$DIR"
rm -f "$DIR/install.sh.tmp" 2>/dev/null || true

# --- Dienstbenutzer ---
if ! id -u nebula >/dev/null 2>&1; then
  useradd -r -s /usr/sbin/nologin -d "$DIR" nebula 2>/dev/null || useradd -r -s /sbin/nologin -d "$DIR" nebula
fi
chown -R nebula:nebula "$DIR"

# --- systemd-Dienst ---
cat > "/etc/systemd/system/$SVC.service" <<EOF
[Unit]
Description=Nebula Media Control Panel
After=network.target

[Service]
WorkingDirectory=$DIR
ExecStart=$(command -v node) $DIR/server.js
User=nebula
Group=nebula
Environment=PORT=$PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SVC" >/dev/null 2>&1 || true
systemctl restart "$SVC"

sleep 1
if ! systemctl is-active --quiet "$SVC"; then
  echo "WARNUNG: Dienst läuft nicht. Log ansehen mit: journalctl -u $SVC -n 30"
  exit 1
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "=================================================="
echo "  Fertig! Nebula Panel läuft."
echo ""
echo "  Im Browser öffnen:  http://${IP:-<server-ip>}:$PORT"
echo ""
echo "  1. Beim ersten Aufruf ein Passwort festlegen"
echo "  2. Unter 'Einstellungen' URLs + API-Keys von"
echo "     Sonarr, Radarr, SABnzbd, Plex, Prowlarr eintragen"
echo ""
echo "  Update:     Installer einfach erneut ausführen"
echo "  Logs:       journalctl -u $SVC -f"
echo "  Entfernen:  sudo bash install.sh --uninstall"
echo "=================================================="
