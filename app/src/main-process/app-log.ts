import { app } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

/**
 * The application log.
 *
 * A bounded in-memory ring plus an append-only file in the application-data
 * folder, so the Logs screen has something real to show and a crash leaves
 * something behind to read.
 *
 * Nothing sensitive is written here. Package names and manager output are
 * fine; the personal vocabulary, credentials and file paths a user chose are
 * not, and never reach this module.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  readonly at: string
  readonly level: LogLevel
  readonly scope: string
  readonly message: string
}

/** Bounded: a long-running session must not grow memory without limit. */
const MAX_ENTRIES = 2000

class AppLog {
  private readonly entries: LogEntry[] = []
  private writeChain: Promise<void> = Promise.resolve()

  public write(level: LogLevel, scope: string, message: string): LogEntry {
    const entry: LogEntry = {
      at: new Date().toISOString(),
      level,
      scope,
      message,
    }

    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES)
    }

    this.append(entry)
    return entry
  }

  public all(): readonly LogEntry[] {
    // Newest first: the reason somebody opened the log is almost always the
    // most recent thing that happened.
    return [...this.entries].reverse()
  }

  public clear(): void {
    this.entries.length = 0
  }

  public filePath(): string {
    return path.join(app.getPath('userData'), 'material-unigetui.log')
  }

  /** Serialized appends, so two writes cannot interleave mid-line. */
  private append(entry: LogEntry): void {
    this.writeChain = this.writeChain.then(async () => {
      try {
        const line = `${entry.at} [${entry.level}] ${entry.scope}: ${entry.message}\n`
        await fs.mkdir(path.dirname(this.filePath()), { recursive: true })
        await fs.appendFile(this.filePath(), line, 'utf8')
      } catch {
        // A log that cannot be written must never take down the operation it
        // was describing.
      }
    })
  }
}

export const appLog = new AppLog()
