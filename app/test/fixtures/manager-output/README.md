# Manager output fixtures

Golden fixtures captured from real package-manager CLIs, not hand-written.
A hand-written expectation only proves the parser matches the author's guess
about the format; these prove it matches what the tool actually emits.

Each file records the exact bytes, line endings included, from the command in
its header comment. Captured on Windows against the versions named below.

| File | Command | Manager version |
| --- | --- | --- |
| `winget-search-7zip.txt` | `winget search --query 7zip --disable-interactivity --accept-source-agreements` | winget v1.29.290 |

**These contain public catalog data only.** Never capture a fixture from
`winget list` or any other command that enumerates what the user has installed:
that is a personal software inventory and it does not belong in a public
repository.
