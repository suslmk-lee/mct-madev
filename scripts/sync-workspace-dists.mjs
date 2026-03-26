#!/usr/bin/env node
/**
 * sync-workspace-dists.mjs
 *
 * After `fix-workspace-links.mjs` converts junctions to real directory copies,
 * those copies go stale whenever a workspace package is rebuilt.
 *
 * This script syncs the `dist/` of each workspace package into every
 * dependent package's node_modules copy.
 *
 * Run after `pnpm -r build`:
 *   node scripts/sync-workspace-dists.mjs
 */

import { existsSync, readdirSync, cpSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(fileURLToPath(import.meta.url), '../..')

// ── 1. Collect all workspace packages ────────────────────────────────────────
const workspacePkgs = []
for (const dir of ['packages', 'apps']) {
  const base = join(root, dir)
  if (!existsSync(base)) continue
  for (const entry of readdirSync(base)) {
    const pkgJson = join(base, entry, 'package.json')
    if (!existsSync(pkgJson)) continue
    try {
      const { name } = JSON.parse(readFileSync(pkgJson, 'utf8'))
      const distDir = join(base, entry, 'dist')
      if (name && existsSync(distDir)) {
        workspacePkgs.push({ name, distDir })
      }
    } catch { /* skip */ }
  }
}

// ── 2. Find all per-package node_modules ────────────────────────────────────
const perPkgNmDirs = []
for (const dir of ['packages', 'apps']) {
  const base = join(root, dir)
  if (!existsSync(base)) continue
  for (const entry of readdirSync(base)) {
    const nm = join(base, entry, 'node_modules')
    if (existsSync(nm)) perPkgNmDirs.push(nm)
  }
}
// Also root node_modules
const rootNm = join(root, 'node_modules')
if (existsSync(rootNm)) perPkgNmDirs.push(rootNm)

// ── 3. For each workspace pkg, sync dist to all dependent node_modules ───────
let synced = 0
for (const { name, distDir } of workspacePkgs) {
  // Convert @scope/pkg → @scope/pkg directory structure
  const pkgDirName = name.startsWith('@')
    ? name  // keep @scope/pkg as-is, path.join handles it
    : name

  for (const nmDir of perPkgNmDirs) {
    const targetPkg = join(nmDir, pkgDirName)
    const targetDist = join(targetPkg, 'dist')

    if (!existsSync(targetDist)) continue

    // Don't sync a package to itself
    if (distDir === targetDist) continue

    try {
      cpSync(distDir, targetDist, { recursive: true })
      synced++
      console.log(`  synced ${name}/dist → ${targetDist.replace(root, '')}`)
    } catch (e) {
      console.error(`  FAILED ${name}: ${e.message}`)
    }
  }
}

console.log(`\nDist sync complete: ${synced} location(s) updated`)
