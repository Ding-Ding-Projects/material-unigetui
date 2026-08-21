import { app } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

/**
 * Durable settings, stored as one JSON document in the application-data folder.
 *
 * That folder is also the documented recovery path for the toy locks: deleting
 * it must clear every lock and every setting, so nothing here may live anywhere
 * else. Credentials never enter this file — they go to the OS credential vault.
 */

export interface SettingsSnapshot {
  readonly [key: string]: unknown
}

/** Written once, read everywhere, so no surface invents its own default. */
export const DEFAULT_SETTINGS: SettingsSnapshot = {
  languageMode: 'en',
  funnyLevelEnglish: 5,
  funnyLevelCantonese: 5,
  dialogEmoji: true,
  theme: 'light',
  density: 'comfortable',
  seedColor: '#0B57D0',
  fontFamily: '',
  fontScale: 1,
  narratorEnabled: false,
  narratorLanguage: 'en',
  narratorVoiceEnglish: '',
  narratorVoiceCantonese: '',
  narratorRate: 1,
  narratorPitch: 1,
  adhdFocus: false,
  adhdLowStimulation: false,
  adhdTimeAwareness: false,
  adhdOneThing: false,
  adhdMomentum: false,
  schoolMode: false,
  schoolModeName: 'School mode',
  displayName: '',
  logoPreset: 'default',
  logoCustomPath: '',
  notifyOnComplete: true,
  parallelOperations: 1,
  managersEnabled: {},
  managerExecutables: {},
  ignoredUpdates: [],
  tabs: null,
  appearanceOverrides: {},
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export class SettingsStore {
  private cache: Record<string, unknown> | null = null
  private writeChain: Promise<void> = Promise.resolve()

  public async all(): Promise<SettingsSnapshot> {
    if (this.cache !== null) {
      return this.cache
    }
    try {
      const raw = await fs.readFile(settingsPath(), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      // A corrupt file must not take the application down with it, and must not
      // silently become the new empty state either — defaults fill the gaps.
      this.cache =
        typeof parsed === 'object' && parsed !== null
          ? { ...DEFAULT_SETTINGS, ...(parsed as Record<string, unknown>) }
          : { ...DEFAULT_SETTINGS }
    } catch {
      this.cache = { ...DEFAULT_SETTINGS }
    }
    return this.cache
  }

  public async get(key: string): Promise<unknown> {
    const all = await this.all()
    return all[key]
  }

  public async set(key: string, value: unknown): Promise<SettingsSnapshot> {
    const all = { ...(await this.all()) }
    all[key] = value
    this.cache = all
    await this.persist(all)
    return all
  }

  public async setMany(patch: Record<string, unknown>): Promise<SettingsSnapshot> {
    const all = { ...(await this.all()), ...patch }
    this.cache = all
    await this.persist(all)
    return all
  }

  public async clear(key: string): Promise<SettingsSnapshot> {
    const all = { ...(await this.all()) }
    if (key in DEFAULT_SETTINGS) {
      all[key] = DEFAULT_SETTINGS[key]
    } else {
      delete all[key]
    }
    this.cache = all
    await this.persist(all)
    return all
  }

  public async reset(): Promise<SettingsSnapshot> {
    this.cache = { ...DEFAULT_SETTINGS }
    await this.persist(this.cache)
    return this.cache
  }

  /**
   * Writes are serialized and atomic.
   *
   * Temp-then-rename, retried: on Windows the rename fails with EPERM whenever
   * anything has the destination open for an instant — a virus scanner, the
   * search indexer, a sync client. Retrying briefly is the difference between
   * a saved setting and silent data loss on exactly the best-protected machines.
   */
  private persist(value: Record<string, unknown>): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      const target = settingsPath()
      await fs.mkdir(path.dirname(target), { recursive: true })

      // Unique temp name per write: a fixed one lets two concurrent writers
      // publish each other's half-written bytes.
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`
      await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8')

      let lastError: unknown = null
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          await fs.rename(temp, target)
          return
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          // Only the transient ones. ENOENT means the temp is gone, which is a
          // caller bug that retrying merely delays.
          if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') {
            throw error
          }
          lastError = error
          await new Promise(resolve => setTimeout(resolve, 40))
        }
      }
      await fs.rm(temp, { force: true })
      throw lastError
    })
    return this.writeChain
  }
}

export const settingsStore = new SettingsStore()
