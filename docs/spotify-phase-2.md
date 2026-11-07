# Spotify Phase 2 – Playlist-Übernahme

Entwicklungsbranch: `feature/spotify-phase-1` (enthält jetzt Phase 1 und 2).
Kein Merge nach `main` und kein Deployment ohne Freigabe.

## Auf dem Mac aktualisieren

Den laufenden Python-Server im Terminal mit Ctrl+C stoppen. Danach jede Zeile einzeln ausführen:

```sh
cd ~/Downloads/Musicrequest-Spotify-Test
git pull --ff-only
python3 -m http.server 8000 --bind 127.0.0.1
```

Im Browser `http://127.0.0.1:8000/dj/` neu laden. Client-ID und die registrierte Redirect-URL bleiben unverändert.

## Playlist-Berechtigung und Test

1. Im DJ-Dashboard erneut „Mit Spotify verbinden“ anklicken und die Playlist-Berechtigungen bei Spotify bestätigen. Eine alte Phase-1-Anmeldung kann weiter suchen, aber noch nicht auf Playlists zugreifen.
2. Einen Song suchen und die richtige Version manuell auswählen.
3. „Playlists laden“ zeigt eigene Playlists. Mit „Requests-Playlist anlegen / auswählen“ wird eine vorhandene eigene Playlist mit dem Namen **Taberna Flamenca – Requests** wiederverwendet oder eine neue **private** Playlist angelegt. Es werden keine fremden Playlists verändert.
4. Ziel-Playlist auswählen und „Zur Spotify-Playlist hinzufügen“ klicken. Nur dieser Klick übernimmt den Titel; Suchen oder Auswählen allein verändert keine Playlist.
5. Erfolgsmeldung prüfen und die Playlist in Spotify öffnen. Denselben Titel noch einmal hinzufügen: Es soll „Bereits … enthalten“ erscheinen und kein zweiter Eintrag entstehen.
6. Das Hinzufügen markiert den Musikwunsch nicht als gespielt. DJ-Abmeldung, Genres, Duplikatbildung in Supabase und TXT-Export bleiben unverändert.

## Technik und Fehlerfälle

OAuth-Berechtigungen: `playlist-read-private`, `playlist-modify-private`, `playlist-modify-public` und `user-read-private`. Die letzte Berechtigung dient dazu, eigene Playlists anhand des angemeldeten Spotify-Nutzers zu erkennen. Kein Playback- oder Mikrofonzugriff.

Die erteilten Scopes werden mit den kurzlebigen Sitzungstokens gespeichert und beim Refresh beibehalten. Fehlende Rechte führen zur Aufforderung, Spotify erneut zu verbinden.

Vor jedem Hinzufügen werden alle Seiten der Playlist gelesen und Track-URIs einschließlich Spotify-Relinking auf Duplikate geprüft. Unterschiedliche Aufnahmen/Remixe mit unterschiedlichen Spotify-URIs sind verschiedene Titel. Gleichzeitige Schreibzugriffe werden innerhalb dieses Browser-Tabs verhindert. Spotify bietet dabei keine atomare „nur hinzufügen, falls nicht enthalten“-Operation; zeitgleiche Änderungen aus mehreren Tabs oder Apps können weiterhin Duplikate verursachen.

Nach Verbindungsabbruch wird ein Schreibzugriff nicht automatisch wiederholt. Bitte die Playlist überprüfen und neu laden. Ein neuer Hinzufügen-Versuch prüft zuerst erneut auf Duplikate. Bei HTTP 401 erfolgt Token-Erneuerung; bei 403 und 429 eine verständliche Meldung.

Verwendet werden die Spotify-Web-API-Endpunkte `me`, `me/playlists`, `playlists/{id}/items`. Für ältere API-Versionen erfolgt ausschließlich bei 404/405 ein Fallback auf `users/{id}/playlists` bzw. `playlists/{id}/tracks`. Unklare Netzwerkfehler lösen keinen solchen Fallback aus. Die offizielle Referenz wurde in dieser Cloud erneut mit Proxy HTTP 403 blockiert; die tatsächliche Spotify-Kompatibilität muss im lokalen Test bestätigt werden.

## Automatisierte Prüfung

```sh
python3 -m unittest discover -s tests -p 'test_spotify.py' -v
```

Die Tests simulieren Spotify und Supabase vollständig: PKCE, Refresh, Berechtigungen, Playlist laden/anlegen, bestehende Requests-Playlist wiederverwenden, Hinzufügen, Duplikate auf späteren Ergebnisseiten, Doppelklick und unsichere Netzwerkantworten. Es werden dabei keine echten Spotify-Playlists verändert.

## djay und Nutzung

Diese Phase schreibt ausschließlich in eine Spotify-Playlist. Sie verändert keine laufende djay-Automix-Warteschlange und automatisiert keine Mausklicks. Playlist-Aktualisierung und Automix werden in Phase 3 auf deinem Mac getestet. Die aktuelle offizielle djay-Dokumentation sowie Spotify-Bedingungen für die geplante gewerbliche DJ-Nutzung sind noch zu prüfen; erfolgreiche API-Aufrufe ersetzen diese Prüfung nicht.

## Direktübernahme per Spotify-Symbol

Ein normaler Klick auf das Spotify-Symbol im Dashboard übernimmt jetzt direkt den ersten verfügbaren Spotify-Suchtreffer für Songtitel und Künstler. Der tatsächlich übernommene Titel samt Künstler und Ziel-Playlist wird im Dashboard angezeigt. Dies ist eine bewusste Schnellübernahme, keine Garantie für die richtige Aufnahme/Remix-Version.

Die im Dialog ausdrücklich gewählte eigene Playlist wird als öffentliche Playlist-ID lokal je Spotify-App und -Konto gemerkt. Vor der Übernahme wird geprüft, ob sie weiterhin dem angemeldeten Konto gehört. Ohne gültige gemerkte Playlist wird die eigene „Taberna Flamenca – Requests“ verwendet beziehungsweise bei Bedarf privat angelegt.

„Manuell suchen“ neben der Statusmeldung öffnet die Suche für den betreffenden Wunsch. Alternativ öffnet Umschalt+Klick auf das Spotify-Symbol sofort die manuelle Suche. Bei fehlendem Treffer oder fehlender Anmeldung öffnet sich der Dialog automatisch. Ein bereits übernommener falscher Titel wird dabei nicht automatisch gelöscht; bei Bedarf direkt in Spotify entfernen.

Die Duplikatprüfung bleibt aktiv. Schnellklicks werden während einer laufenden Übernahme blockiert; unsichere Schreibzugriffe werden nicht automatisch erneut gesendet. Eine manuelle Playlist-Änderung ist während der Direktübernahme gesperrt. Die Titelwahl selbst wird bei einem normalen Symbol-Klick ausdrücklich nicht nochmals bestätigt.
