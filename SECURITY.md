# Security

## Reporting

Open a private security advisory on this repository, or a normal issue if the
matter is not sensitive. There is no release yet, so there is no supported
version table to publish.

## Things worth knowing before you look

**Artifacts are unsigned, permanently.** Code signing is prohibited for this
project. When an installer ships it will trigger an unknown-publisher warning.
That is expected and stated up front; it is not evidence of tampering, and it is
also not a substitute for verifying what you downloaded.

**The renderer is isolated.** `contextIsolation: true`, node integration off, and
a preload bridge that exposes a fixed set of named calls. It deliberately does
not expose a generic channel forwarder — that would hand the renderer the entire
main process. A guard test asserts both properties.

**Package-manager commands are spawned as argv arrays**, never through a shell,
so a package name cannot become a command.

**Elevation is explicit.** It is requested, never inferred, and pipes are
redirected rather than inherited.

**No network requests are made by the interface.** `app/index.html` sets a
Content-Security-Policy of `default-src 'none'` with no remote origin permitted;
the application works with the network unplugged. The package managers it drives
obviously make their own network requests.

**The reference submodule is never executed.** `vendor/unigetui-reference` is
pinned shallow at `v2026.2.7` and is read only for command lines and parsing
rules.

## What this project will not do

It will not add a signing step, ship credential-harvesting behaviour, or read
data belonging to anyone other than the person running it. The Installed and
Software updates screens display a machine's software inventory locally; that
data is never transmitted, and it is never committed as a screenshot.
