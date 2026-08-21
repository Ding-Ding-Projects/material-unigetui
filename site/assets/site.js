/*
 * Day Teet Hui behaviour.
 *
 * Everything here is per-visitor and local: state lives in localStorage, no
 * request leaves the page, and there is no analytics of any kind. The controls
 * are real — a tab that does not switch, or a builder whose pattern never
 * reaches the search, would be exactly the decorative UI the contracts forbid.
 */
;(function () {
  'use strict'

  var STORE = 'material-unigetui-site'

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || '{}')
    } catch (error) {
      // Corrupt storage must not take the page down with it.
      return {}
    }
  }

  function save(patch) {
    var next = Object.assign(load(), patch)
    try {
      localStorage.setItem(STORE, JSON.stringify(next))
    } catch (error) {
      /* Private browsing refuses writes; the page still works this session. */
    }
    return next
  }

  /* ---------------- language modes ---------------- */

  var STRINGS = {
    en: {
      tagline: 'The Material Design 3 interface for your package managers.',
      searchLabel: 'Search features',
      searchPlaceholder: 'Search features, contracts, IDs…',
      regexToggle: 'Regex builder',
      useRegex: 'Interpret as a regular expression',
      matches: 'showing %n of %t',
      invalid: 'not a valid expression yet',
    },
    yue: {
      tagline: '你部機啲套件管理器，終於有返個似樣嘅 Material Design 3 介面。',
      searchLabel: '搵功能',
      searchPlaceholder: '搵功能、合約、ID…',
      regexToggle: '正則表達式工具',
      useRegex: '當做正則表達式',
      matches: '顯示緊 %t 個之中嘅 %n 個',
      invalid: '呢個表達式仲未寫得啱',
    },
  }

  function stringsFor(mode) {
    if (mode === 'yue') {
      return STRINGS.yue
    }
    if (mode === 'bilingual') {
      var merged = {}
      Object.keys(STRINGS.en).forEach(function (key) {
        merged[key] =
          STRINGS.en[key] === STRINGS.yue[key]
            ? STRINGS.en[key]
            : STRINGS.en[key] + ' · ' + STRINGS.yue[key]
      })
      return merged
    }
    return STRINGS.en
  }

  function applyLanguage(mode) {
    var s = stringsFor(mode)
    document.querySelectorAll('[data-string]').forEach(function (node) {
      var key = node.getAttribute('data-string')
      if (s[key] !== undefined) {
        node.textContent = s[key]
      }
    })
    document.querySelectorAll('[data-string-placeholder]').forEach(function (node) {
      var key = node.getAttribute('data-string-placeholder')
      if (s[key] !== undefined) {
        node.setAttribute('placeholder', s[key])
      }
    })
    document.documentElement.setAttribute('lang', mode === 'yue' ? 'zh-HK' : 'en')
    window.__siteStrings = s
  }

  /* ---------------- theme ---------------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme)
    var button = document.getElementById('theme-toggle')
    if (button) {
      button.textContent = theme === 'dark' ? 'Light theme' : 'Dark theme'
    }
  }

  /* ---------------- tabs ---------------- */

  function initTabs(state) {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'))
    if (tabs.length === 0) {
      return
    }

    function select(id, focus) {
      tabs.forEach(function (tab) {
        var active = tab.getAttribute('data-tab') === id
        tab.setAttribute('aria-selected', active ? 'true' : 'false')
        tab.setAttribute('tabindex', active ? '0' : '-1')
        var panel = document.getElementById('panel-' + tab.getAttribute('data-tab'))
        if (panel) {
          panel.hidden = !active
        }
        if (active && focus) {
          tab.focus()
        }
      })
      save({ tab: id })
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        select(tab.getAttribute('data-tab'), false)
      })
      // Arrow-key traversal, which is what makes this a real tablist rather
      // than a row of buttons wearing tab roles.
      tab.addEventListener('keydown', function (event) {
        var delta =
          event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (delta === 0) {
          return
        }
        event.preventDefault()
        var next = tabs[(index + delta + tabs.length) % tabs.length]
        select(next.getAttribute('data-tab'), true)
      })
    })

    var initial =
      state.tab && document.getElementById('panel-' + state.tab)
        ? state.tab
        : tabs[0].getAttribute('data-tab')
    select(initial, false)
  }

  /* ---------------- search with its own anchored regex builder ---------------- */

  function initSearch(state) {
    var input = document.getElementById('feature-search')
    var status = document.getElementById('search-status')
    var toggle = document.getElementById('regex-toggle')
    var builder = document.getElementById('regex-builder')
    var useRegex = document.getElementById('use-regex')
    var rows = Array.prototype.slice.call(
      document.querySelectorAll('[data-feature-row]')
    )

    if (!input || rows.length === 0) {
      return
    }

    function matcher() {
      var query = input.value.trim()
      if (query === '') {
        return { test: function () { return true }, valid: true }
      }
      if (!useRegex.checked) {
        var needle = query.toLowerCase()
        return {
          valid: true,
          test: function (text) {
            return text.toLowerCase().indexOf(needle) !== -1
          },
        }
      }
      try {
        var re = new RegExp(query, 'i')
        return { valid: true, test: function (text) { return re.test(text) } }
      } catch (error) {
        // An unfinished expression is normal while typing; say so rather than
        // showing an empty page as though nothing matched.
        return { valid: false, test: function () { return true } }
      }
    }

    function apply() {
      var m = matcher()
      var shown = 0
      rows.forEach(function (row) {
        // While the expression is unfinished, keep every row visible. Hiding
        // them all turns a half-typed pattern into a blank page that reads as
        // "nothing matched" rather than "you are still typing".
        var hit = !m.valid || m.test(row.getAttribute('data-search-text') || '')
        row.hidden = !hit
        if (hit) {
          shown += 1
        }
      })
      var s = window.__siteStrings || STRINGS.en
      status.setAttribute('data-invalid', m.valid ? 'false' : 'true')
      status.textContent = m.valid
        ? s.matches.replace('%n', String(shown)).replace('%t', String(rows.length))
        : s.invalid
      save({ query: input.value, regex: useRegex.checked })
    }

    input.addEventListener('input', apply)
    useRegex.addEventListener('change', apply)

    toggle.addEventListener('click', function () {
      var open = builder.hidden
      builder.hidden = !open
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (open) {
        builder.querySelector('.chip').focus()
      }
    })

    builder.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        // Inserting a token turns regex mode on: a builder that writes a
        // pattern into a plain-text search does nothing and looks broken.
        useRegex.checked = true
        var start = input.selectionStart === null ? input.value.length : input.selectionStart
        var end = input.selectionEnd === null ? start : input.selectionEnd
        var token = chip.getAttribute('data-token')
        input.value = input.value.slice(0, start) + token + input.value.slice(end)
        var caret = start + token.length
        input.focus()
        input.setSelectionRange(caret, caret)
        apply()
      })
    })

    if (typeof state.query === 'string') {
      input.value = state.query
    }
    useRegex.checked = state.regex === true
    apply()
  }

  /* ---------------- boot ---------------- */

  document.addEventListener('DOMContentLoaded', function () {
    var state = load()

    applyTheme(state.theme === 'dark' ? 'dark' : 'light')
    applyLanguage(state.language || 'en')

    var themeButton = document.getElementById('theme-toggle')
    if (themeButton) {
      themeButton.addEventListener('click', function () {
        var next =
          document.documentElement.getAttribute('data-theme') === 'dark'
            ? 'light'
            : 'dark'
        applyTheme(next)
        save({ theme: next })
      })
    }

    var languageSelect = document.getElementById('language-mode')
    if (languageSelect) {
      languageSelect.value = state.language || 'en'
      languageSelect.addEventListener('change', function () {
        applyLanguage(languageSelect.value)
        save({ language: languageSelect.value })
        var input = document.getElementById('feature-search')
        if (input) {
          input.dispatchEvent(new Event('input'))
        }
      })
    }

    initTabs(state)
    initSearch(state)
  })
})()
