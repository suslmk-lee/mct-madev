import { Router, type Request, type Response } from 'express';
import { sendError } from '../routeError.js';
import { existsSync, readdirSync, statSync, readFileSync, createReadStream } from 'node:fs';
import { join, resolve, relative, extname, sep } from 'node:path';
import type { ServerDatabase } from '../database.js';

function getDb(req: Request): ServerDatabase {
  return req.app.locals.db as ServerDatabase;
}

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', '.cache', '.turbo', 'coverage', '.next',
]);

interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  ext?: string;
}

const MAX_FILES = 500;

interface CollectResult {
  entries: FileEntry[];
  truncated: boolean;
}

function collectFiles(dir: string, base: string, depth = 0, counter = { count: 0 }, maxPerDir = 200): FileEntry[] {
  if (depth > 4 || counter.count >= MAX_FILES) return [];
  const entries: FileEntry[] = [];
  let items: string[];
  try {
    items = readdirSync(dir).sort();
  } catch {
    return entries;
  }

  let dirCount = 0;
  for (const item of items) {
    if (counter.count >= MAX_FILES || dirCount >= maxPerDir) break;
    if (IGNORE_DIRS.has(item) || item.startsWith('.')) continue;
    const full = join(dir, item);
    let st;
    try { st = statSync(full); } catch { continue; }
    const relPath = relative(base, full).replace(/\\/g, '/');

    if (st.isDirectory()) {
      entries.push({ path: relPath + '/', type: 'directory' });
      entries.push(...collectFiles(full, base, depth + 1, counter, maxPerDir));
    } else {
      entries.push({
        path: relPath,
        type: 'file',
        size: st.size,
        ext: extname(item).toLowerCase(),
      });
      counter.count++;
    }
    dirCount++;
  }
  return entries;
}

function collectFilesWithMeta(dir: string, maxPerDir = 200): CollectResult {
  const counter = { count: 0 };
  const entries = collectFiles(dir, dir, 0, counter, maxPerDir);
  return { entries, truncated: counter.count >= MAX_FILES };
}

/**
 * Returns the resolved absolute path if it is safely within baseDir, or null if
 * the path escapes the base directory (path traversal attempt).
 * Uses sep-terminated prefix comparison to prevent partial directory name matches
 * and handles Windows drive letter case differences.
 */
function safeResolve(baseDir: string, filePath: string): string | null {
  const base = resolve(baseDir);
  const safeBase = base.endsWith(sep) ? base : base + sep;
  const abs = resolve(base, filePath);
  // Allow exact match (baseDir itself) or prefix match with separator
  if (abs !== base && !abs.startsWith(safeBase)) return null;
  return abs;
}

export function createFilesRouter(): Router {
  const router = Router({ mergeParams: true });

  // GET /projects/:projectId/files — file tree
  router.get('/', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const projectId = param(req, 'projectId');
      const project = await db.getProject(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const repoPath = project.repoPath;
      if (!repoPath || !existsSync(repoPath)) {
        res.json({ files: [], repoPath: repoPath ?? null });
        return;
      }
      const { entries: files, truncated } = collectFilesWithMeta(repoPath);
      res.json({ files, repoPath, truncated });
    } catch (err) {
      sendError(res, 500, 'Failed to list files', err);
    }
  });

  // GET /projects/:projectId/files/content?path=src/index.html — file contents
  router.get('/content', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const projectId = param(req, 'projectId');
      const filePath = String(req.query.path ?? '').trim();
      if (!filePath) {
        res.status(400).json({ error: 'path query param required' });
        return;
      }
      const project = await db.getProject(projectId);
      if (!project?.repoPath) {
        res.status(404).json({ error: 'Project or repoPath not found' });
        return;
      }
      // Security: resolve and ensure within repoPath
      const safe = filePath.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:[\\/]?/, '');
      const abs = safeResolve(project.repoPath, safe);
      if (!abs) {
        res.status(400).json({ error: 'Path traversal denied' });
        return;
      }
      if (!existsSync(abs)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      const content = readFileSync(abs, 'utf-8');
      res.json({ path: safe, content, size: Buffer.byteLength(content, 'utf-8') });
    } catch (err) {
      sendError(res, 500, 'Failed to read file', err);
    }
  });

  // GET /projects/:projectId/files/download?path=src/index.html — raw download
  router.get('/download', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const projectId = param(req, 'projectId');
      const filePath = String(req.query.path ?? '').trim();
      if (!filePath) {
        res.status(400).json({ error: 'path query param required' });
        return;
      }
      const project = await db.getProject(projectId);
      if (!project?.repoPath) {
        res.status(404).json({ error: 'Project or repoPath not found' });
        return;
      }
      const safe = filePath.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:[\\/]?/, '');
      const abs = safeResolve(project.repoPath, safe);
      if (!abs) {
        res.status(400).json({ error: 'Path traversal denied' });
        return;
      }
      if (!existsSync(abs)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      const filename = abs.split(/[\\/]/).pop() ?? 'file';
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      createReadStream(abs).pipe(res);
    } catch (err) {
      sendError(res, 500, 'Failed to download file', err);
    }
  });

  return router;
}
