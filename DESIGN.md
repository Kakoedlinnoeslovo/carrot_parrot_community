# Design system: Community feed

Semantic specification for the **Community** surface (`/community`) — a Higgsfield-inspired, content-first masonry feed with Antigravity-style glass, depth, and motion discipline.

## Atmosphere

- **Mood:** Cinematic dark UI; media leads, chrome recedes.
- **Density:** Masonry columns; tiles vary in height with media aspect.
- **Brand alignment:** Carrot Parrot orange accent on an zinc-950 / black field (see root layout).

## Semantic tokens

| Token | Role | Tailwind / value (reference) |
|--------|------|------------------------------|
| `background.page` | App shell | `bg-zinc-950` (inherits body) |
| `surface.card` | Tile base | `bg-zinc-900/40`, `border-white/10` |
| `surface.glass` | Overlays (author pill, actions) | `bg-black/35`–`black/55`, `backdrop-blur-xl`, `border-white/15`–`20` |
| `accent.primary` | CTAs, active sort, initials fallback | `orange-400` / `orange-500/25` |
| `text.primary` | Titles on scrim | `text-white`, `text-zinc-100` |
| `text.muted` | Subcopy, counts | `text-zinc-400`, `text-zinc-500` |
| `elevation.card` | Floating tile | Large soft shadow (`shadow-[0_24px_64px_-28px_rgba(0,0,0,0.75)]`), stronger on hover |

## Layout

- **Max width:** `max-w-[1600px]`, horizontal padding `px-4 md:px-8`, vertical `py-10`.
- **Masonry:** `columns-2 sm:columns-3 lg:columns-4`, gutter `gap-4`.
- **Items:** `break-inside-avoid`, `mb-4` per card — prevents awkward splits across columns.
- **Header:** Title + subtitle + workflow count; sort pills (`Recent` / `Trending`) as full-width row on small screens, end-aligned on `md+`.

## Components

### Sort tabs

- Pill shape, `rounded-full`, border + translucent fill.
- Active: accent border/fill (`orange-500/40`, `orange-500/15`).
- Inactive: neutral glass; hover brightens border/background.

### Community workflow card

1. **Media layer (z-0):** Image (`loading="lazy"`) or video (`preload="none"`, muted, loop, playsInline) or gradient **placeholder** when no cover/graph URL.
2. **Scrim:** Gradient `from-black/80` bottom for title legibility.
3. **Primary link (z-10):** Full-bleed `TrackedLink` to `/w/{slug}`; focus ring `orange-400/80`.
4. **Author row (z-30, pointer-events none):** Glass pill — avatar (`user.image` or initials on `orange-500/25`) + display name.
5. **Title (z-20, pointer-events none):** Two-line clamp over scrim.
6. **Actions (z-30):** `LikeButton`, `RemixButton` (logged in) or `Log in` link; dense styling (`text-xs`, stronger glass).
7. **Video affordance:** Small play glyph on video tiles.

Stacking: actions and author must sit **above** the full-bleed link (`z-30` vs `z-10`) so buttons remain clickable.

### Preview selection (data)

- Prefer `coverImageUrl` (https).
- Else first suitable URL from `extractGraphMediaHints(graph)`.
- Else placeholder gradient (orange/zinc).

## Motion

- **Card entrance:** `.community-card-enter` — fade + slight `translateY(10px)`, `0.55s ease-out`, stagger via `animation-delay` (`index * 50ms`, capped).
- **Hover (motion-safe):** Card border/shadow transition `300ms ease-out`; optional subtle media `scale-[1.02]` (~500ms).
- **Video:** Preview plays while pointer is over the **card** (`onMouseEnter` / `onMouseLeave` on `article`) when `prefers-reduced-motion: no-preference`; otherwise no autoplay.
- **`prefers-reduced-motion: reduce`:** No card entrance animation; no video hover play.

Avoid continuous animation of `box-shadow` or `filter`.

## Accessibility

- Community link: explicit `aria-label` including workflow title.
- Sort links: `aria-current="page"` on active tab; `role="tablist"` on container with `aria-label`.
- Images/video previews: decorative tiles use `alt=""` / `aria-hidden` where appropriate; primary description lives on the public workflow page.
- Focus: visible focus ring on the overlay link; interactive controls remain keyboard-reachable (z-order).

## Analytics

- Card navigation: `TrackedLink` `eventLabel: community_open_workflow` (via `navCtaClick`).
- Likes / remix: existing `community_like_toggle`, `community_remix_success`.
