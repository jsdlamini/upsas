# QK Framework — Research Chain design system

A small, dependency-free CSS design system for dense, data-first academic
software. Two files:

| File            | Role                                                        |
|-----------------|-------------------------------------------------------------|
| `framework.css` | Reusable layer: tokens, primitives, utilities. App-agnostic.|
| `../globals.css`| App layer: shell, rail, sign-in, notifications, print, mobile. |

The app layer imports the framework (`@import './qk/framework.css'`) and is
the only place allowed to reference app-specific class names.

## Design language — "Entangled Violet, instrument panel"

Flat, hairline-structured, violet-accented. The metaphor is a lab instrument:
surfaces are separated by 1px rules and tint fills, never by shadows.

### Non-negotiable rules

1. **No deep shadows.** Components are flat. Elevation = borders + lightness.
   The single exception is `--overlay-shadow`, reserved for true overlays
   (bell dropdown, balloons, toasts). If you are about to write a
   `box-shadow` on a card, a button or a table, don't — use a border.
2. **`--brand-accent` is the tenant's identity.** Never hardcode a brand hex
   in app CSS; derive from `var(--brand-accent)`. The root layout sets it
   inline from the institution profile (`--brand-accent: #6633E6` by
   default). `--accent`, `--accent-hover`, `--accent-dim`, `--accent-line`
   and `--accent-contrast` all derive from it, per theme.
3. **Status colour means exactly three things.** `--moss` pass,
   `--ochre` watch, `--rust` problem. Nothing decorative borrows them.
4. **Section spectrum is wayfinding.** Each area (`[data-section]`, set by
   `src/lib/nav/section.ts`) carries one hue exposed as `--section`. It may
   appear in exactly four places: the active rail item, the bar under the
   page title, the table-header underline, and the page-top wash.
5. **No external fonts.** Only the `--sans` / `--serif` / `--mono` system
   stacks. The app must run with no outbound internet.
6. **Dark theme is a token swap, not a second stylesheet.** Add colours to
   the `[data-theme="dark"]` token block in `framework.css`; avoid
   theme-conditional rules outside it where a token will do.

### Button contract

| Intent                    | `.btn` class      | `<Button>` variant      |
|---------------------------|-------------------|-------------------------|
| The one primary action    | (default)         | `primary`               |
| Secondary, still a button | `.ghost`          | `outline`               |
| Destructive, final step   | `.danger`         | `destructive`           |
| Destructive, first step   | `.danger-outline` | `destructive-outline`   |

A resting "Delete" must never be borderless text — that is how people click
destructive actions by accident (see `DeleteCycleButton` for the pattern).

### Theme derivation details

- Light ("Preprint"): paper canvas `#F7F6FC`, white surfaces, violet ink.
- Dark ("Deep Space Lab"): canvas `#0C0A1C`, surface `#151230`, and the
  brand accent is brightened automatically:
  `--accent: color-mix(in srgb, var(--brand-accent) 58%, #fff)` with dark
  ink `--accent-contrast: #191043` on accent fills. This keeps arbitrary
  institutional brand colours legible in both themes without a second
  palette per tenant.

### Adding a page

1. Reuse primitives first: `.box`, `table.list`, `.btn`, `.chip`, `.notice`,
   `.empty`, `.form-grid`. They carry the section hue and both themes for
   free.
2. Page-specific layout goes inline in the page or a small block in
   `globals.css` — not in the framework.
3. Every interactive element needs a visible rest state **and** hover state;
   `:focus-visible` is already global.
4. Check contrast when introducing a new colour pair: AA for text, 3:1 for
   borders that carry meaning (WCAG 1.4.11).
