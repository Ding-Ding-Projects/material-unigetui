import { constants, promises as fs } from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { ConversionError, ConvertedCsv, convertJsonToCsv } from './json-csv'
import {
  ConverterPreparedResult, ConverterSavedResult, JSON_CSV_LIMITS as LIMITS,
} from '../../shared/converter-contract'

export interface ConverterDialogs {
  pickInput(): Promise<string | undefined>
  pickOutput(defaultName: string): Promise<string | undefined>
}

interface Session {
  generation: number
  busy: boolean
  committing: boolean
  prepared?: { token: string; inputName: string; converted: ConvertedCsv; expires: number; timer: ReturnType<typeof setTimeout> }
}

/** Cap reads on the open handle, including files that grow after stat. */
export async function readBoundedJson(file: string): Promise<Uint8Array> {
  if (path.extname(file).toLowerCase() !== '.json') throw new ConversionError('file-type')
  const before = await fs.lstat(file)
  if (!before.isFile() || before.isSymbolicLink()) throw new ConversionError('file-type')
  if (before.size > LIMITS.inputBytes) throw new ConversionError('limit')
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino) throw new ConversionError('file-type')
    if (stat.size > LIMITS.inputBytes) throw new ConversionError('limit')
    const bytes = Buffer.alloc(LIMITS.inputBytes + 1)
    let length = 0
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null)
      if (result.bytesRead === 0) break
      length += result.bytesRead
    }
    if (length > LIMITS.inputBytes) throw new ConversionError('limit')
    return bytes.subarray(0, length)
  } finally { await handle.close() }
}

/** In-memory only. No source, path, preview or payload enters app logs/settings. */
export class ConverterService {
  private readonly sessions = new Map<number, Session>()

  private session(owner: number): Session {
    let session = this.sessions.get(owner)
    if (!session) {
      session = { generation: 0, busy: false, committing: false }
      this.sessions.set(owner, session)
    }
    return session
  }

  private clear(session: Session): void {
    if (session.prepared) clearTimeout(session.prepared.timer)
    session.prepared = undefined
  }

  public cancel(owner: number): boolean {
    const session = this.sessions.get(owner)
    // Once publication starts, report the actual saved outcome, not a false cancel.
    if (!session || session.committing) return false
    session.generation++
    this.clear(session)
    if (!session.busy) this.sessions.delete(owner)
    return true
  }

  public async prepare(owner: number, dialogs: ConverterDialogs): Promise<ConverterPreparedResult> {
    const session = this.session(owner)
    if (session.busy) return { status: 'error', code: 'busy' }
    session.busy = true
    this.clear(session)
    const generation = ++session.generation
    try {
      const file = await dialogs.pickInput()
      if (generation !== session.generation || !file) return { status: 'cancelled' }
      const bytes = await readBoundedJson(file)
      if (generation !== session.generation) return { status: 'cancelled' }
      const converted = convertJsonToCsv(bytes)
      const token = randomUUID()
      const inputName = path.basename(file)
      const timer = setTimeout(() => {
        if (session.prepared?.token === token) this.clear(session)
        if (!session.busy) this.sessions.delete(owner)
      }, LIMITS.lifetimeMs)
      timer.unref()
      session.prepared = { token, inputName, converted, expires: Date.now() + LIMITS.lifetimeMs, timer }
      const { csv: _csv, ...preview } = converted
      return { status: 'ready', preview: { token, inputName, ...preview } }
    } catch (error) {
      if (generation !== session.generation) return { status: 'cancelled' }
      return { status: 'error', code: error instanceof ConversionError ? error.code : 'read' }
    } finally {
      session.busy = false
      if (!session.prepared) this.sessions.delete(owner)
    }
  }

  public async save(owner: number, token: unknown, dialogs: ConverterDialogs): Promise<ConverterSavedResult> {
    const session = this.sessions.get(owner)
    if (session?.busy) return { status: 'error', code: 'busy' }
    const prepared = session?.prepared
    if (!session || !prepared || typeof token !== 'string' || prepared.token !== token || Date.now() >= prepared.expires) {
      if (session && prepared && Date.now() >= prepared.expires) this.clear(session)
      return { status: 'error', code: 'expired' }
    }
    session.busy = true
    const generation = session.generation
    let temporary: string | undefined
    let published = false
    let outputName = ''
    try {
      const target = await dialogs.pickOutput(`${path.basename(prepared.inputName, path.extname(prepared.inputName))}.csv`)
      if (generation !== session.generation || !target) return { status: 'cancelled' }
      if (Date.now() >= prepared.expires) { this.clear(session); return { status: 'error', code: 'expired' } }
      if (path.extname(target).toLowerCase() !== '.csv') throw new ConversionError('file-type')
      outputName = path.basename(target)
      // Same-directory, exclusive private temp file. Never truncate the destination.
      temporary = path.join(path.dirname(target), `.material-unigetui-${randomUUID()}.tmp`)
      const handle = await fs.open(temporary, 'wx', 0o600)
      try {
        await handle.writeFile(prepared.converted.csv, 'utf8')
        await handle.sync()
      } finally { await handle.close() }
      // Validate the completed bytes before the only publication operation.
      const written = await fs.readFile(temporary)
      if (written.length !== prepared.converted.bytes || !written.equals(Buffer.from(prepared.converted.csv, 'utf8'))) {
        throw new ConversionError('write')
      }
      if (generation !== session.generation) return { status: 'cancelled' }
      if (Date.now() >= prepared.expires) { this.clear(session); return { status: 'error', code: 'expired' } }
      session.committing = true
      // Atomic create-only publication; link refuses existing files/symlinks, even
      // if another process creates them while the native Save dialog is open.
      // Filesystems without hard links fail closed; there is no unsafe fallback.
      await fs.link(temporary, target)
      published = true
      this.clear(session)
      return { status: 'saved', outputName: path.basename(target), rows: prepared.converted.rows, bytes: prepared.converted.bytes }
    } catch (error) {
      if (!session.committing && generation !== session.generation) return { status: 'cancelled' }
      const code = error instanceof ConversionError ? error.code
        : (error as NodeJS.ErrnoException).code === 'EEXIST' ? 'exists' : 'write'
      return { status: 'error', code }
    } finally {
      let cleanupFailed = false
      if (temporary) {
        // Cleanup cannot turn a successfully published, complete file into a
        // reported conversion failure. Best effort on locked/removed temp files.
        await fs.unlink(temporary).catch(error => { cleanupFailed = (error as NodeJS.ErrnoException).code !== 'ENOENT' })
      }
      session.committing = false
      session.busy = false
      if (published || !session.prepared) this.sessions.delete(owner)
      if (cleanupFailed) return published
        ? { status: 'saved', outputName, rows: prepared.converted.rows, bytes: prepared.converted.bytes, cleanupWarning: true }
        : { status: 'error', code: 'cleanup' }
    }
  }
}
