# Nebula Panel · Roadmap

Geplante Features, grob nach Ausbaustufen sortiert. Aufwand: **S** = klein (Stunden), **M** = mittel (Tage), **L** = groß.

## v2.1 – Quick Wins ✅ (umgesetzt)

- [x] **Benachrichtigungen** – Push per Telegram, Discord-Webhook oder ntfy bei: Import fertig, Download fehlgeschlagen, Health-Fehler, Speicherplatz knapp. Serverseitiger Watcher mit einstellbaren Regeln.
- [x] **iCal-Kalender-Export** – Abonnierbarer `/calendar.ics`-Endpunkt (mit Token), damit kommende Episoden/Filme/Alben direkt im Handy- oder Google-Kalender auftauchen.
- [x] **Interaktive Release-Suche** – Manuell aus allen gefundenen Releases wählen (Qualität, Größe, Seeder, Ablehngründe) – für Filme, Staffeln, Alben, Bücher und Wanted-Einträge.
- [x] **Log-Viewer** – Logs aller *arr-Dienste zentral einsehen und filtern.
- [x] **Blocklist-Verwaltung** – Blockierte Releases pro Dienst anzeigen und freigeben.
- [x] **Update-Hinweis** – Panel prüft GitHub und zeigt an, wenn eine neue Version verfügbar ist.

## v2.2 – Statistiken & Verlauf

- [ ] **Verlaufsdaten sammeln** (M) – Server schreibt periodisch Kennzahlen (Speicher, Bibliotheksgröße, Download-Volumen) in eine kleine Historie (JSON/SQLite).
- [ ] **Graphen-Seite** (M) – Bibliothekswachstum, Download-Volumen pro Tag, Speicherverlauf als richtige Charts.
- [ ] **Uptime-Monitoring** (S) – Verfügbarkeitsverlauf der Dienste mit Ausfall-Markierung (kombinierbar mit Benachrichtigungen).
- [ ] **Tautulli-Integration** (M) – Plex-Wiedergabestatistiken: meistgesehene Titel, Nutzer-Ranking, Watch-Time.

## v3 – Mehrbenutzer & Requests

- [ ] **Rollen & Benutzer** (L) – Mehrere Logins mit Rollen: Admin (alles), Nutzer (Dashboard + Anfragen), Gast (nur ansehen).
- [ ] **Request-System** (L) – Freunde/Familie wünschen sich Filme/Serien über eine einfache Suche; Admin gibt per Klick frei → landet automatisch in Radarr/Sonarr (Overseerr light).
- [ ] **Watchlist-Import** (M) – Trakt- oder IMDb-Watchlist automatisch mit Radarr/Sonarr abgleichen.
- [ ] **Audit-Log** (S) – Wer hat wann was gelöscht/hinzugefügt/geändert.

## Weitere Integrationen

- [ ] **Jellyfin/Emby** (M) – Als Alternative oder Ergänzung zu Plex (Streams, Bibliotheken, kürzlich hinzugefügt).
- [ ] **qBittorrent / NZBGet** (M) – Weitere Download-Clients neben SABnzbd steuern.
- [ ] **Backup-Manager** (M) – Konfigurations-Backups aller *arr-Dienste automatisch ziehen, versionieren und wiederherstellen.
- [ ] **Whisparr/Mylar & Co.** (S) – Weitere *arr-Ableger lassen sich dank generischem Modul mit wenigen Zeilen ergänzen.

## Betrieb & Verteilung

- [ ] **Docker-Image** (M) – Dockerfile + docker-compose.yml, Veröffentlichung über GitHub Container Registry.
- [ ] **Auto-Update-Skript** (S) – `update.sh`, das neue Version zieht und den Dienst neu startet (oder als Cron).
- [ ] **HTTPS-Doku** (S) – Fertige Anleitung für Caddy als einfachere nginx-Alternative mit Auto-TLS.

## Nice-to-have / Ideen-Parkplatz

- [ ] **Anpassbares Dashboard** – Karten ein-/ausblenden und per Drag & Drop anordnen, Layout wird gespeichert.
- [ ] **Kommandopalette** (Strg+K) – Schnellzugriff auf alle Aktionen und die globale Suche.
- [ ] **Weitere Sprachen** – Dank i18n-System nur ein neuer Wörterbuch-Block (z. B. FR, ES, NL).
- [ ] **PWA-Push** – Echte Push-Benachrichtigungen aufs Handy über Service Worker.
- [ ] **Themes** – Akzentfarben wählbar, optionales Light Theme, OLED-Schwarz.

---

Vorschläge & Wünsche gerne als GitHub-Issue einreichen.
