#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
function value(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const has = name => args.includes(name)
const tag = value('--tag', process.env.RELEASE_TAG || '')
const localInstaller = value('--installer', '')
const localChecksum = value('--checksum', '')
const checksumOnly = has('--checksum-only')
const token = process.env.GITHUB_TOKEN || ''
const repo = process.env.RELEASE_REPO || 'Chenxiaoliu77/dsh-xc-release'
const failures = []

function fail(message) {
  failures.push(message)
  console.error(`FAIL ${message}`)
}
function ok(message) {
  console.log(`PASS ${message}`)
}

function curlText(url) {
  const args = ['-sSL', '--fail', '--max-time', '60', '-w', '\n%{http_code}', url]
  if (token)
    args.splice(1, 0, '-H', `Authorization: token ${token}`)
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  const split = out.lastIndexOf('\n')
  const code = out.slice(split + 1).trim()
  if (code !== '200')
    throw new Error(`HTTP ${code} ${url}`)
  return out.slice(0, split)
}

function api(url) {
  return JSON.parse(curlText(url))
}

async function readText(urlOrPath) {
  if (urlOrPath.startsWith('http'))
    return curlText(urlOrPath)
  return readFile(urlOrPath, 'utf8')
}

async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file))
    hash.update(chunk)
  return hash.digest('hex')
}

function parseChecksum(text) {
  const trimmed = text.trim()
  const withName = trimmed.match(/^([0-9a-f]{64})[ \t]+\*?(\S+)$/i)
  if (withName)
    return { hash: withName[1].toLowerCase(), name: path.basename(withName[2].trim()) }
  const bare = trimmed.match(/^([0-9a-f]{64})$/i)
  if (bare)
    return { hash: bare[1].toLowerCase(), name: '' }
  return null
}

try {
  if (!tag && !localInstaller)
    fail('missing --tag or --installer')

  let installerName = path.basename(localInstaller)
  let installerSize = 0
  let installerUrl = ''
  let releaseBody = ''
  let checksumText = ''

  if (localInstaller && localChecksum) {
    installerName = path.basename(localInstaller)
    installerSize = (await stat(localInstaller)).size
    checksumText = await readText(localChecksum)
    ok(`local mode installer=${installerName} size=${installerSize}`)
  }
  else {
    if (!tag)
      throw new Error('missing --tag')
    const release = api(`https://api.github.com/repos/${repo}/releases/tags/${tag}`)
    releaseBody = release.body || ''
    const assets = release.assets || []
    const installer = assets.find(a => /setup\.exe$/i.test(a.name))
    if (!installer) {
      fail(`installer asset not found in release ${tag}`)
      throw new Error('assets missing')
    }
    const checksum = assets.find(a => a.name === `${installer.name}.sha256`)
    if (!checksum) {
      fail(`paired sha256 asset not found for ${installer.name} in release ${tag}`)
      throw new Error('assets missing')
    }
    installerName = installer.name
    installerSize = installer.size
    installerUrl = installer.browser_download_url
    checksumText = await readText(checksum.browser_download_url)
    ok(`release ${tag} assets found: installer=${installerSize}B checksum=${checksum.size}B`)
  }

  const parsed = parseChecksum(checksumText)
  if (!parsed) {
    fail(`sha256 asset malformed: expected "<64 hex> *<filename>": ${JSON.stringify(checksumText.slice(0, 120))}`)
  }
  else {
    ok(`sha256 asset format valid: ${parsed.name}`)
    if (parsed.name && parsed.name !== installerName)
      fail(`sha256 filename mismatch: ${parsed.name} vs ${installerName}`)
    if (releaseBody && !releaseBody.toLowerCase().includes(parsed.hash))
      fail('release body hash mismatch')
    if (!checksumOnly && localInstaller) {
      const actual = await hashFile(localInstaller)
      if (actual !== parsed.hash)
        fail(`sha256 mismatch: computed=${actual} expected=${parsed.hash}`)
      else
        ok(`sha256 verified: ${actual}`)
    }
  }

  if (!localInstaller && !checksumOnly && installerUrl) {
    const dir = await mkdtemp(path.join(tmpdir(), 'verify-release-'))
    try {
      const target = path.join(dir, installerName)
      execFileSync('curl', ['-sSL', '--fail', '--max-time', '900', '-o', target, installerUrl], { stdio: 'inherit' })
      const bytes = (await stat(target)).size
      if (bytes !== installerSize)
        fail(`size mismatch: downloaded=${bytes} api=${installerSize}`)
      const actual = await hashFile(target)
      if (parsed && actual !== parsed.hash)
        fail(`sha256 mismatch: computed=${actual} expected=${parsed.hash}`)
      else
        ok(`downloaded installer sha256 verified: ${actual} bytes=${bytes}`)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}
catch (error) {
  fail(String(error && error.message ? error.message : error))
}

if (failures.length) {
  console.error(`RESULT FAILED with ${failures.length} error(s)`)
  process.exit(1)
}
console.log('RESULT PASSED')
