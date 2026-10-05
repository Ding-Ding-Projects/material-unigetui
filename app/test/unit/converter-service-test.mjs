import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCompiled } from '../helpers/compiled.mjs'
const { ConverterService, readBoundedJson } = loadCompiled('main-process/converter/converter-service.ts')
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { resolve, promise } }
async function symlinkFixture(t, target, link) {
  try { await fs.symlink(target, link); return true }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Windows cannot create the symlink fixture without Developer Mode or the required privilege')
      return false
    }
    throw error
  }
}
async function fixture(t) {
  const dir = await fs.mkdtemp(join(tmpdir(), 'unigetui-converter-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const input = join(dir, 'fixture.json')
  const output = join(dir, 'fixture.csv')
  await fs.writeFile(input, '[{"item":"sample","amount":12}]')
  const service = new ConverterService()
  t.after(() => service.cancel(1))
  return { dir, input, output, service, dialogs: { pickInput: async () => input, pickOutput: async () => output } }
}

test('real filesystem prepares a bounded preview and atomically saves complete CSV once', async t => {
  const f = await fixture(t)
  const prepared = await f.service.prepare(1, f.dialogs)
  assert.equal(prepared.status, 'ready')
  assert.equal('csv' in prepared.preview, false)
  assert.equal(JSON.stringify(prepared).includes(f.dir), false)
  const saved = await f.service.save(1, prepared.preview.token, f.dialogs)
  assert.equal(saved.status, 'saved')
  assert.equal(await fs.readFile(f.output, 'utf8'), '"item","amount"\r\n"sample","12"\r\n')
  assert.deepEqual((await fs.readdir(f.dir)).sort(), ['fixture.csv', 'fixture.json'])
  assert.equal((await f.service.save(1, prepared.preview.token, f.dialogs)).code, 'expired')
})

test('tokens are owner-bound, unknown tokens cannot open Save dialog or write', async t => {
  const f = await fixture(t)
  const p = await f.service.prepare(1, f.dialogs)
  const denied = { ...f.dialogs, pickOutput: () => { assert.fail('must not open dialog') } }
  for (const token of ['wrong', null, {}, '../../somewhere']) assert.equal((await f.service.save(1, token, denied)).code, 'expired')
  assert.equal((await f.service.save(2, p.preview.token, denied)).code, 'expired')
})

test('existing destination is never overwritten; retry succeeds', async t => {
  const f = await fixture(t)
  await fs.writeFile(f.output, 'original')
  const p = await f.service.prepare(1, f.dialogs)
  assert.equal((await f.service.save(1, p.preview.token, f.dialogs)).code, 'exists')
  assert.equal(await fs.readFile(f.output, 'utf8'), 'original')
  const next = join(f.dir, 'next.csv')
  assert.equal((await f.service.save(1, p.preview.token, { ...f.dialogs, pickOutput: async () => next })).status, 'saved')
  assert.ok((await fs.readdir(f.dir)).every(name => !name.endsWith('.tmp')))
})

test('input/output dialog cancellation writes nothing and save cancellation can retry', async t => {
  const f = await fixture(t)
  assert.equal((await f.service.prepare(1, { ...f.dialogs, pickInput: async () => undefined })).status, 'cancelled')
  const p = await f.service.prepare(1, f.dialogs)
  assert.equal((await f.service.save(1, p.preview.token, { ...f.dialogs, pickOutput: async () => undefined })).status, 'cancelled')
  assert.deepEqual(await fs.readdir(f.dir), ['fixture.json'])
  assert.equal((await f.service.save(1, p.preview.token, f.dialogs)).status, 'saved')
})

test('cancel during input picker invalidates late selection and duplicate prepare is rejected', async t => {
  const f = await fixture(t)
  const picker = deferred()
  const pending = f.service.prepare(1, { ...f.dialogs, pickInput: () => picker.promise })
  assert.equal((await f.service.prepare(1, f.dialogs)).code, 'busy')
  assert.equal(f.service.cancel(1), true)
  picker.resolve(f.input)
  assert.equal((await pending).status, 'cancelled')
  assert.equal((await f.service.prepare(1, f.dialogs)).status, 'ready')
})

test('cancel during save picker prevents late destination write, stale token reuse and duplicate saves', async t => {
  const f = await fixture(t)
  const p = await f.service.prepare(1, f.dialogs)
  const picker = deferred()
  const pending = f.service.save(1, p.preview.token, { ...f.dialogs, pickOutput: () => picker.promise })
  assert.equal((await f.service.save(1, p.preview.token, f.dialogs)).code, 'busy')
  f.service.cancel(1)
  picker.resolve(f.output)
  assert.equal((await pending).status, 'cancelled')
  assert.equal((await f.service.save(1, p.preview.token, f.dialogs)).code, 'expired')
  assert.deepEqual(await fs.readdir(f.dir), ['fixture.json'])
})

test('unreadable/malformed/oversize/unsupported inputs leave no output or token', async t => {
  const f = await fixture(t)
  await fs.writeFile(f.input, '[{"a":{}}]')
  assert.equal((await f.service.prepare(1, f.dialogs)).code, 'shape')
  await fs.writeFile(f.input, ' '.repeat(2 * 1024 * 1024 + 1))
  assert.equal((await f.service.prepare(1, f.dialogs)).code, 'limit')
  assert.equal((await f.service.prepare(1, { ...f.dialogs, pickInput: async () => join(f.dir, 'absent.json') })).code, 'read')
  await assert.rejects(() => readBoundedJson(f.dir), error => error.code === 'file-type')
})

test('a symbolic-link input is rejected before reading it', async t => {
  const f = await fixture(t)
  const link = join(f.dir, 'link.json')
  if (!await symlinkFixture(t, f.input, link)) return
  await assert.rejects(() => readBoundedJson(link), error => error.code === 'file-type')
})

test('write failures and bad extensions keep input unchanged and clean temporary files', async t => {
  const f = await fixture(t)
  const original = await fs.readFile(f.input, 'utf8')
  const p = await f.service.prepare(1, f.dialogs)
  assert.equal((await f.service.save(1, p.preview.token, { ...f.dialogs, pickOutput: async () => f.input })).code, 'file-type')
  assert.equal((await f.service.save(1, p.preview.token, { ...f.dialogs, pickOutput: async () => join(f.dir, 'missing', 'out.csv') })).code, 'write')
  assert.equal(await fs.readFile(f.input, 'utf8'), original)
  assert.deepEqual(await fs.readdir(f.dir), ['fixture.json'])
})

test('expired snapshots cannot save or open a dialog', async t => {
  const f = await fixture(t)
  const p = await f.service.prepare(1, f.dialogs)
  const original = Date.now
  Date.now = () => original() + 600001
  try {
    const result = await f.service.save(1, p.preview.token, { ...f.dialogs, pickOutput: () => assert.fail('expired dialog') })
    assert.equal(result.code, 'expired')
  } finally { Date.now = original }
})

test('a destination symlink is refused without changing its target', async t => {
  const f = await fixture(t)
  const protectedFile = join(f.dir, 'protected.txt')
  await fs.writeFile(protectedFile, 'keep this')
  if (!await symlinkFixture(t, protectedFile, f.output)) return
  const p = await f.service.prepare(1, f.dialogs)
  assert.equal((await f.service.save(1, p.preview.token, f.dialogs)).code, 'exists')
  assert.equal(await fs.readFile(protectedFile, 'utf8'), 'keep this')
})

test('cancel after temp write but before publication removes temp and writes no destination', async t => {
  const f = await fixture(t)
  const p = await f.service.prepare(1, f.dialogs)
  const readFile = fs.readFile
  fs.readFile = async (...args) => {
    const bytes = await readFile(...args)
    if (String(args[0]).endsWith('.tmp')) f.service.cancel(1)
    return bytes
  }
  try { assert.equal((await f.service.save(1, p.preview.token, f.dialogs)).status, 'cancelled') }
  finally { fs.readFile = readFile }
  assert.deepEqual(await fs.readdir(f.dir), ['fixture.json'])
})

test('modified staged bytes fail validation and are never published', async t => {
  const f = await fixture(t)
  const p = await f.service.prepare(1, f.dialogs)
  const readFile = fs.readFile
  fs.readFile = async (...args) => String(args[0]).endsWith('.tmp') ? Buffer.from('corrupt') : readFile(...args)
  try { assert.equal((await f.service.save(1, p.preview.token, f.dialogs)).code, 'write') }
  finally { fs.readFile = readFile }
  assert.deepEqual(await fs.readdir(f.dir), ['fixture.json'])
})

test('cancellation after publication begins cannot report a false cancellation', async t => {
  const f = await fixture(t)
  const p = await f.service.prepare(1, f.dialogs)
  const link = fs.link
  fs.link = async (...args) => {
    assert.equal(f.service.cancel(1), false)
    return link(...args)
  }
  try { assert.equal((await f.service.save(1, p.preview.token, f.dialogs)).status, 'saved') }
  finally { fs.link = link }
  assert.ok((await fs.readFile(f.output, 'utf8')).includes('sample'))
})

test('cleanup errors after successful publication report the saved file plus explicit warning', async t => {
  const f = await fixture(t)
  const p = await f.service.prepare(1, f.dialogs)
  const unlink = fs.unlink
  fs.unlink = async () => { throw Object.assign(new Error('locked'), { code: 'EPERM' }) }
  let result
  try { result = await f.service.save(1, p.preview.token, f.dialogs) }
  finally { fs.unlink = unlink }
  assert.equal(result.status, 'saved')
  assert.equal(result.outputName, 'fixture.csv')
  assert.equal(result.cleanupWarning, true)
  assert.ok((await fs.readFile(f.output, 'utf8')).includes('sample'))
})
