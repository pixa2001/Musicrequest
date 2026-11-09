# Guest-only decorative assets

`top-decor.webp`, `bottom-decor.webp` and `plaster.webp` are optimized decorative
crops from an AI-generated photographic boho-bar artwork created for this design.
They contain no logo, text, form controls or user data. The source artwork is
retained separately in the workspace's `generated_images` directory.

The original Taberna Flamenca logo remains `../taberna-round-hq.png`, unchanged.
Decorations are pointer-inert, hidden from assistive technology and restricted
to the public guest page. They are separate from the real HTML form controls.

Typography: Kaushan Script, Latin subset in `../fonts/KaushanScript-Latin.woff`.
Source: https://github.com/google/fonts/tree/main/ofl/kaushanscript
License: SIL Open Font License, included as `../fonts/KaushanScript-OFL.txt`.

`relief.webp` is an additional AI-generated light plaster material tile, optimized
to 512 pixels for category buttons, field surfaces and the gold call-to-action.
The headline now uses Water Brush and the categories use Kalam Bold, both from
the official Google Fonts repository under the included SIL Open Font Licenses
in `../fonts/`. All heading/button wording remains real text.

`tile-burgundy.webp`, `tile-ember.webp`, `tile-petrol.webp`, `tile-gold.webp` are
optimized blank photographic material assets extracted from a new AI-generated
four-material sheet. Their distressed plaster surfaces and irregular incandescent
rims are used only as backgrounds for the original live HTML controls; no text,
icons, form fields, or logo are embedded in the materials.

Current lettering: Sarina for the headline and Sriracha for category/send-button
labels, both locally hosted Latin subsets from the official Google Fonts
repository with their corresponding SIL Open Font Licenses in `../fonts/`.

Current design selection: the initial quieter theme is active again. Bangers
replaces only the headline (Google Fonts, SIL license in `../fonts/Bangers-OFL.txt`).
The later `relief.webp` / `tile-*.webp` materials and alternate lettering are
retained review alternatives and are not loaded by the active guest stylesheet.
