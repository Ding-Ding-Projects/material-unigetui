/**
 * Resolves a module from the compiled test output.
 *
 * Paths are given relative to `app/src`, so a test names the source file it is
 * actually testing rather than a build path that moves whenever the compiler's
 * inferred root changes.
 *
 * Windows needs a file:// URL for a dynamic import of an absolute path; a bare
 * path fails with ERR_UNSUPPORTED_ESM_URL_SCHEME because the drive letter is
 * read as a protocol.
 */
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

export async function importCompiled(sourceRelativePath) {
  const compiled = join(
    repoRoot,
    'app',
    'build-test',
    sourceRelativePath.replace(/\.tsx?$/, '.js')
  )

  if (!existsSync(compiled)) {
    throw new Error(
      `compiled module missing: ${compiled}\n` +
        `Run \`npm test\` rather than node --test directly; the suite compiles first.`
    )
  }

  return import(pathToFileURL(compiled).href)
}
