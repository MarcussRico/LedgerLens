# LedgerLens — evaluation deck

`LedgerLens_Deck.pptx` — 9 slides, 16:9, built for the PPT evaluation round.

| # | Slide |
|---|---|
| — | Cover |
| 01 | Problem statement |
| 02 | Proposed solution |
| 03 | Features |
| 04 | Idea and approach |
| 05 | System architecture and workflow |
| 06 | Innovation and existing solutions |
| 07 | Impact and future scope |
| — | Close |

## How it was made

- **Every diagram is native PowerPoint vector geometry** — rectangles, connectors
  with real DrawingML arrowheads, text frames. Nothing is a flattened picture, so
  it stays sharp at any projector resolution and you can edit any box live if a
  judge asks a question.
- **The three backgrounds are real GLSL shader output**, written as a WebGL2
  fragment shader and rendered at 2560×1440 through headless Chrome. Domain-warped
  fbm producing constant-width isolines (via screen-space derivatives), plus
  crisp ledger rules, one tight bloom, a vignette and film grain. Procedural and
  deterministic — no image model touched this deck.
- **Zero drop shadows** (verified: 0 `<a:effectLst>` elements). Depth comes from
  surface value and hairline borders only.
- **Palette** is the product's own: ink `#0A0B0D`, warm paper `#E9E5DC`,
  gold `#C9A227` for money, burnt red `#C4503A` for risk, green `#5B8F6E` for
  recovered, slate `#6B8394` for neutral. A colour never means two things.
  No purple, no neon, no gradients-as-decoration.
- **Fonts** are Georgia / Segoe UI / Consolas — all present on Windows and on
  macOS with Office, so the deck will not reflow on the evaluator's machine.

## Regenerating

```bash
python3 build_deck.py     # rewrites LedgerLens_Deck.pptx
python3 preview.py        # renders the saved .pptx back to preview.html
```

`preview.py` reads the **saved artifact** (not the build script) and renders it
in a browser, then flags any text box whose content exceeds its frame. Current
state: **0 overflowing boxes**. Open `preview.html` to review the deck without
PowerPoint.

`slides/` holds a PNG of every slide, for submission portals that want images.
