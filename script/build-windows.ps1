<#
.SYNOPSIS
  One script behind build.bat, build-installer.bat and download-dependencies.bat.

.DESCRIPTION
  Takes a Windows machine with nothing installed and gets it to a built,
  runnable application — and, in Installer mode, to an unsigned
  Squirrel.Windows installer.

  Everything it needs it obtains itself, into user-scoped locations, without a
  single prompt. There is no "install X and run this again": the only
  acceptable stopping point is a dependency that genuinely cannot be obtained,
  reported with the exact routes that were tried.

  Code signing is permanently prohibited here. Nothing in this script requests,
  discovers or invokes a signer.
#>

[CmdletBinding()]
param(
  [ValidateSet('Prepare', 'Build', 'Installer')]
  [string] $Mode = 'Build',

  [switch] $Silent
)

$ErrorActionPreference = 'Stop'
$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:StartedAt = Get-Date

# Silent mode is also settable by environment, so a caller that cannot pass a
# switch (a scheduled task, another agent) still gets a non-interactive run.
if ($env:SILENT -eq '1') { $Silent = $true }

function Write-Phase {
  param([string] $Message)
  $elapsed = [int]((Get-Date) - $script:StartedAt).TotalSeconds
  Write-Host ("[{0,4}s] {1}" -f $elapsed, $Message)
}

function Write-Failure {
  param(
    [string] $Dependency,
    [string] $Constraint,
    [string] $Source,
    [string] $Detail
  )
  Write-Host ''
  Write-Host "BUILD FAILED" -ForegroundColor Red
  Write-Host "  dependency : $Dependency"
  Write-Host "  required   : $Constraint"
  Write-Host "  tried      : $Source"
  Write-Host "  error      : $Detail"
  exit 1
}


<#
  Runs a native command without letting its stderr become a terminating error.

  With $ErrorActionPreference = 'Stop', ordinary progress and warning output on
  stderr is turned into a RemoteException and the build dies on a message that
  was never a failure - npm's "allow-scripts" warning killed this script once.
  The exit code is the only thing that decides success here.
#>
function Invoke-Native {
  param(
    [Parameter(Mandatory)] [string] $FilePath,
    [string[]] $Arguments = @(),
    [Parameter(Mandatory)] [string] $What
  )

  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $FilePath @Arguments 2>&1 | Out-Host
    $code = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previous
  }

  if ($code -ne 0) {
    Write-Failure -Dependency $What -Constraint 'exit 0' `
      -Source "$FilePath $($Arguments -join ' ')" -Detail "exited $code"
  }
}

<#
  Administrator rights are checked and acquired FIRST, never halfway through.
  A build that runs for six minutes and then dies on one permission has wasted
  the six minutes and left a half-installed tree behind.

  Interactive runs only. Blocking a silent run on a UAC prompt nobody can answer
  turns a build into a hang that looks exactly like a crash — and everything
  this script installs resolves to a user-scoped path anyway, so an unelevated
  silent run is expected to succeed.

  Deliberately no environment sentinel to guard the relaunch: a variable set
  before Start-Process -Verb RunAs is not reliably inherited by the elevated
  child, so the guard either does nothing or loops. The relaunched copy is
  genuinely elevated, so its own check passes and it falls straight through.
#>
function Confirm-Elevation {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

  if ($isAdmin) { return }

  if ($Silent) {
    Write-Phase 'not elevated; continuing (everything installs user-scoped)'
    return
  }

  Write-Phase 'requesting administrator rights before any work begins'
  $arguments = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', $PSCommandPath,
    '-Mode', $Mode
  )
  Start-Process -FilePath (Get-Process -Id $PID).Path -Verb RunAs -ArgumentList $arguments -Wait
  exit $LASTEXITCODE
}

<#
  A package manager writes PATH for FUTURE shells, so the very next command in
  this same process still cannot find what was just installed — a mistake that
  reads as "the install failed" when it in fact succeeded.
#>
function Update-ProcessPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  # Parenthesised deliberately: `@(a,b) -ne $null -join ';'` reads ambiguously
  # and is exactly the kind of line that silently produces the wrong PATH.
  $parts = @($machine, $user) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $env:Path = ($parts -join ';')
}

function Test-Command {
  param([string] $Name)
  $found = Get-Command $Name -ErrorAction SilentlyContinue
  return $null -ne $found
}

function Install-WithWinget {
  param([string] $Id, [string] $Friendly)

  if (-not (Test-Command 'winget')) {
    Write-Failure -Dependency $Friendly -Constraint 'any supported version' `
      -Source 'winget' -Detail 'winget is not available on this machine'
  }

  Write-Phase "installing $Friendly through winget"
  # Piped to Out-Host so the tool's own output stays in the log but never joins
  # this function's return value.
  Invoke-Native -FilePath 'winget' -What $Friendly -Arguments @(
    'install', '--id', $Id, '--exact', '--silent',
    '--accept-package-agreements', '--accept-source-agreements',
    '--disable-interactivity'
  )

  Update-ProcessPath
}

function Initialize-Node {
  if (Test-Command 'node') {
    $version = (& node --version) 2>&1 | Select-Object -First 1
    Write-Phase "node already present ($version)"
    return
  }
  Install-WithWinget -Id 'OpenJS.NodeJS.LTS' -Friendly 'Node.js LTS'

  if (-not (Test-Command 'node')) {
    Write-Failure -Dependency 'Node.js' -Constraint '>= 22' `
      -Source 'winget OpenJS.NodeJS.LTS' `
      -Detail 'node is still not on PATH after installation'
  }
}

function Initialize-ProjectDependencies {
  Push-Location $script:RepoRoot
  try {
    $marker = Join-Path $script:RepoRoot 'node_modules/.install-complete'
    $lock = Join-Path $script:RepoRoot 'package-lock.json'

    # Idempotent: a warm tree with an install newer than the lockfile is left
    # alone rather than reinstalled from scratch.
    if ((Test-Path $marker) -and (Test-Path $lock)) {
      $markerTime = (Get-Item $marker).LastWriteTimeUtc
      $lockTime = (Get-Item $lock).LastWriteTimeUtc
      if ($markerTime -ge $lockTime) {
        Write-Phase 'project dependencies already installed and current'
        return
      }
    }

    Write-Phase 'installing project dependencies'
    Invoke-Native -FilePath 'npm.cmd' -What 'npm packages' `
      -Arguments @('install', '--no-audit', '--no-fund')
    New-Item -ItemType File -Path $marker -Force | Out-Null
  }
  finally { Pop-Location }
}

<#
  npm's install-script gate can leave the electron package present with no
  binary underneath it, which reads as "electron is not installed" while the
  folder sits right there. Judged by the binary existing, never by the
  installer's exit code: it can report a cache hit, exit zero in a second, and
  extract nothing at all.
#>
function Initialize-ElectronBinary {
  Push-Location $script:RepoRoot
  try {
    Write-Phase 'checking the electron binary'
    Invoke-Native -FilePath 'node' -What 'electron binary' `
      -Arguments @('script/ensure-electron-binary.mjs')

    $binary = Join-Path $script:RepoRoot 'node_modules/electron/dist/electron.exe'
    if (-not (Test-Path $binary)) {
      Write-Failure -Dependency 'electron binary' -Constraint 'dist/electron.exe' `
        -Source 'node_modules/electron/install.js' `
        -Detail 'the installer finished but no binary appeared'
    }
  }
  finally { Pop-Location }
}

function Invoke-Build {
  Push-Location $script:RepoRoot
  try {
    Write-Phase 'building main, preload and renderer bundles'
    Invoke-Native -FilePath 'npm.cmd' -What 'webpack build' `
      -Arguments @('run', 'build')

    foreach ($artifact in @('app/main.js', 'app/preload.js', 'app/renderer.js')) {
      $path = Join-Path $script:RepoRoot $artifact
      if (-not (Test-Path $path)) {
        Write-Failure -Dependency $artifact -Constraint 'produced by the build' `
          -Source 'npm run build' -Detail 'the build reported success but the file is absent'
      }
      $size = (Get-Item $path).Length
      Write-Phase ("built {0} ({1:N0} bytes)" -f $artifact, $size)
    }
  }
  finally { Pop-Location }
}

function Invoke-Installer {
  Push-Location $script:RepoRoot
  try {
    Write-Phase 'packaging the unsigned Squirrel.Windows installer'
    Invoke-Native -FilePath 'node' -What 'installer' `
      -Arguments @('script/package.mjs')
  }
  finally { Pop-Location }
}

# ---------------------------------------------------------------- run it --

Confirm-Elevation
Update-ProcessPath

Write-Phase "mode: $Mode$(if ($Silent) { ' (silent)' })"

Initialize-Node
Initialize-ProjectDependencies
Initialize-ElectronBinary

if ($Mode -eq 'Prepare') {
  Write-Phase 'dependencies ready'
  exit 0
}

Invoke-Build

if ($Mode -eq 'Installer') {
  Invoke-Installer
}

Write-Phase 'done'

if ($Mode -eq 'Build' -and -not $Silent) {
  # The offer comes last, so a failed build never gets as far as offering to
  # launch nothing.
  Write-Host ''
  $answer = Read-Host 'Run the application now? [y/N]'
  if ($answer -match '^(y|yes)$') {
    Push-Location $script:RepoRoot
    try { & npm start }
    finally { Pop-Location }
  }
}

exit 0
