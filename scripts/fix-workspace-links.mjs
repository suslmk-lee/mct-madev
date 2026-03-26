#!/usr/bin/env node
/**
 * fix-workspace-links.mjs
 *
 * On Windows, pnpm creates "junction" reparse points that some Windows
 * configurations reject with "untrusted mount point" errors.
 *
 * This script finds ALL junctions inside workspace per-package node_modules
 * and replaces them with real directory copies from their junction targets.
 *
 * Run after `pnpm install`:
 *   pnpm install; node scripts/fix-workspace-links.mjs
 */

import { existsSync, lstatSync, readdirSync, readlinkSync, cpSync } from 'fs'
import { execSync } from 'child_process'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(fileURLToPath(import.meta.url), '../..')

// ── 1. Collect per-package node_modules (NOT root, NOT .pnpm) ───────────────
// Root node_modules/.pnpm is the source we copy FROM — never touch it.
const perPkgNmDirs = []
for (const dir of ['packages', 'apps']) {
  const base = join(root, dir)
  if (!existsSync(base)) continue
  for (const entry of readdirSync(base)) {
    const nm = join(base, entry, 'node_modules')
    if (existsSync(nm)) perPkgNmDirs.push(nm)
  }
}

// ── 2. Find all junctions inside a node_modules directory (1-2 levels deep) ─
function findJunctions(nmDir) {
  const junctions = []
  let entries
  try { entries = readdirSync(nmDir) } catch { return junctions }

  for (const entry of entries) {
    if (entry === '.bin' || entry === '.cache') continue
    const fullPath = join(nmDir, entry)
    let stat
    try { stat = lstatSync(fullPath) } catch { continue }

    if (entry.startsWith('@')) {
      // Scoped package: descend one level
      let scopeEntries
      try { scopeEntries = readdirSync(fullPath) } catch { continue }
      for (const pkg of scopeEntries) {
        const pkgPath = join(fullPath, pkg)
        let pkgStat
        try { pkgStat = lstatSync(pkgPath) } catch { continue }
        if (pkgStat.isSymbolicLink()) junctions.push(pkgPath)
      }
    } else if (stat.isSymbolicLink()) {
      junctions.push(fullPath)
    }
  }
  return junctions
}

// ── 3. Replace each junction with a real copy from its target ────────────────
function removeJunction(junctionPath) {
  execSync(`cmd /c rmdir "${junctionPath}"`, { stdio: 'ignore' })
}

let fixed = 0
let failed = 0

for (const nmDir of perPkgNmDirs) {
  const junctions = findJunctions(nmDir)
  for (const junctionPath of junctions) {
    let target
    try {
      target = readlinkSync(junctionPath)
    } catch {
      // readlinkSync might fail; fall back to PowerShell
      try {
        target = execSync(
          `powershell -NoProfile -Command "(Get-Item '${junctionPath}').Target"`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim()
      } catch {
        console.error(`  FAILED to read target of ${junctionPath}`)
        failed++
        continue
      }
    }

    if (!target || !existsSync(target)) {
      console.error(`  SKIP (target not found): ${junctionPath} -> ${target}`)
      continue
    }

    const relPath = junctionPath.replace(root + '\\', '')
    process.stdout.write(`  fixing ${relPath} ... `)

    try {
      removeJunction(junctionPath)
    } catch {
      console.log('FAILED (remove)')
      failed++
      continue
    }

    try {
      // Copy the target's files; skip nested node_modules (deps resolved via tree)
      cpSync(target, junctionPath, {
        recursive: true,
        filter: (s) => !s.includes('node_modules'),
      })
      console.log('done')
      fixed++
    } catch (e) {
      console.log(`FAILED (copy): ${e.message}`)
      failed++
    }
  }
}

// ── 4. Also fix workspace package junctions in root node_modules ─────────────
const rootNm = join(root, 'node_modules')
if (existsSync(rootNm)) {
  for (const j of findJunctions(rootNm)) {
    let stat
    try { stat = lstatSync(j) } catch { continue }
    if (!stat.isSymbolicLink()) continue

    let target
    try { target = readlinkSync(j) } catch { continue }
    if (!target || !existsSync(target)) continue

    // Only fix junctions pointing OUTSIDE node_modules (workspace packages)
    if (target.includes('node_modules')) continue

    const relPath = j.replace(root + '\\', '')
    process.stdout.write(`  fixing ${relPath} ... `)
    try {
      removeJunction(j)
      cpSync(target, j, { recursive: true, filter: (s) => !s.includes('node_modules') })
      console.log('done')
      fixed++
    } catch (e) {
      console.log(`FAILED: ${e.message}`)
      failed++
    }
  }
}

console.log(`\nFixed: ${fixed}  Failed: ${failed}`)
