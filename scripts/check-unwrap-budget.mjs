import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const ROOT = process.env.GITHUB_WORKSPACE || process.cwd()
const SRC = path.join(ROOT, 'apps/desktop/src-tauri/src')
const BUDGET = path.join(ROOT, 'scripts/unwrap-budget.json')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory())
      out.push(...walk(p))
    else if (name.endsWith('.rs') && !/_tests\.rs$/.test(name) && name !== 'tests.rs')
      out.push(p)
  }
  return out
}

function count() {
  const perFile = {}
  let total = 0
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8')
    const n = (text.match(/\.unwrap\(\)/g) || []).length + (text.match(/\.expect\(/g) || []).length
    if (n === 0)
      continue
    const rel = path.relative(ROOT, file).split(path.sep).join('/')
    perFile[rel] = n
    total += n
  }
  return { total, perFile }
}

function main() {
  const current = count()
  const mode = process.argv[2] || 'check'
  if (mode === 'baseline') {
    writeFileSync(BUDGET, `${JSON.stringify(current, null, 2)}\n`)
    console.log(`UNWRAP_BUDGET: baseline written total=${current.total}`)
    return
  }
  let budget
  try {
    budget = JSON.parse(readFileSync(BUDGET, 'utf8'))
  }
  catch (error) {
    throw new Error(`UNWRAP_BUDGET: cannot read baseline: ${error.message}`)
  }
  const regressions = []
  for (const [file, n] of Object.entries(current.perFile)) {
    const before = budget.perFile[file] || 0
    if (n > before)
      regressions.push(`${file}: ${before} -> ${n}`)
  }
  if (regressions.length)
    throw new Error(`UNWRAP_BUDGET: regression detected\n${regressions.join('\n')}`)
  console.log(`UNWRAP_BUDGET: total=${current.total} budget=${budget.total} improved=${budget.total - current.total}`)
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  try {
    main()
  }
  catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
