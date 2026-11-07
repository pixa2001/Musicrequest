# Spotify – Phase 1 (Entwicklungsbranch)

Historische Phase-1-Anleitung. Für den aktuellen Stand mit Playlist-Übernahme siehe [Phase 2](spotify-phase-2.md).

Status: Anmeldung und Suche implementiert, mit simulierten APIs getestet. Keine Playlist-Schreibzugriffe und keine Wiedergabe. Echte Spotify-Anmeldung benötigt eine eigene Client-ID und Spotify-Freigabe. Kein Merge nach `main` ohne Freigabe.

## Analyse des bestehenden Projekts

- Statisches HTML/CSS mit ES-Modulen; kein Build und keine Paketinstallation für den Betrieb.
- `src/client.js` lädt den offiziellen Supabase-Client vom bestehenden CDN. `src/config.js` enthält ausschließlich öffentliche Projektkonfiguration.
- DJ-Anmeldung: Supabase Auth; Datenzugriffe über DJ-RPCs und `is_dj()`-Prüfung. Private Realtime-Abonnements aktualisieren die Songlisten.
- Songkategorien, Duplikatbildung und der 30-Sekunden-Schutz liegen im bestehenden SQL/RPC `submit_song_request_v3`. Diese Dateien bleiben unverändert.
- Sieben auswählbare Kalendertage und Mitternachtswechsel in Europe/Berlin im Dashboard; gespeicherte Datenbank-Abende laufen weiterhin von 06:00 bis 06:00 Uhr.
- Spotify ist ein separater OAuth-Client, keine neue Supabase-Anmeldemethode. Es werden keine Datenbankmigrationen benötigt und keine bestehenden Zugangsdaten verändert.
- Dashboard-Theme, öffentliche Gästeoberfläche und TXT-Export bleiben erhalten; hinzu kommen ein kleiner Spotify-Button pro Song, eine Verbindungsoption und ein Suchdialog.

## Spotify Developer App einrichten

1. Im https://developer.spotify.com/dashboard eine App anlegen, Web API auswählen und die aktuellen Bedingungen lesen.
2. In den App-Einstellungen die folgende lokale Redirect-URI exakt registrieren:
   `http://127.0.0.1:8000/dj/spotify-callback.html`
   Groß-/Kleinschreibung, Pfad und Port müssen übereinstimmen. `localhost` nicht als Ersatz verwenden.
3. Die Client-ID kopieren, **nicht** den Client-Secret. Die Client-ID ist eine öffentliche App-Kennung.
4. Falls Spotify im Development Mode Testnutzer verlangt, das verwendete Spotify-Konto dort freigeben. Aktuelle Anforderungen an Premium, Nutzerlimits und App-Erstellung müssen im Developer Dashboard geprüft werden; sie wurden hier nicht live verifiziert.
5. Client-ID entweder im DJ-Dashboard unter „Spotify verbinden“ → „Spotify-Verbindung einrichten“ speichern (nur dieser Browser) oder in `src/spotify-config.js` bei `SPOTIFY_CLIENT_ID` eintragen. Keine Tokens und keinen Client-Secret in diese Datei schreiben.
6. Die Anwendung berechnet die Redirect-URI in `src/spotify-config.js` aus ihrem eigenen Ursprung und Pfad. Der tatsächlich benötigte Wert wird im Dialog angezeigt. Für einen später genehmigten Produktionsbetrieb lautet er:
   `https://pixa2001.github.io/Musicrequest/dj/spotify-callback.html`
   Dieser Pfad ist auf der Live-Seite erst nach einem ausdrücklich freigegebenen Merge verfügbar. Für Phase 1 lokal testen.

## Auf dem Mac selbst testen

Im bestehenden Repository den Branch `feature/spotify-phase-1` auschecken. Vor einem Branchwechsel eigene Änderungen sichern. Keine Produktionsdateien manuell ersetzen.

```sh
git fetch origin
git switch feature/spotify-phase-1
python3 -m http.server 8000 --bind 127.0.0.1
```

Im Mac-Browser `http://127.0.0.1:8000/dj/` öffnen:

1. Mit dem bestehenden DJ-Konto anmelden. Kategorien, Datumsauswahl und bestehende Songs prüfen.
2. „Spotify verbinden“ öffnen, Client-ID speichern und die angezeigte Redirect-URL mit der App-Konfiguration vergleichen.
3. „Mit Spotify verbinden“ anklicken und die Anmeldung bei Spotify bestätigen. Der Browser kehrt zum DJ-Dashboard zurück; die bestehende Supabase-Sitzung bleibt erhalten.
4. Bei einem vorhandenen Song das grüne Spotify-Symbol anklicken. Der Dialog sucht nach Songtitel und Künstler. Alternativ die Suche manuell ändern.
5. Cover, Songtitel und Künstler vergleichen und einen Treffer auswählen. Über „Auf Spotify öffnen“ die Originalseite aufrufen. Auswahl allein verändert noch keine Playlist und markiert den Wunsch nicht als gespielt.
6. Escape/Schließen, TXT-Export, Gespielt/Wiederöffnen, Gespielte anzeigen und Smartphone-Breite prüfen.
7. „Spotify trennen“ trennt nur die lokale Spotify-Sitzung. DJ-Abmelden schließt den Dialog und entfernt ebenfalls lokale Spotify-Tokens. Eine erteilte App-Berechtigung kann zusätzlich im Spotify-Konto widerrufen werden.

Bei einem leeren Tag sind keine Song-Buttons vorhanden; über „Spotify verbinden“ kann trotzdem eine manuelle Suche getestet werden.

## Sicherheit und Fehlerfälle

- Authorization Code mit PKCE/S256; zufälliger Verifier und State, zehn Minuten Gültigkeit, State-Prüfung vor Token-Austausch, Einmalverwendung.
- Code/State werden auf der Callback-Seite sofort aus der URL entfernt; keine Tokens in URLs oder Logs.
- Tokens und PKCE-Daten nur im `sessionStorage` des aktuellen Tabs. Client-ID im `localStorage` ist kein Geheimnis. Das Schließen des Tabs beendet die lokale Sitzung; kein dauerhaftes Refresh-Token im Repository oder in Supabase.
- Phase 1 fordert keine Playlist-, Playback- oder Profil-Scopes an. Suche läuft über die Spotify Web API mit Benutzer-Token.
- Token-Erneuerung vor Ablauf sowie genau ein Refresh/Retry bei HTTP 401. HTTP 403 und 429 bekommen verständliche Meldungen; kein unbeschränktes Wiederholen.
- Fehlende/abgelehnte Anmeldung, falscher State, abgelaufene Anmeldung, leere Ergebnisse und Verbindungsprobleme werden angezeigt. API-Texte werden als Text und nicht als HTML gerendert; externe Cover-/Track-Links sind auf Spotify-Ziele begrenzt.
- Wie bei jeder Browser-App können gleichursprüngliche Skripte auf den Sitzungsspeicher zugreifen. Ein Secret im Frontend wäre keine Absicherung. Keine zusätzlichen fremden Skripte für Spotify eingebunden.

## Automatisierte Tests

Die Python-Tests benötigen Playwright und Chromium. In dieser Cloud-Umgebung sind beide vorhanden; der Browserpfad im Test ist `/usr/bin/chromium`. Für einen anderen Rechner den Browserpfad anpassen oder die Tests in der eingerichteten Cloud-Umgebung ausführen.

```sh
python3 -m unittest discover -s tests -p 'test_spotify.py' -v
```

Im Cloud-Testlauf wurden 13 Browser-Integrationstests erfolgreich abgeschlossen. Alle Spotify-/Supabase-Antworten sind simuliert. Tests prüfen PKCE einschließlich SHA-256-Challenge, State/Replay/Abbruch, Refresh und 401, Rate Limits, sichere Ergebnisdarstellung, manuelle Auswahl, Logout, mobile Darstellung sowie Gespielt und TXT-Export. Diese Tests belegen keine reale App-Freigabe oder Spotify-Verfügbarkeit.

## Offizielle Quellen und noch offene Prüfung

Die folgenden offiziellen Seiten waren am 07.11.2026 aus dieser Umgebung durch die Netzwerkregel blockiert (Proxy HTTP 403). Ihre aktuellen Inhalte wurden **nicht** als gelesen oder bestätigt gewertet:

- PKCE: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Redirects: https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
- Suche: https://developer.spotify.com/documentation/web-api/reference/search
- Development Mode: https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Spotify Developer Policy: https://developer.spotify.com/policy
- djay/Spotify: https://www.algoriddim.com/spotify
- djay-Hilfe: https://help.algoriddim.com/

Im Cloud-Konfigurationsentwurf sind zusätzlich zu der bestehenden Supabase-Domain die Domains `developer.spotify.com`, `accounts.spotify.com`, `api.spotify.com`, `www.algoriddim.com` und `help.algoriddim.com` vorgemerkt. Dieser Entwurf ist keine angewendete Netzfreigabe. Für die Recherche die Änderungen in den Umgebungseinstellungen prüfen und speichern; falls die Oberfläche es verlangt, anschließend die Cloud-Umgebung veröffentlichen. Danach den Abruf erneut prüfen. Das ist getrennt von einem GitHub-Merge oder Webseiten-Deployment.

## Nächste Phasen – noch nicht implementiert

- **Phase 2:** Playlist „Taberna Flamenca – Requests“ auswählen/anlegen, minimale benötigte Playlist-Scopes ergänzen, Treffer nach Bestätigung hinzufügen, vorhandene URIs auf Duplikate prüfen und erfolgreiche Übernahme anzeigen. Erst nach erfolgreichem realem Phase-1-Test und Prüfung der geltenden Spotify-Regeln.
- **Phase 3:** Auf dem eigenen Mac in der aktuellen djay-Version Spotify anmelden, Playlist öffnen und prüfen, wie Änderungen neu geladen werden. Mit zwei Testtiteln untersuchen, ob eine bereits gestartete Automix-Warteschlange nachträgliche Playlist-Ergänzungen übernimmt. Hier wurde kein Mac/djay gesteuert oder getestet; automatisches Übernehmen wird nicht versprochen.
- **Phase 4:** In der offiziellen djay-Dokumentation prüfen, ob eine unterstützte Schnittstelle zum direkten Einreihen in Automix existiert. Solange das nicht bestätigt ist, nur die Playlist als mögliche Zwischenlösung behandeln. Keine simulierten Mausklicks/Tastatureingaben implementieren.

Vor gewerblichem Einsatz müssen die aktuellen Spotify-/djay-Bedingungen und Rechte für öffentliche Musikwiedergabe geprüft werden. Eine technisch funktionierende Suche oder ein Premium-Konto ist keine Bestätigung für eine zulässige gewerbliche DJ-/Automix-Integration. Insbesondere mögliche Spotify-Einschränkungen für DJ-/Mixing-Anwendungen müssen vor weiteren Integrationsphasen geklärt sein.
