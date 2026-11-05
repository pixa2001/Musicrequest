# Taberna Flamenca · Music Requests

QR-code song request form and private live DJ dashboard, designed for running alongside djay Pro.

## Pages
- Guest form: `/` — English form with three required fields: guest name, song title, artist.
- DJ dashboard: `/dj/` — password-protected via Supabase Auth, chronological numbered rows, song title / artist / guest names, plus a `+N` badge for additional requests; mark played and reopen.

## Duplicate grouping
Requests for the same song/artist within **60 minutes of the FIRST request** are grouped, including close spelling variants using pg_trgm similarity. A request after 60 minutes receives a NEW numbered row. Automatic fuzzy matching can make mistakes; tune thresholds or add manual merging later if needed.

## Setup (required before requests work)
1. Create a Supabase project at https://supabase.com and copy **Project URL** and **publishable/anon key** into `src/config.js`. **NEVER use a service_role or secret key here.**
2. In Supabase SQL Editor run `supabase/schema.sql`. This creates tables, secure RPC functions, and real-time publication.
3. In Supabase **Authentication > Users**, add your DJ email and password. Copy its UUID and run in SQL Editor:
   `insert into public.dj_accounts(user_id) values ('YOUR-USER-UUID');`
4. In Auth settings, disable open public signups (DJ accounts should be admin-created).
5. Publish the static files via GitHub Pages (branch root or GitHub Actions). Both views are in one repository, at `/` and `/dj/`. GitHub Pages hosts **public static HTML**, even when source code is private; the DJ request data is secured by Supabase, not by a secret URL.
6. Once the guest URL works, print a QR code pointing to the guest URL only.

**Important:** This repository is an initial implementation, not a deployed or fully configured service. Requests will not be sent until Supabase is configured.

## How it works
- Guest form calls the Supabase `submit_evening_song_request` RPC (anonymous insert; no guest reads).
- DJ signs in with Supabase Auth; authorized DJ accounts can call read/update RPCs.
- Dashboard subscribes to realtime `song_requests` inserts, refreshing automatically. Refresh button is provided as fallback.
- Song data and guest names are kept in the backend, never shared with guests.
- No Spotify or djay Pro API integration; DJ selects songs manually.

## Operational notes
- Use a dedicated project and strong password.
- Fuzzy matching is approximate, not authoritative song identity verification.

## Upgrade eines bestehenden Projekts

1. Backup erstellen und die Schritte zunächst in einem Testprojekt durchführen. Bei einer bestehenden Installation nur `supabase/migrations/202611050001_dj_evenings.sql` ausführen. Bei einer Neuinstallation zuerst `supabase/schema.sql` und dann die Migration ausführen.
2. Die aktualisierten Seiten veröffentlichen. Im Gästeformular einen Wunsch senden, mit dem vorhandenen DJ-Konto anmelden und Kategorie, Gespielt-Status und TXT-Export prüfen.
3. Nach erfolgreichem Seitenwechsel `supabase/operations/disable_legacy_submission.sql` im SQL Editor ausführen. Bis zu diesem Schritt kann der alte öffentliche Einreichungsweg die Sperre umgehen. Bereits geöffnete ältere Gästeseiten danach neu laden.
4. Im DJ-Dashboard den Abend am Veranstaltungsende über **Abend beenden** abschließen. Der nächste erfolgreiche Wunsch eröffnet automatisch einen neuen Abend. Der Export verwendet den ausgewählten Abend und das Datum des ersten Wunsches in der Zeitzone Europa/Berlin. Bei exakten normalisierten Duplikaten im Export zählt die Kategorie des frühesten Eintrags.
5. Für die optionale automatische Bereinigung in Supabase Cron aktivieren, die Kandidaten mit `supabase/operations/retention_preview.sql` prüfen und erst dann `supabase/operations/enable_retention.sql` ausführen. Der Job prüft stündlich und löscht offene wie gespielte Wünsche eines abgeschlossenen Abends frühestens 168 Stunden nach seinem Ende. Zum Abschalten den Job `musicrequest-expired-evenings` im Cron-Dashboard entfernen.

Bereits vorhandene Wünsche erscheinen unter **Bestandswünsche** und werden ohne bestätigte Abendzuordnung von der automatischen Löschung ausgenommen. Die 30-Sekunden-Sperre verwendet eine zufällige Kennung pro Browserprofil. Sie speichert weder IP-Adressen noch Gästenamen in der Sperrtabelle. Wer den lokalen Speicher löscht oder ein anderes Browserprofil verwendet, kann eine neue Kennung erhalten. Die Kategorisierung verwendet eine kleine Liste bekannter Titel und Interpreten. Unklare Fälle landen bei Englisch / International.

Das Zeitfenster beginnt mit dem ersten Wunsch und endet nach genau 60 Minuten. Ab diesem Zeitpunkt wird ein neuer Eintrag angelegt.
