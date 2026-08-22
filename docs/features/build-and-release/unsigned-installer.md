# The unsigned Squirrel.Windows installer

## Behaviour

`script/package.mjs` runs electron-packager to produce the application
directory, then electron-winstaller to wrap it into `Setup.exe`, `RELEASES` and
a `.nupkg`.

## Configuration

None. The product name, version and description come from `app/package.json`.

## Failure modes

- **Missing build output.** Packaging refuses to start when `app/main.js` or
  `app/renderer.js` is absent, rather than shipping a package with no
  application inside it.
- **Stale output.** `out/` is cleared first, so a previous artifact can never be
  mistaken for a fresh one.
- **A silently empty package.** `Setup.exe` is checked against a plausible size
  floor. A package that is far too small to contain a runtime means the payload
  did not make it in, and that failure is otherwise invisible — the packaging
  step still reports success.
- **Missing artifacts.** Each of `Setup.exe`, `RELEASES` and the `.nupkg` is
  confirmed to exist after packaging.

## Security considerations

**Artifacts are unsigned, permanently.** Code signing is prohibited for this
project: no certificate is requested, discovered, stored or used, and
`createWindowsInstaller` is called with no `certificateFile`,
`certificatePassword` or `signWithParams`.

Their absence is the policy, so the build **verifies the result rather than
trusting the configuration**: `assertNotSigned` reads the PE optional header's
certificate data directory out of each produced executable and fails if it is
non-empty. A build that somehow acquired a signature is a policy breach, not a
bonus.

Windows will show an unknown-publisher warning when the installer runs. The
release notes say so plainly; it is expected, and it is not evidence of
tampering.

## Verification

`build-installer.bat /s` prints a table of every artifact with its size and
SHA-256, and reports the signature state of both the packaged executable and
`Setup.exe`. The release workflow runs the same script and then reads the
published release back to confirm the installer is genuinely attached and the
release is not a draft.
