import type { ScrapedData, Specs, Pricing, MarketingContent } from './product-processor';
import type { SchemaType } from './sanity';
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';

export interface ImportSession {
  sessionId: string;
  scrapedData: ScrapedData;
  schemaType: SchemaType;
  specs: Specs;
  pricing: Pricing | null;
  keywords: string[];
  customTags: string[];
  removedImages: number[];
  slug: string;
  isDuplicate: boolean;
  seoTitle: string;
  seoDesc: string;
  details: string;
  markupPct: number;
  downloadedFiles: { filepath: string; index: number }[];
  marketing?: MarketingContent;
  createdAt: number;
}

const EXPIRE_MS = 2 * 60 * 60 * 1000;
const SESSIONS_DIR = path.join(process.cwd(), 'tmp', 'sessions');

function ensureDir() {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

function filePath(id: string) {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

function readFile(id: string): ImportSession | undefined {
  try {
    return JSON.parse(readFileSync(filePath(id), 'utf8'));
  } catch {
    return undefined;
  }
}

function writeFile(session: ImportSession) {
  ensureDir();
  writeFileSync(filePath(session.sessionId), JSON.stringify(session), 'utf8');
}

function purgeExpired() {
  ensureDir();
  const now = Date.now();
  for (const f of readdirSync(SESSIONS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const s = readFile(f.slice(0, -5));
    if (s && now - s.createdAt > EXPIRE_MS) {
      try { unlinkSync(filePath(s.sessionId)); } catch {}
    }
  }
}

export function createSession(data: Omit<ImportSession, 'createdAt'>): ImportSession {
  purgeExpired();
  const session = { ...data, createdAt: Date.now() } as ImportSession;
  writeFile(session);
  return session;
}

export function getSession(id: string): ImportSession | undefined {
  const s = readFile(id);
  if (!s) return undefined;
  if (Date.now() - s.createdAt > EXPIRE_MS) {
    try { unlinkSync(filePath(id)); } catch {}
    return undefined;
  }
  return s;
}

export function updateSession(id: string, patch: Partial<ImportSession>): ImportSession | null {
  const s = getSession(id);
  if (!s) return null;
  const updated = { ...s, ...patch };
  writeFile(updated);
  return updated;
}

export function deleteSession(id: string) {
  try { unlinkSync(filePath(id)); } catch {}
}
