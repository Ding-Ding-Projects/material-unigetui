#!/usr/bin/env node
/**
 * Execute the shipped main/preload bundles with Electron boundaries replaced,
 * real host filesystem I/O and synthetic public fixtures. This is a wiring
 * check, NOT a native picker, renderer interaction, capture or Windows proof.
 * Run npm run build first; never substitute compiled unit-test modules here.
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'app')
const require = createRequire(import.meta.url)
const temporary = await fs.mkdtemp(join(tmpdir(), 'unigetui-built-converter-'))
const input = join(temporary, 'public-sample.json')
const output = join(temporary, 'public-result.csv')
const handles = new Map()
const windows = []
let pickedInput = input
let pickedOutput = output
let openCalls = 0
let saveCalls = 0
let bridge
let event
const app = Object.assign(new EventEmitter(), {
  requestSingleInstanceLock: () => true,
  whenReady: async () => undefined,
  getPath: () => temporary,
  quit: () => undefined,
})
class BrowserWindow extends EventEmitter {
  static getAllWindows() { return windows }
  static fromWebContents(sender) { return windows.find(window => window.webContents === sender) ?? null }
  constructor(options) {
    super()
    assert.equal(options.webPreferences.contextIsolation, true)
    assert.equal(options.webPreferences.nodeIntegration, false)
    this.webContents = Object.assign(new EventEmitter(), {
      id: 17,
      mainFrame: { url: '' },
      setWindowOpenHandler() {},
      send() {},
    })
    windows.push(this)
  }
  async loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href }
}
const electron = {
  app, BrowserWindow,
  ipcMain: { handle: (channel, handler) => handles.set(channel, handler), on() {} },
  dialog: {
    showOpenDialog: async (window, options) => {
      assert.equal(window, windows[0]); openCalls++
      assert.deepEqual(Array.from(options.properties), ['openFile'])
      assert.equal(options.filters[0].extensions[0], 'json')
      return { canceled: !pickedInput, filePaths: pickedInput ? [pickedInput] : [] }
    },
    showSaveDialog: async (window, options) => {
      assert.equal(window, windows[0]); saveCalls++
      assert.equal(options.defaultPath, 'public-sample.csv')
      assert.equal(options.filters[0].extensions[0], 'csv')
      return { canceled: !pickedOutput, filePath: pickedOutput }
    },
  },
  contextBridge: { exposeInMainWorld: (name, value) => { assert.equal(name, 'materialUniGetUi'); bridge = value } },
  ipcRenderer: { invoke: (channel, ...args) => Promise.resolve(handles.get(channel)(event, ...args)), on() {}, send() {} },
  shell: {}, safeStorage: {},
}
const files = ['main.js', 'preload.js', 'renderer.js']
const contents = await Promise.all(files.map(file => fs.readFile(join(appDir, file), 'utf8')))
const context = () => ({
  require: name => name === 'electron' ? electron : require(name),
  __dirname: appDir, process, console, Buffer, TextDecoder, URL,
  setTimeout, clearTimeout, setInterval, clearInterval,
  module: { exports: {} }, exports: {},
})
try {
  await fs.writeFile(input, '[{"name":"sample","count":12}]')
  runInNewContext(contents[0], context(), { filename: 'app/main.js' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(windows.length, 1)
  event = { sender: windows[0].webContents, senderFrame: windows[0].webContents.mainFrame }
  runInNewContext(contents[1], context(), { filename: 'app/preload.js' })
  assert.deepEqual(Object.keys(bridge.converter).sort(), ['cancel', 'prepareJsonCsv', 'saveJsonCsv'])
  assert.equal(bridge.invoke, undefined)
  assert.ok(contents[2].includes('converterPreviewReady'), 'built renderer lost the actual conversion panel')
  assert.ok(contents[2].includes('json-csv-panel__table'), 'built renderer lost the preview CSS')

  const prepared = await bridge.converter.prepareJsonCsv()
  assert.equal(prepared.status, 'ready')
  assert.equal(prepared.preview.rows, 1)
  assert.ok(!JSON.stringify(prepared).includes(temporary), 'private absolute path crossed bridge')
  assert.equal(prepared.preview.csv, undefined)
  pickedOutput = undefined
  assert.equal((await bridge.converter.saveJsonCsv(prepared.preview.token)).status, 'cancelled')
  pickedOutput = output
  assert.equal((await bridge.converter.saveJsonCsv(prepared.preview.token)).status, 'saved')
  assert.equal(await fs.readFile(output, 'utf8'), '"name","count"\r\n"sample","12"\r\n')
  assert.equal((await bridge.converter.saveJsonCsv(prepared.preview.token)).code, 'expired')

  const next = await bridge.converter.prepareJsonCsv()
  assert.equal((await bridge.converter.saveJsonCsv(next.preview.token)).code, 'exists')
  await bridge.converter.cancel()
  assert.equal((await bridge.converter.saveJsonCsv(next.preview.token)).code, 'expired')
  await fs.writeFile(input, '[{"invalid":[1]}]')
  assert.equal((await bridge.converter.prepareJsonCsv()).code, 'shape')
  pickedInput = undefined
  assert.equal((await bridge.converter.prepareJsonCsv()).status, 'cancelled')

  const opens = openCalls
  assert.equal((await handles.get('converter:prepare-json-csv')(event, '/arbitrary/private.json')).code, 'unavailable')
  assert.equal((await handles.get('converter:prepare-json-csv')({ ...event, senderFrame: { url: event.senderFrame.url } })).code, 'unavailable')
  const trustedUrl = event.senderFrame.url
  event.senderFrame.url = 'https://example.invalid/'
  assert.equal((await bridge.converter.prepareJsonCsv()).code, 'unavailable')
  event.senderFrame.url = trustedUrl
  assert.equal(openCalls, opens)
  assert.equal((await fs.readdir(temporary)).filter(name => name.endsWith('.tmp')).length, 0)
  console.log(JSON.stringify({
    status: 'passed', scope: 'Built main/preload wiring with simulated Electron dialogs and real filesystem; no native rendering or capture.',
    checks: ['isolated named preload', 'registered trusted-frame handlers', 'input picker', 'bounded preview', 'save cancellation', 'atomic create-only CSV', 'token replay', 'existing-output protection', 'explicit cancel', 'invalid-shape rejection', 'input cancellation', 'argument and frame rejection', 'bundled renderer panel and CSS presence'],
    openCalls, saveCalls,
    artifacts: Object.fromEntries(files.map((file, i) => [file, { sha256: createHash('sha256').update(contents[i]).digest('hex'), bytes: Buffer.byteLength(contents[i]) }])),
  }, null, 2))
} finally {
  if (bridge?.converter) await bridge.converter.cancel()
  await fs.rm(temporary, { recursive: true, force: true })
}
