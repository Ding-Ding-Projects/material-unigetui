/**
 * Loads a module from the compiled test output.
 *
 * Paths are given relative to `app/src`, so a test names the source file it is
 * actually testing rather than a build path.
 *
 * `createRequire` rather than `import()`: the output is CommonJS, and on
 * Windows a dynamic import of an absolute path also needs a file:// URL, which
 * is one more thing to get wrong for no benefit.
 */
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const require = createRequire(import.meta.url)

export function loadCompiled(sourceRelativePath) {
  const compiled = join(
    repoRoot,
    'app',
    'build-test',
    sourceRelativePath.replace(/\.tsx?$/, '.js')
  )

  if (!existsSync(compiled)) {
    throw new Error(
      `compiled module missing: ${compiled}\n` +
        'Run `npm test`; the suite compiles before it runs.'
    )
  }

  return require(compiled)
}
