# Taberna Flamenca · Musicrequest

Existing QR song-request app, now extended with a three-category DJ dashboard.
GitHub Pages frontend: https://pixa2001.github.io/Musicrequest/
DJ login: https://pixa2001.github.io/Musicrequest/dj/

## IMPORTANT: database upgrade required

**Before testing the new features**, copy the entire file
[`supabase/migrations/20261105_dj_upgrade.sql`](supabase/migrations/20261105_dj_upgrade.sql)
into the **Supabase SQL Editor** of the EXISTING Musicrequest project and run it.

- Do **not** re-run the original `supabase/schema.sql` on the existing project.
- This migration adds columns, procedures and DJ-evening records without deleting the existing song requests or login credentials.
- Existing requests are assigned to an evening from the original request timestamp in Europe/Berlin.
- DJ evenings run from **06:00 local time to 06:00 the following day**, so midnight does not end the evening.
- Requests are grouped within **60 minutes measured from the FIRST request**, only within the same DJ evening; misspelling matching is deliberately conservative.

The guest form falls back to the original RPC before the migration, but the categorization, export, evening list, server-side cooldown and cleanup require the migration.

## Guest experience

Guests see three English fields: Your Name, Song Title and Artist. No DJ access or song listings.
The new `submit_song_request_v2` RPC records a randomly generated browser token as a one-way MD5 hash and enforces **one submission per browser token per 30 seconds**. The guest UI shows an English, friendly cooldown notice.

**Important limitation:** This is server-enforced per anonymous *browser token*, not a guaranteed per-human limit. Guests who delete their browser storage or use another browser/device can bypass it. Robust per-IP limits need a trusted gateway or a CAPTCHA. No IP addresses are collected by this implementation.

## DJ dashboard

- Desktop: **three equal columns**, Latino / Spanisch; Karneval / Deutsch; Englisch / International.
- Mobile: three horizontal scroll-snap panels, one screen wide, swipe left or right.
- Rows sorted by original entry timestamp. Each displays stable ordinal position, song title, artist, guest names, +N duplicates and “Gespielt”.
- Played changes the existing `played` flag; no song record is deleted.
- The DJ can move songs between categories; the original timestamp and guest names are unchanged.
- Rule-based automatic categorization is intentionally conservative; unknown songs default to International. No paid catalog metadata or third-party song lookup is used.
- DJ evening selector allows past evenings to be viewed until retention deletes them.
- TXT export reads **all server-returned rows of the selected evening**, even if the UI hides played songs. Similar songs across separate 60-minute batches are combined for export.
- Existing Supabase Auth/DJ account remain unchanged.

## Automated cleanup: one manual GitHub setup step

After applying the migration, add a GitHub Actions **repository secret** named
`SUPABASE_SERVICE_ROLE_KEY` at
[Settings → Secrets and variables → Actions](https://github.com/pixa2001/Musicrequest/settings/secrets/actions).

Paste your **Supabase service_role secret** there, and **never** in a GitHub source file,
chat message, or browser JavaScript. This secret is only read by the scheduled GitHub runner.
The workflow file is `.github/workflows/cleanup.yml`; it runs daily at 10:17 UTC and may
also be launched manually under **Actions → Delete expired DJ evenings → Run workflow**.

The SQL deletion RPC is limited to requests authenticated with the service role.
It deletes a DJ evening only if its `ends_at` is **more than seven days in the past**
AND no associated request was submitted within the last seven days.
It then deletes requests, groups and the empty DJ-evening record, in that order.
Never run cleanup manually before exporting an evening you need to retain.

**GitHub scheduled workflows can run late or be temporarily disabled due to inactivity.**
The exact cleanup instant is therefore not guaranteed; the seven-day rule is a minimum
retention period, not a precise deletion deadline.

## Testing checklist (after SQL migration)

1. Submit a test song through the public guest form. Confirm success.
2. Log in to the DJ dashboard and verify it appears in the appropriate column.
3. Change category in its dropdown; confirm no loss of timestamp/names.
4. Submit same song from another browser within 60 min; confirm +1 and original position.
5. Submit from the SAME browser again within 30 seconds; confirm cooldown.
6. Click Gespielt: row is hidden; toggle “Gespielte anzeigen” and verify it remains.
7. Export TXT and confirm played songs included.
8. Use mobile width: swipe horizontally across all three columns.
9. To test cleanup safely, first run a SELECT (not a DELETE) in the SQL Editor:
   `select id,session_date,ends_at from public.dj_events order by session_date desc;`
   Then manually trigger the workflow; *do not forge the database clock or set existing event dates into the past*.

No real login credentials or database password should be added to this public repository.

## Notes

Frontend Javascript syntax can be checked independently, but full end-to-end tests require
the live Supabase SQL migration and a DJ login. Do not assume the server-side features work
until those tests pass.
