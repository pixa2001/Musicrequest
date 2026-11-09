# Urban Boho DJ dashboard — review branch

Branch: `design/urban-boho-dashboard`. No merge or deployment without user approval.

## Scope

The dashboard uses a new, final DJ-only stylesheet `dj/boho.css`. It is loaded
after the existing dashboard and Spotify styles. The guest form, shared styles,
original logo, `src/` logic, Supabase configuration/migrations and deployment
workflows are unchanged. No new application JavaScript or dependencies.

The style keeps the existing header, stats/action bar and the Latino / German /
International column order. Existing actions retain their meanings: the triangle
marks a request played; the green Spotify button adds to the chosen playlist,
not to djay playback. No new genre-move control or decorative fake menu is added.

Warm plaster texture, restrained amber/magenta/petrol outlines, a local Kaushan
Script heading (existing licensed font asset), cream sans-serif body text,
photographic flowers, palms and Moroccan lanterns match the guest page's identity.
The already approved guest page and its Bangers heading are intentionally kept.
Spectrum and lower wave animations, including reduced-motion behavior, remain.
Spotify dialogs and the login panel receive matching warm visual colours only.

`assets/boho/dj-top.webp` and `dj-bottom.webp` are optimized strips from an
AI-generated decorative wall artwork: no text, logo or interface is baked in.
They are pointer-inert pseudo-elements behind the interactive dashboard, not a
full screenshot background. A mobile fix scales their backgrounds inside the
viewport instead of widening the page.

## Validation

Run `python3 -m unittest discover -s tests -v` with the repository's current
Python Playwright/Chromium setup. Guest and Spotify/DJ integration tests use
fully simulated backend calls. The responsive dashboard check covers 390, 768,
1024, 1366 and 1672 px, horizontal overflow, column order, aligned columns,
stats/control bounds and visible spectrum. The consent test observes the existing
persistent playlist-help message rather than the transient search-status message.

Additional rendered review checks use twelve representative songs and verify
three equal columns on desktop/iPad and swipe panels on a phone. Review images
are actual browser screenshots, not generated UI mockups. No live Supabase or
Spotify records are created or modified in these tests. Native iPad Safari was
not tested; Chromium at iPad landscape width was used. A manual Safari review
remains recommended before publishing.

## Preview

From the repository root on this branch, run
`python3 -m http.server 8000 --bind 127.0.0.1` and open the DJ page locally.
The existing DJ and Spotify authentication still apply. No database migration,
credential change or new installation step is required.
