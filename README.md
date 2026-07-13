# Nebula · Media Control Panel

Ein Web-Panel für **Sonarr, Radarr, SABnzbd, Plex und Prowlarr** – Dashboard, Verwaltung und Einstellungen in einer Oberfläche.

## Schnellinstallation (Debian/Ubuntu)

Eine Zeile, installiert Node.js falls nötig, richtet alles als Dienst ein:

```bash
curl -fsSL https://raw.githubusercontent.com/DEINUSER/nebula-panel/main/install.sh | sudo bash
```

Danach `http://<server-ip>:8484` öffnen, Passwort festlegen, Dienste unter Einstellungen eintragen. **Update:** denselben Befehl einfach erneut ausführen (die eigene `config.json` bleibt erhalten). **Entfernen:** `sudo bash install.sh --uninstall`.

## Manuell: Voraussetzungen

Node.js **18 oder neuer** – sonst nichts. Keine npm-Pakete nötig.

## Starten

```bash
node server.js
```

Danach im Browser öffnen: `http://<server-ip>:8484`

Beim ersten Start legst du im Browser ein Panel-Passwort fest. Anschließend unter **Einstellungen** die URLs und API-Keys deiner Dienste eintragen (API-Keys findest du in den jeweiligen Apps unter Settings → General; den Plex-Token z. B. über die XML-Ansicht eines Mediums, Parameter `X-Plex-Token`).

Alle API-Aufrufe laufen über den Server als Proxy – die API-Keys verlassen den Server nie, und es gibt keine CORS-Probleme.

## Konfiguration

Wird in `config.json` neben `server.js` gespeichert (URLs, Keys, Passwort-Hash). Port ändern: `config.json` → `panel.port`, oder Umgebungsvariable `PORT`.

## Als Dienst (systemd)

```ini
[Unit]
Description=Nebula Panel
After=network.target

[Service]
WorkingDirectory=/opt/nebula
ExecStart=/usr/bin/node /opt/nebula/server.js
Restart=always
User=nebula

[Install]
WantedBy=multi-user.target
```

## Hinter nginx (Reverse Proxy)

Fertige Vorlagen liegen in `deploy/`: `nginx-nebula.conf` (sites-available) und `nebula.service` (systemd). Ablauf: Ordner nach `/opt/nebula` kopieren, Service installieren, nginx-Config verlinken, `nginx -t`, reload. Mit `HOST=127.0.0.1` lauscht das Panel nur lokal – erreichbar dann ausschließlich über nginx.

## Hinweise

- Dienste mit selbstsigniertem HTTPS: Start mit `NODE_TLS_REJECT_UNAUTHORIZED=0 node server.js` (oder besser HTTP-LAN-Adressen eintragen).
- Von außen erreichbar? Zusätzlich per Reverse Proxy mit HTTPS absichern.
- Login-Schutz: Nach 8 Fehlversuchen wird die IP 15 Minuten gesperrt.
