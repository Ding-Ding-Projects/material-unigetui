import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { ManagerId } from '../models/manager'
import { InstallOptions, PackageRef } from '../models/package'
import { Operation, OperationAction } from '../models/operation'
import { ManagerDriver, OperationHandle } from './manager-drivers/manager-driver'

export interface OperationsQueueEvents {
  changed: (operations: readonly Operation[]) => void
  output: (operationId: string, line: string) => void
}

/**
 * The real operations queue.
 *
 * This replaces the design's `enqueue` / `_complete` pair, where `_complete`
 * was a 900ms timer that mutated the package lists and declared success. Here
 * a package list only changes because a manager process actually exited zero.
 */
export class OperationsQueue extends EventEmitter {
  private readonly operations = new Map<string, Operation>()
  private readonly handles = new Map<string, OperationHandle>()
  private readonly outputs = new Map<string, string[]>()
  private readonly pending: string[] = []
  private running = 0

  /**
   * One at a time by default. Package managers take machine-wide locks and
   * two concurrent installs routinely fail in ways that look like corruption.
   */
  public constructor(
    private readonly drivers: ReadonlyMap<ManagerId, ManagerDriver>,
    private readonly maxConcurrent: number = 1
  ) {
    super()
  }

  public list(): readonly Operation[] {
    return [...this.operations.values()]
  }

  public get(id: string): Operation | undefined {
    return this.operations.get(id)
  }

  public output(id: string): readonly string[] {
    return this.outputs.get(id) ?? []
  }

  public enqueue(
    action: OperationAction,
    pkg: PackageRef,
    options: InstallOptions
  ): Operation {
    const id = randomUUID()
    const operation: Operation = {
      id,
      action,
      package: pkg,
      options,
      status: 'queued',
    }
    this.operations.set(id, operation)
    this.outputs.set(id, [])
    this.pending.push(id)
    this.emitChanged()
    this.pump()
    return operation
  }

  public cancel(id: string): void {
    const operation = this.operations.get(id)
    if (operation === undefined) {
      return
    }

    const handle = this.handles.get(id)
    if (handle !== undefined) {
      handle.cancel()
      return
    }

    // Not started yet: drop it from the queue rather than leaving a phantom.
    const index = this.pending.indexOf(id)
    if (index !== -1) {
      this.pending.splice(index, 1)
    }
    this.update(id, { status: 'cancelled', finishedAt: new Date().toISOString() })
  }

  /** Removes a finished operation from the list. Never cancels a live one. */
  public forget(id: string): boolean {
    const operation = this.operations.get(id)
    if (operation === undefined) {
      return false
    }
    if (operation.status === 'queued' || operation.status === 'running') {
      return false
    }
    this.operations.delete(id)
    this.outputs.delete(id)
    this.emitChanged()
    return true
  }

  private update(id: string, patch: Partial<Operation>): void {
    const current = this.operations.get(id)
    if (current === undefined) {
      return
    }
    this.operations.set(id, { ...current, ...patch })
    this.emitChanged()
  }

  private emitChanged(): void {
    this.emit('changed', this.list())
  }

  private pump(): void {
    while (this.running < this.maxConcurrent && this.pending.length > 0) {
      const id = this.pending.shift()
      if (id === undefined) {
        return
      }
      void this.start(id)
    }
  }

  private async start(id: string): Promise<void> {
    const operation = this.operations.get(id)
    if (operation === undefined) {
      return
    }

    const driver = this.drivers.get(operation.package.manager)
    if (driver === undefined) {
      this.update(id, {
        status: 'failed',
        failureReason: `No driver for manager '${operation.package.manager}'`,
        finishedAt: new Date().toISOString(),
      })
      return
    }

    this.running += 1
    this.update(id, {
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString(),
    })

    const callbacks = {
      onProgress: (parsed: { progress?: number; line: string }) => {
        this.outputs.get(id)?.push(parsed.line)
        this.emit('output', id, parsed.line)
        if (parsed.progress !== undefined) {
          this.update(id, { progress: parsed.progress })
        }
      },
    }

    const handle =
      operation.action === 'install'
        ? driver.install(operation.package, operation.options, callbacks)
        : operation.action === 'update'
          ? driver.update(operation.package, operation.options, callbacks)
          : driver.uninstall(operation.package, operation.options, callbacks)

    this.handles.set(id, handle)

    try {
      const code = await handle.completed
      this.update(id, {
        status: code === 0 ? 'succeeded' : 'failed',
        progress: code === 0 ? 100 : undefined,
        failureReason:
          code === 0 ? undefined : `${operation.package.manager} exited ${code}`,
        finishedAt: new Date().toISOString(),
      })
    } catch (error) {
      // An aborted process rejects; that is a cancellation, not a failure, and
      // saying otherwise puts a red error in front of a user who asked to stop.
      const aborted =
        error instanceof Error &&
        (error.name === 'AbortError' || /abort/i.test(error.message))
      this.update(id, {
        status: aborted ? 'cancelled' : 'failed',
        failureReason: aborted
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
        finishedAt: new Date().toISOString(),
      })
    } finally {
      this.handles.delete(id)
      this.running -= 1
      this.pump()
    }
  }
}
