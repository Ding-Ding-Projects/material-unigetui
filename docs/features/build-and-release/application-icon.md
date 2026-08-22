# The application icon

## Behaviour

`script/make-app-icon.cjs` renders the application mark and assembles a
multi-resolution Windows icon:

| File | What it is |
| --- | --- |
| `build/icon-master.png` | The committed master source, 512×512 |
| `build/icon.ico` | 16, 24, 32, 48, 64, 128 and 256px, PNG-encoded entries |

The mark is drawn from the same Material Design 3 tokens as the application and
the site, so it cannot drift away from the product's actual look: a squircle in
the primary colour with three stacked bars reading as a package list, legible
down to 16px.

It is wired into the packaged executable (`--icon`), the installer
(`setupIcon`), and the Add/Remove Programs entry (`iconUrl`).

## Configuration

None. Re-run the script to regenerate both files after changing the mark.

## Failure modes

- Packaging **refuses to start** when `build/icon.ico` is missing, rather than
  silently shipping the framework's default icon.
- The generator fails if the captured mark is empty, or if any resized entry is
  implausibly small.

## Security considerations

None directly. Worth stating that the icon has nothing to do with signing: the
artifacts remain unsigned, permanently, and an icon does not change that.

## Verification

`app/test/unit/app-icon-test.mjs` reads the ICO **directory out of the bytes**,
never out of the build configuration:

- the file is not simply a PNG renamed to `.ico`, which is the failure the
  contract names explicitly;
- 16, 32, 48 and 256px entries are all present;
- every directory entry points at real PNG bytes inside the file, and none runs
  past the end;
- `package.mjs` actually wires `--icon`, `setupIcon` and `iconUrl`.

One detail worth knowing if this is ever hand-edited: **256 is stored as 0** in
the ICO directory's single-byte width and height fields. Reading those literally
makes the largest entry silently disappear, which is why the reader coerces
zero back to 256.
