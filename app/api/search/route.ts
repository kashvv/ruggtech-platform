import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import {
  RUGGED_BRANDS, SEARCH_BASE, HEADERS, SearchProduct,
  buildExistingNamesSet, isAlreadyInSanity, extractPrice,
} from '@/lib/sunsky-search-utils';

// Search queries — each targets rugged phones by brand + generic rugged searches
const SEARCHES = [
  'Blackview+rugged', 'Oukitel+rugged', 'Ulefone+rugged', 'Doogee+rugged',
  'UMIDIGI+rugged', 'HOTWAV+rugged', 'Unihertz+rugged', 'UNIWA+rugged',
  'Cubot+rugged', 'AGM+rugged', 'Fossibot+rugged',
  'rugged+phone', 'rugged+smartphone', 'ip68+phone',
];

// Exclude accessories/parts
const EXCLUDE = /\b(case|cover|glass|protector|film|cable|charger|adapter|holder|mount|strap|band|stylus|pen|earphone|headset|earbuds|speaker|powerbank|power bank|dock|stand|keyboard|mouse|hub|dongle|replacement|repair|lcd|digitizer|flex|battery replacement|back cover|housing|frame|sim tray|watch|tablet|pad\b|tab\b|laptop)\b/i;

// Must contain a rugged-phone indicator
const RUGGED_INDICATORS = /\b(rugged|ip68|ip69|mil-std|waterproof|shockproof|armor|tank|bison|king|warrior|fort|pilot|rock|shark|wave|marine|oscal|rugking)\b/i;

function extractProducts($: cheerio.CheerioAPI, seen: Set<string>): SearchProduct[] {
  const products: SearchProduct[] = [];

  $('a[href*="/p/MPH"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/p\/(MPH\w+)\//);
    if (!match || seen.has(match[1])) return;

    const rawText = $(el).text().trim();
    if (rawText.length < 10) return;

    const fullText = rawText + ' ' + decodeURIComponent(href);

    const cleanName = rawText
      .replace(/^\s*\[[^\]]*\]\s*/, '')
      .trim()
      .substring(0, 150);

    if (!cleanName) return;

    const brand = cleanName.split(' ')[0].toUpperCase();

    if (!RUGGED_BRANDS.has(brand)) return;
    if (EXCLUDE.test(cleanName)) return;
    if (!RUGGED_INDICATORS.test(fullText)) return;

    const price = extractPrice($(el), $);
    const image = `https://img.diylooks.com/upload/store/product_m/${match[1]}.jpg`;

    seen.add(match[1]);
    products.push({
      id: match[1],
      name: cleanName.replace(/,\s*\d+\.\d+\s*inch.*$/, '').substring(0, 120),
      url: href,
      image,
      price,
      brand,
    });
  });

  return products;
}

export async function GET(req: NextRequest) {
  const brandFilter = req.nextUrl.searchParams.get('brand')?.toUpperCase() || '';

  try {
    const urls = SEARCHES.map(kw => SEARCH_BASE + kw);
    const [existingNames, ...sunskyResults] = await Promise.allSettled([
      buildExistingNamesSet(),
      ...urls.map(url => fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000) }).then(r => r.text())),
    ]);

    const names = existingNames.status === 'fulfilled' ? existingNames.value : new Set<string>();

    const seen = new Set<string>();
    const allProducts: SearchProduct[] = [];

    for (const result of sunskyResults) {
      if (result.status !== 'fulfilled') continue;
      const $ = cheerio.load(result.value);
      allProducts.push(...extractProducts($, seen));
    }

    const newProducts = allProducts.filter(p => !isAlreadyInSanity(p.name, names));

    const filtered = brandFilter
      ? newProducts.filter(p => p.brand === brandFilter)
      : newProducts;

    filtered.sort((a, b) => {
      if (a.price && !b.price) return -1;
      if (!a.price && b.price) return 1;
      return a.name.localeCompare(b.name);
    });

    const brandCounts: Record<string, number> = {};
    for (const p of newProducts) {
      brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
    }

    return NextResponse.json({ products: filtered, total: filtered.length, brands: brandCounts });
  } catch (err: unknown) {
    console.error('Search error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
