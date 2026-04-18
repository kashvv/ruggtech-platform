import * as cheerio from 'cheerio';
import { sanity } from '@/lib/sanity';

export const RUGGED_BRANDS = new Set([
  'BLACKVIEW', 'ULEFONE', 'OUKITEL', 'UMIDIGI', 'DOOGEE', 'HOTWAV',
  'UNIHERTZ', 'UNIWA', 'CUBOT', 'AGM', 'FOSSIBOT', 'HAMTOD', 'SOYES',
]);

export const SEARCH_BASE = 'https://www.sunsky-online.com/product/default!search.do?headerCategoryId=&keyword=';

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface SearchProduct {
  id: string;
  name: string;
  url: string;
  image: string;
  price: number | null;
  brand: string;
}

export async function buildExistingNamesSet(): Promise<Set<string>> {
  const existingNames = new Set<string>();
  try {
    const results = await sanity.fetch<{ name: string }[]>(`*[defined(name)]{ name }`);
    if (Array.isArray(results)) {
      for (const p of results) {
        if (p.name) existingNames.add(p.name.toLowerCase().trim());
      }
    }
  } catch {
    // Graceful fallback if Sanity is unreachable
  }
  return existingNames;
}

export function isAlreadyInSanity(productName: string, existingNames: Set<string>): boolean {
  const lower = productName.toLowerCase().trim();
  for (const eName of existingNames) {
    if (eName === lower) return true;
    const pWords = lower.split(/\s+/).slice(0, 3).join(' ');
    const eWords = eName.split(/\s+/).slice(0, 3).join(' ');
    if (pWords.length > 10 && pWords === eWords) return true;
  }
  return false;
}

export function extractPrice($el: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): number | null {
  let card = $el.parent();
  let priceStr = '';
  for (let i = 0; i < 6 && !priceStr; i++) {
    const np = card.find('.nowprice').first().text();
    const fp = card.find('.fixtopprice').first().text();
    priceStr = np || fp;
    card = card.parent();
  }
  const priceMatch = priceStr.match(/\$([\d,.]+)/);
  return priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
}
