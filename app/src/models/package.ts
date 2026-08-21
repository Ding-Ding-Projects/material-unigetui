import { ManagerId } from './manager'

export interface PackageRef {
  /** Stable identity: manager-scoped package id. */
  readonly key: string
  readonly id: string
  readonly name: string
  readonly manager: ManagerId
  readonly source?: string
}

export interface PackageVersionInfo {
  /** Installed version, when the package is installed. */
  readonly version?: string
  /** Available version, when an update exists. */
  readonly availableVersion?: string
}

export type DiscoveredPackage = PackageRef & PackageVersionInfo
export type InstalledPackage = PackageRef & { readonly version: string }
export type UpdateCandidate = PackageRef & {
  readonly version: string
  readonly availableVersion: string
}

/**
 * Install options. These mirror the design's install-options dialog exactly,
 * which in turn mirrors the flags the underlying managers actually accept.
 */
export interface InstallOptions {
  readonly version?: string
  readonly scope?: 'user' | 'machine'
  readonly architecture?: 'x64' | 'x86' | 'arm64'
  readonly location?: string
  readonly customArgs?: string
  readonly preRelease?: boolean
  readonly skipHashCheck?: boolean
  readonly interactive?: boolean
  readonly elevated?: boolean
  readonly uninstallPrevious?: boolean
}
