#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const INSTALLER_RE = /\.(?:exe|msi|dmg|AppImage|deb)$/i

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory())
      await walk(full, out)
    else if (entry.isFile() && INSTALLER_RE.test(entry.name))
      out.push(full)
  }
  return out
}

async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex').toLowerCase()
}

function parseChecksum(text) {
  const trimmed = text.trim()
  const withName = trimmed.match(/^([0-9a-f]{64})[ \t]+\*?(\S+)$/i)
  if (withName)
    return withName[1].toLowerCase()
  const bare = trimmed.match(/^([0-9a-f]{64})$/i)
  return bare ? bare[1].toLowerCase() : null
}

async function verifyDir(dir) {
  const errors = []
  const verified = []
  let installers = []
  try {
    installers = await walk(dir)
  }
  catch (error) {
    errors.push(`cannot read directory ${dir}: ${error.message}`)
    return { ok: false, errors, verified }
  }
  if (installers.length === 0) {
    errors.push(`no installers found under ${dir}`)
    return { ok: false, errors, verified }
  }
  for (const installer of installers) {
    const checksum = `${installer}.sha256`
    let text
    try {
      text = await readFile(checksum, 'utf8')
    }
    catch {
      errors.push(`missing checksum for ${installer}`)
      continue
    }
    const expected = parseChecksum(text)
    if (!expected) {
      errors.push(`malformed checksum for ${installer}`)
      continue
    }
    const actual = await hashFile(installer)
    if (actual !== expected) {
      errors.push(`sha256 mismatch for ${installer}: computed=${actual} expected=${expected}`)
      continue
    }
    verified.push(installer)
  }
  return { ok: errors.length === 0, errors, verified }
}

async function selfTest() {
  const root = await mkdtemp(path.join(tmpdir(), 'verify-local-'))
  const failures = []
  try {
    const good = path.join(root, 'good')
    await mkdir(good, { recursive: true })
    const goodFile = path.join(good, 'app_x64-setup.exe')
    await writeFile(goodFile, Buffer.from('positive-fixture'))
    const goodHash = await hashFile(goodFile)
    await writeFile(`${goodFile}.sha256`, `${goodHash} *app_x64-setup.exe\n`)
    const pos = await verifyDir(good)
    if (!pos.ok)
      failures.push(`positive fixture failed: ${pos.errors.join('; ')}`)

    const bad = path.join(root, 'bad')
    await mkdir(bad, { recursive: true })
    const badFile = path.join(bad, 'app_x64-setup.exe')
    await writeFile(badFile, Buffer.from('negative-fixture'))
    await writeFile(`${badFile}.sha256`, `${'0'.repeat(64)} *app_x64-setup.exe\n`)
    const neg = await verifyDir(bad)
    if (neg.ok)
      failures.push('negative fixture (tampered hash) was not rejected')

    const missing = path.join(root, 'missing')
    await mkdir(missing, { recursive: true })
    await writeFile(path.join(missing, 'app.deb'), Buffer.from('no-checksum'))
    const miss = await verifyDir(missing)
    if (miss.ok)
      failures.push('negative fixture (missing checksum) was not rejected')

    const nested = path.join(root, 'nested', 'deep')
    await mkdir(nested, { recursive: true })
    const nestedFile = path.join(nested, 'app.AppImage')
    await writeFile(nestedFile, Buffer.from('nested-fixture'))
    const nestedHash = await hashFile(nestedFile)
    await writeFile(`${nestedFile}.sha256`, `${nestedHash}\n`)
    const nest = await verifyDir(path.join(root, 'nested'))
    if (!nest.ok)
      failures.push(`nested fixture failed: ${nest.errors.join('; ')}`)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
  if (failures.length) {
    for (const message of failures) console.error(`FAIL ${message}`)
    console.error(`SELF-TEST FAILED with ${failures.length} error(s)`)
    process.exitCode = 1
  }
  else {
    console.log('PASS self-test: positive / tampered / missing / nested all behaved as expected')
  }
}

const args = process.argv.slice(2)
const dirIndex = args.indexOf('--dir')
if (args.includes('--self-test')) {
  await selfTest()
}
else if (dirIndex >= 0 && args[dirIndex + 1]) {
  const dir = args[dirIndex + 1]
  const result = await verifyDir(dir)
  for (const message of result.errors) console.error(`FAIL ${message}`)
  for (const file of result.verified) console.log(`PASS verified ${file}`)
  if (!result.ok) {
    console.error(`RESULT FAILED with ${result.errors.length} error(s)`)
    process.exitCode = 1
  }
  else {
    console.log(`RESULT PASSED (${result.verified.length} installer(s))`)
  }
}
else {
  console.error('usage: verify-local-assets.mjs --dir <release-assets> | --self-test')
  process.exitCode = 1
}
