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

## Product rules (Sophie, 2026-10-26)

- One state, one mark: a state shown in several places (locked, AI-made, 미분류, ...) uses the same icon and the same theme color in lists, search and detail.
- Every on-screen string also fits in English and Japanese on a ~360dp phone: check for one-line overflow and links cut off by an ellipsis.
- A count shown before an action ("메모 N개") is counted with the same filter the server uses for that action, so the number before matches the number after.
- A button that lets the AI overwrite what the person made or edited says first that the current content will be replaced, and offers undo afterwards.
- AI buttons (sort, search, 모아서 만들기, Pro prompts) shown to someone without AI consent read as "동의하면 할 수 있어요" and lead to the consent sheet.
- A request that can be retried (saves, uploads) carries a request id, so the server never stores the same thing twice.
- A request that spends an AI use waits as long as the server's AI work takes, and its result stays viewable after the screen is closed and reopened.
- Text next to an icon on one row wraps to the next line when long (flexShrink on the text, icon aligned to the first line).
- A screen opened by a share from another app is checked for a second share arriving while it's already open: the new content must show.
- An AI request that times out says "잠시 뒤 확인해 주세요" (never "다시 시도"), whether its screen is open or closed, and its button can't be pressed again.
- A save path with no screen (like receiving from Mehh) tells the person once, the next time the app opens, what the save screen would have said (how many went to 미분류함, uses spent).
