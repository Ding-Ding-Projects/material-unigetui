# The one-click build scripts

## Behaviour

Three wrappers at the repository root, all over one PowerShell script:

| Script | Mode | Does |
| --- | --- | --- |
| `download-dependencies.bat` | `Prepare` | Obtains everything needed to build, run and test |
| `build.bat` | `Build` | Prepares, then builds a runnable application |
| `build-installer.bat` | `Installer` | Prepares, builds, then produces the unsigned installer |

Each assumes a Windows machine with nothing installed and obtains what it needs
itself, into user-scoped locations, with no prompt. There is deliberately no
"install X and run this again" path: the only acceptable stopping point is a
dependency that genuinely cannot be obtained, reported with the exact routes
that were tried.

## Configuration

Silent mode is `/s`, `--silent`, or `SILENT=1` in the environment. A silent run
never prompts, never pauses, and exits non-zero on the first real failure so a
caller can branch on it. That is the mode CI and other agents use.

`build.bat` offers to launch the application when it finishes — last, so a
failed build never gets as far as offering to run nothing.

## Failure modes

Every failure names the dependency, the version constraint, the source that was
tried and the blocking error, rather than a bare "build failed".

| Trap | Handling |
| --- | --- |
| Administrator rights needed | Checked and acquired **first**, never halfway through — a build that dies on a permission at minute six has wasted the six minutes. Interactive runs only; blocking a silent run on a UAC prompt nobody can answer turns a build into a hang that looks like a crash. |
| `PATH` after an install | Refreshed in-process. A package manager writes `PATH` for *future* shells, so the next command in the same script still cannot find what was just installed — which reads as "the install failed" when it succeeded. |
| npm warnings on stderr | Native commands run through `Invoke-Native`, which drops `ErrorActionPreference` to `Continue` and judges success by the exit code. With `Stop` in force, npm's ordinary `allow-scripts` **warning** became a terminating `RemoteException` and killed the build. |
| electron installed with no binary | `script/ensure-electron-binary.mjs` repairs it, judged by the binary existing rather than by the installer's exit code. |
| `cmd` refusing the current directory | The wrappers invoke the PowerShell script by absolute path. With `NoDefaultCurrentDirectoryInExePath` set, `cmd /c build.bat` fails with "is not recognized" even though the file is plainly there. |
| A backslash eaten as an escape | The wrappers use a forward slash in the script path. `script\build-windows.ps1` written through a shell once reached disk as a **backspace byte**, producing `scriptuild-windows.ps1`. PowerShell accepts forward slashes, so the escape is not needed. |

## Security considerations

Nothing here requests, discovers or invokes a code signer; that is prohibited
for this project. Nothing installs a credential. The per-process
`-ExecutionPolicy Bypass` used to run this unsigned local script never changes
the machine's persistent policy.

## Verification

Run `build-installer.bat /s` from a clean checkout. It should reach a
`Setup.exe`, `RELEASES` and a `.nupkg`, print each artifact's size and SHA-256,
and report `NotSigned` for both the packaged executable and the installer.
