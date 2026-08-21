import { InstallOptions, PackageRef } from './package'

export type OperationAction = 'install' | 'update' | 'uninstall'

export type OperationStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface Operation {
  readonly id: string
  readonly action: OperationAction
  readonly package: PackageRef
  readonly options: InstallOptions
  readonly status: OperationStatus
  /** 0-100 where the manager reports it; undefined where it genuinely cannot. */
  readonly progress?: number
  /** Present only on 'failed'. Names what actually went wrong. */
  readonly failureReason?: string
  readonly startedAt?: string
  readonly finishedAt?: string
}

/** Progress line emitted from a driver's output parser. */
export interface ParsedProgress {
  readonly progress?: number
  readonly line: string
}
