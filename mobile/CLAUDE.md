@AGENTS.md

## Design rules

The theme = a Layout (line / thinBorder / layered / layeredVintage) × a Palette, both in `src/theme/themes.ts`. That file is the only place theme values are defined; everything else reads them.

- Don't write color hex, corner radii or border widths as literal numbers in screens. Read the shared value instead, so changing it in one place changes it everywhere:
  - colors: `theme.*` (ink, sub, line, accent, danger, onAccent, cardBg, ...)
  - borders: `OUTLINE` with `allEdges` / `bottomEdge` (never the `borderWidth` + `borderColor` shorthand on a style that changes with the theme -- Android keeps stale side-specific values), `layerEdge` for layer's faint control edge
  - radii: `theme.cardRadius` (cards, sections), `theme.btnRadius` (buttons), `theme.pickRadius` (small pickers, icon buttons)
- Buttons come from `src/components/Buttons.tsx`: `SolidButton` (variant `primary` | `danger`), `GhostButton`, each `size` `md` | `sm`, plus `IconButton`. Need a new look? Add it there as a variant, not as a one-off Pressable in a screen.
- Cards and boxes: `<Card>` / `cardShellStyle` / `frameStyle` / `isBoxed` / `screenGutter` from `src/components/Card.tsx`; destructive confirms use `<ConfirmCard>`.
- Values that differ per theme are fields on Layout or Palette. A `conceptOf(theme)` branch in a component only picks which field to read; it doesn't invent new numbers. Never branch on a value no layout has.
- Color roles: ink = selected / primary, accent = meaning (AI, 미분류, recording), danger = errors and delete. No error text in accent; text on an accent fill uses `onAccent`.
- After a UI change, check all four layouts with their signature colors (line+Paper, thinBorder+Sage, layered+Blush, layeredVintage+Ink).
