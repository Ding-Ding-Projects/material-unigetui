import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import Renderer from 'react-test-renderer'
import { loadCompiled } from '../helpers/compiled.mjs'
const { act } = Renderer
const appState = loadCompiled('ui/app-state.tsx')
const { translate, translateAccessible, defaultI18nOptions } = loadCompiled('lib/i18n.ts')
const { JsonCsvPanel } = loadCompiled('ui/tools/json-csv-panel.tsx')
const { ConverterRoute } = loadCompiled('ui/tools/converter-route.tsx')
const preview = { token: 'fixture-token', inputName: 'fixture.json', rows: 1, columns: 1, bytes: 14, escapedCells: 0, headers: ['item'], sample: [['sample']] }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { resolve, promise } }
async function fixture(t, converter, mode = 'en', Component = JsonCsvPanel) {
  const priorWindow = globalThis.window
  const priorHook = appState.useI18n
  const options = { ...defaultI18nOptions, mode }
  appState.useI18n = () => ({ t: (key, vars) => translate(key, options, vars), a: (key, vars) => translateAccessible(key, options, vars) })
  globalThis.window = { materialUniGetUi: { converter } }
  let rendered
  await act(async () => { rendered = Renderer.create(React.createElement(Component)) })
  t.after(async () => {
    await act(async () => { rendered.unmount() })
    globalThis.window = priorWindow
    appState.useI18n = priorHook
  })
  return rendered
}
const choose = r => r.root.findAllByType('button')[0]
const text = r => JSON.stringify(r.toJSON())

test('choose, preview and save reach named bridge calls; result and controls update', async t => {
  const calls = []
  const r = await fixture(t, {
    prepareJsonCsv: async () => { calls.push('prepare'); return { status: 'ready', preview } },
    saveJsonCsv: async token => { calls.push(token); return { status: 'saved', outputName: 'result.csv', rows: 1, bytes: 14 } },
    cancel: async () => true,
  })
  await act(async () => choose(r).props.onClick())
  assert.equal(r.root.findAllByType('table').length, 1)
  assert.equal(r.root.findAllByType('caption').length, 1)
  assert.equal(r.root.findAllByType('th')[0].props.scope, 'col')
  await act(async () => r.root.findAllByType('button')[1].props.onClick())
  assert.deepEqual(calls, ['prepare', 'fixture-token'])
  assert.ok(text(r).includes('result.csv'))
  assert.equal(r.root.findAllByType('table').length, 0)
  assert.equal(choose(r).props.disabled, false)
})

test('repeated click creates only one operation; cancel discards late completion', async t => {
  const operation = deferred()
  let prepares = 0
  const r = await fixture(t, {
    prepareJsonCsv: () => { prepares++; return operation.promise },
    cancel: async () => true,
  })
  await act(async () => { choose(r).props.onClick(); choose(r).props.onClick() })
  assert.equal(prepares, 1)
  assert.equal(choose(r).props.disabled, true)
  await act(async () => r.root.findAllByType('button')[1].props.onClick())
  await act(async () => operation.resolve({ status: 'ready', preview }))
  assert.equal(r.root.findAllByType('table').length, 0)
  assert.ok(text(r).includes('Cancelled'))
})

test('rejected bridge promises surface accessible retryable errors', async t => {
  const r = await fixture(t, { prepareJsonCsv: async () => { throw new Error('private path') }, cancel: async () => true })
  await act(async () => choose(r).props.onClick())
  assert.equal(r.root.findAllByProps({ role: 'alert' }).length, 1)
  assert.ok(text(r).includes('bridge is unavailable'))
  assert.ok(!text(r).includes('private path'))
  assert.equal(choose(r).props.disabled, false)
})

test('save picker cancellation retains preview for retry; expiry clears it', async t => {
  let saves = 0
  const r = await fixture(t, {
    prepareJsonCsv: async () => ({ status: 'ready', preview }),
    saveJsonCsv: async () => ++saves === 1 ? { status: 'cancelled' } : { status: 'error', code: 'expired' },
    cancel: async () => true,
  })
  await act(async () => choose(r).props.onClick())
  await act(async () => r.root.findAllByType('button')[1].props.onClick())
  assert.equal(r.root.findAllByType('table').length, 1)
  await act(async () => r.root.findAllByType('button')[1].props.onClick())
  assert.equal(r.root.findAllByType('table').length, 0)
  assert.ok(text(r).includes('no longer available'))
})

test('unmount cancels the host operation and ignores a late result', async t => {
  const operation = deferred()
  let cancellations = 0
  const r = await fixture(t, { prepareJsonCsv: () => operation.promise, cancel: async () => { cancellations++; return true } })
  await act(async () => choose(r).props.onClick())
  await act(async () => r.unmount())
  await act(async () => operation.resolve({ status: 'ready', preview }))
  assert.equal(cancellations, 1)
  assert.equal(r.toJSON(), null)
})

for (const mode of ['en', 'yue', 'bilingual']) test(`converter instructions and errors are localized in ${mode}`, async t => {
  const r = await fixture(t, { prepareJsonCsv: async () => ({ status: 'error', code: 'shape' }), cancel: async () => true }, mode)
  await act(async () => choose(r).props.onClick())
  const options = { ...defaultI18nOptions, mode }
  assert.ok(text(r).includes(translate('converterErrorShape', options)))
  assert.ok(text(r).includes(translate('converterLoss', options)))
})

test('expired idle preview can still be dismissed when host has already discarded it', async t => {
  const r = await fixture(t, { prepareJsonCsv: async () => ({ status: 'ready', preview }), cancel: async () => false })
  await act(async () => choose(r).props.onClick())
  await act(async () => r.root.findAllByType('button')[2].props.onClick())
  assert.equal(r.root.findAllByType('table').length, 0)
  assert.ok(text(r).includes('Cancelled'))
})

test('successful save with a cleanup warning reports both outcomes honestly', async t => {
  const r = await fixture(t, {
    prepareJsonCsv: async () => ({ status: 'ready', preview }),
    saveJsonCsv: async () => ({ status: 'saved', outputName: 'result.csv', rows: 1, bytes: 14, cleanupWarning: true }),
    cancel: async () => false,
  })
  await act(async () => choose(r).props.onClick())
  await act(async () => r.root.findAllByType('button')[1].props.onClick())
  assert.ok(text(r).includes('CSV saved.'))
  assert.ok(text(r).includes('temporary CSV copy could not be removed'))
  assert.equal(r.root.findAllByProps({ role: 'alert' }).length, 1)
})

test('category tabs use roving focus and Arrow/Home/End navigation; unavailable formats stay labeled', async t => {
  const previous = globalThis.document
  const focused = []
  globalThis.document = { getElementById: id => ({ focus: () => focused.push(id) }) }
  t.after(() => { globalThis.document = previous })
  const r = await fixture(t, { cancel: async () => true }, 'en', ConverterRoute)
  const tabs = () => r.root.findAllByProps({ role: 'tab' })
  assert.equal(tabs().filter(tab => tab.props.tabIndex === 0).length, 1)
  const key = async key => act(async () => tabs().find(tab => tab.props['aria-selected']).props.onKeyDown({ key, preventDefault() {} }))
  await key('ArrowRight')
  assert.equal(focused.at(-1), 'converter-tab-images')
  assert.equal(r.root.findByProps({ role: 'tabpanel' }).props.id, 'converter-panel-images')
  await key('End')
  assert.equal(focused.at(-1), 'converter-tab-binary')
  await key('ArrowRight')
  assert.equal(focused.at(-1), 'converter-tab-documents')
  await key('ArrowLeft')
  assert.equal(focused.at(-1), 'converter-tab-binary')
  await key('Home')
  assert.equal(focused.at(-1), 'converter-tab-documents')
  assert.ok(text(r).includes('No bundled adapter for this format yet'))
  assert.ok(!text(r).includes('nothing will actually convert'))
})
