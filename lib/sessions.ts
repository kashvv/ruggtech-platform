import type { ScrapedData, Specs, Pricing, MarketingContent } from './product-processor';
import type { SchemaType } from './sanity';

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

// In-memory store — survives Next.js hot reloads in dev by attaching to global
declare global { var __importSessions: Map<string, ImportSession> | undefined; }
const sessions: Map<string, ImportSession> = global.__importSessions ?? (global.__importSessions = new Map());

// Purge sessions older than 2 hours
const EXPIRE_MS = 2 * 60 * 60 * 1000;

function purgeExpired() {
  const now = Date.now();
  sessions.forEach((s, id) => {
    if (now - s.createdAt > EXPIRE_MS) sessions.delete(id);
  });
}

export function createSession(data: Omit<ImportSession, 'createdAt'>): ImportSession {
  purgeExpired();
  const session = { ...data, createdAt: Date.now() };
  sessions.set(data.sessionId, session);
  return session;
}

export function getSession(id: string): ImportSession | undefined {
  return sessions.get(id);
}

export function updateSession(id: string, patch: Partial<ImportSession>): ImportSession | null {
  const s = sessions.get(id);
  if (!s) return null;
  const updated = { ...s, ...patch };
  sessions.set(id, updated);
  return updated;
}

export function deleteSession(id: string) {
  sessions.delete(id);
}
