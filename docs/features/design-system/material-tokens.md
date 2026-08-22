# The Material Design 3 token contract

## Behaviour

`app/src/ui/md3/md3-style-contract.ts` declares two palettes — light and dark —
as the single source of truth for colour. `AppThemeProvider` publishes the
active palette onto the document root as CSS custom properties (`--p`, `--onp`,
`--sf`, `--on`, `--ol`, and the rest), once per theme change rather than once
per render.

Both palettes are lifted **verbatim** from the checked-in design reference at
`design/Material UniGetUI v2.dc.html`, which computed them inline on every
render. The design's short role names are kept deliberately: renaming them to
the long-form Material spellings would make every ported component stop matching
the file it is checked against, and that comparison is the thing that catches a
bad port.

Colour is not the whole contract. The same file also declares
theme-independent tokens the design's canvas runtime used identically in both
themes: a typography scale (`md3Typography`), a shape scale (`md3Shape`), five
elevation levels as real `box-shadow` values (`md3Elevation`), state-layer
opacities for hover/focus/pressed/dragged (`md3StateLayerOpacity`), and motion
durations/easings (`md3Motion`, including the design's own `pop` popover
easing). `md3StaticTokensToCssText()` renders all of them as `--md-*` custom
properties (`--md-headline-size`, `--md-shape-medium`, `--md-level1`,
`--md-duration-short`, `--md-state-hover`, …), published on the document root
alongside the palette by the same `AppThemeProvider` effect that used to set
colour alone. The shape group alone gets a `shape-` prefix — `medium`,
`large`, and `full` are generic enough names to collide with a future token
of the same name; every other group's keys are already self-describing
(`headlineSize`, `level1`, `durationShort`).

## Configuration

The theme toggles from the top app bar (`TopAppBar` in `app/src/ui/app.tsx`,
ported from the design's `<header>`). It is not persisted yet — that is the
`appearance-controls` row in the inventory, and it is `pending`.

## Failure modes

| Situation | Behaviour |
| --- | --- |
| `useTheme` called outside the provider | Throws immediately with a named error, rather than rendering unstyled |
| A stylesheet names a raw colour | The completeness guard fails the suite |

## Security considerations

None directly. Worth noting that the design referenced Google Fonts over the
network and this application does not: `app/index.html` sets a
Content-Security-Policy with `default-src 'none'` and no remote origin, so a
desktop application keeps working with the network unplugged.

## Verification

- `app/test/unit/feature-completeness-test.mjs` asserts both palettes are still
  declared, anchored to `^export const md3LightPalette` and
  `^export const md3DarkPalette` at line starts — never a bare substring, which
  a rename or a commented-out line would satisfy.
- The same suite asserts `app/src/ui/app.css` contains no raw hex colour.
- `docs/assets/screenshots/discover-dark.png` is the dark palette rendered by
  the real built application, not a mockup.
