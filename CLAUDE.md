
## Skeleton loading screens (rule added 2026-11-01)

Every screen ships with a skeleton loading state. Pattern: pulse animation on
the bones only (never on card/hero surfaces), the app's own design tokens,
logical properties only (RTL-safe), sr-only `role="status"` loading text in
the app's language(s), `prefers-reduced-motion` disables the pulse.
**When adding or redesigning a screen, add/update its matching skeleton in
the same change** — a new screen without one is incomplete.
Skeleton code lives in: `index.html` boot skeleton (keep in sync with the topbar), `src/components/Skeleton.tsx`, `.skel-bone` in `src/theme.css`.
