import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCompiled } from '../helpers/compiled.mjs'

const React = (await import('react')).default
const ReactDOMServer = (await import('react-dom/server')).default

const { Icon } = loadCompiled('ui/md3/icon.tsx')

/**
 * The Icon component addresses a Material Symbols glyph by writing its
 * ligature NAME as the element's text content. That text is real DOM text,
 * so it would glue onto an adjacent label if it were ever read aloud or
 * matched by textContent - which is exactly why the component must always be
 * aria-hidden, leaving the accessible name to whatever control contains it.
 */

test('Icon renders its ligature name as literal text content', () => {
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { name: 'settings' }))
  assert.match(html, />settings</, `expected the ligature name as text content, got: ${html}`)
})

test('Icon is always aria-hidden, regardless of which name is passed', () => {
  for (const name of ['menu', 'close', 'star', 'translate']) {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { name }))
    assert.match(html, /aria-hidden="true"/, `Icon("${name}") was not aria-hidden: ${html}`)
  }
})

test('Icon sets the Material Symbols Rounded font family', () => {
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { name: 'menu' }))
  assert.match(html, /font-family:&#x27;Material Symbols Rounded&#x27;/)
})

test('Icon defaults to 20px and honours an explicit size', () => {
  const defaultHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { name: 'menu' }))
  assert.match(defaultHtml, /font-size:20px/)

  const bigHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { name: 'menu', size: 32 }))
  assert.match(bigHtml, /font-size:32px/)
})

test('Icon applies the FILL variation only when filled is true', () => {
  const unfilled = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { name: 'star' }))
  assert.doesNotMatch(unfilled, /FILL/)

  const filled = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { name: 'star', filled: true }))
  // renderToStaticMarkup HTML-escapes the single quotes inside the inline
  // style attribute (&#x27;), so the literal source text 'FILL' never
  // appears verbatim in the markup — only its escaped form does.
  assert.match(filled, /&#x27;FILL&#x27; 1/)
})

test('an icon whose name is unknown to the font would render as that literal word (regression guard for the risk this component documents)', () => {
  // Icon itself has no knowledge of the font's ligature table - that check
  // lives in icon-ligature-usage-test.mjs. This test only proves the
  // documented failure mode is real: passing a bogus name renders that exact
  // word as visible text, with nothing marking it as wrong.
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Icon, { name: 'this_is_not_a_real_glyph_name' })
  )
  assert.match(html, />this_is_not_a_real_glyph_name</)
})
