/**
 * The package managers this application drives.
 *
 * Windows-only delivery scope. The upstream reference also ships Apt, Dnf,
 * Flatpak, Homebrew, Pacman and Snap drivers; those are deliberately out of
 * scope here and are not stubs waiting to be filled in.
 */
export const managerIds = [
  'winget',
  'scoop',
  'chocolatey',
  'pip',
  'npm',
  'cargo',
  'dotnet',
  'powershell',
  'powershell7',
  'vcpkg',
  'bun',
] as const

export type ManagerId = (typeof managerIds)[number]

export interface ManagerAvailability {
  readonly id: ManagerId
  readonly available: boolean
  /** Resolved absolute path, when the executable was found. */
  readonly executablePath?: string
  readonly version?: string
  /** Why it is unavailable, in words a user can act on. Never a bare boolean. */
  readonly unavailableReason?: string
}
