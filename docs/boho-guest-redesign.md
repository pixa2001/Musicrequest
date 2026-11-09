# Boho guest form — review branch

Branch: `feature/boho-guest-redesign`. Not merged or deployed to production.

The public guest form now uses warm plaster textures, photographic foliage and
lantern decorations, local cream brush lettering, warm gold input borders,
burgundy/amber/petrol category tiles and a textured gold send button. Existing
wording and the original logo are preserved. Layout uses real HTML controls;
the reference poster is not embedded as a form image.

## Scope

Only `index.html`, guest-specific `guest-theme.css`, new decorative/font assets,
this documentation and the guest regression tests are changed. Existing
`src/guest.js`, Supabase client/configuration, migrations, DJ dashboard and
shared stylesheet are untouched. No JavaScript dependency is added. Font license
and artwork provenance are in the asset directories. Decoration and font payload
is approximately 205 KB before HTTP compression, plus the existing logo.

## Validation

Run `python3 -m unittest discover -s tests -p 'test_guest_boho.py' -v` with the
existing Python Playwright and Chromium setup. Five browser integration tests
cover viewport widths 320, 375, 390, 430, 768, 1080 and 1440 px, asset/font loading,
touch targets, required validation, all category payloads, stable browser token,
form reset, existing success/rate-limit/setup/general-error messages, keyboard
focus and reduced motion. Supabase responses are mocked; no requests were added
to the live database. Browser page errors and failed asset responses are checked.

Screenshots are generated from the real HTML/CSS, not image mockups. Chromium
was tested; the WebKit executable is not installed in this environment, so native
iPhone Safari and Android-device checks remain for manual review. A real live
Supabase submission was intentionally not performed; it would create production
data. The original request logic is byte-for-byte unchanged.

## Preview

From the repository root, run `python3 -m http.server 8000 --bind 127.0.0.1` and
open the guest root page in your local browser. No build step or database change
is required. Compare the result on a phone before authorizing a merge. Do not
merge or deploy this branch without the user's explicit approval.
