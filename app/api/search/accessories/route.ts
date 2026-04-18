import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import {
  RUGGED_BRANDS, SEARCH_BASE, HEADERS, SearchProduct,
  buildExistingNamesSet, isAlreadyInSanity, extractPrice,
} from '@/lib/sunsky-search-utils';

// Accessory search queries — brand-specific + generic
const BRANDS_TO_SEARCH = ['Blackview', 'Oukitel', 'Ulefone', 'Doogee', 'HOTWAV', 'UMIDIGI', 'Unihertz', 'UNIWA', 'Cubot', 'AGM'];
const ACC_SUFFIXES = ['case', 'screen+protector', 'charger', 'cable', 'replacement+lcd', 'housing', 'back+cover'];
const SEARCHES: string[] = [];
for (const brand of BRANDS_TO_SEARCH) {
  for (const suffix of ACC_SUFFIXES) {
    SEARCHES.push(`${brand}+${suffix}`);
  }
}
// Add generic searches
SEARCHES.push('rugged+phone+case', 'rugged+phone+charger', 'rugged+phone+screen+protector');

// Category classification
const CATEGORIES: { key: string; label: string; regex: RegExp }[] = [
  { key: 'cases', label: 'Cases & Covers', regex: /\b(case|cover|bumper|shell|armor case)\b/i },
  { key: 'screen-protection', label: 'Screen Protectors', regex: /\b(screen protector|tempered glass|film|glass protector|protective film)\b/i },
  { key: 'charging', label: 'Cables & Chargers', regex: /\b(charger|cable|adapter|power bank|powerbank|dock|charging|usb)\b/i },
  { key: 'replacement-parts', label: 'Replacement Parts', regex: /\b(lcd|digitizer|replacement|housing|frame|back cover|flex|sim tray|battery replacement|motherboard|repair)\b/i },
  { key: 'mounts-holders', label: 'Mounts & Holders', regex: /\b(holder|mount|stand|clip|cradle|strap|band|bracket)\b/i },
];

// Indicators that a product is actually a phone (not an accessory)
const PHONE_INDICATORS = /\b(rugged phone|rugged smartphone|ip68.*phone|ip69.*phone|smartphone|cellphone|cell phone|mobile phone)\b/i;
// Positive indicators for accessories
const ACC_INDICATORS = /\b(case|cover|glass|protector|film|cable|charger|adapter|holder|mount|strap|band|stylus|pen|earphone|headset|earbuds|speaker|powerbank|power bank|dock|stand|keyboard|mouse|hub|dongle|replacement|repair|lcd|digitizer|flex|battery replacement|back cover|housing|frame|sim tray)\b/i;

interface AccessoryProduct extends SearchProduct {
  category: string;
}

function classifyCategory(name: string): string {
  for (const cat of CATEGORIES) {
    if (cat.regex.test(name)) return cat.key;
  }
  return 'other';
}

function extractAccessoryProducts($: cheerio.CheerioAPI, seen: Set<string>): AccessoryProduct[] {
  const products: AccessoryProduct[] = [];

  $('a[href*="/p/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/p\/(\w+)\//);
    if (!match || seen.has(match[1])) return;

    const rawText = $(el).text().trim();
    if (rawText.length < 10) return;

    const cleanName = rawText
      .replace(/^\s*\[[^\]]*\]\s*/, '')
      .trim()
      .substring(0, 150);

    if (!cleanName) return;

    const brand = cleanName.split(' ')[0].toUpperCase();

    // Must be a known rugged brand
    if (!RUGGED_BRANDS.has(brand)) return;
    // Must match an accessory keyword
    if (!ACC_INDICATORS.test(cleanName)) return;
    // Must NOT look like a phone itself
    if (PHONE_INDICATORS.test(cleanName) && !ACC_INDICATORS.test(cleanName)) return;

    const price = extractPrice($(el), $);
    const image = `https://img.diylooks.com/upload/store/product_m/${match[1]}.jpg`;
    const category = classifyCategory(cleanName);

    seen.add(match[1]);
    products.push({
      id: match[1],
      name: cleanName.substring(0, 120),
      url: href,
      image,
      price,
      brand,
      category,
    });
  });

  return products;
}

export async function GET(req: NextRequest) {
  const brandFilter = req.nextUrl.searchParams.get('brand')?.toUpperCase() || '';
  const categoryFilter = req.nextUrl.searchParams.get('category') || '';

  try {
    const urls = SEARCHES.map(kw => SEARCH_BASE + kw);
    const [existingNames, ...sunskyResults] = await Promise.allSettled([
      buildExistingNamesSet(),
      ...urls.map(url => fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000) }).then(r => r.text())),
    ]);

    const names = existingNames.status === 'fulfilled' ? existingNames.value : new Set<string>();

    const seen = new Set<string>();
    const allProducts: AccessoryProduct[] = [];

    for (const result of sunskyResults) {
      if (result.status !== 'fulfilled') continue;
      const $ = cheerio.load(result.value);
      allProducts.push(...extractAccessoryProducts($, seen));
    }

    const newProducts = allProducts.filter(p => !isAlreadyInSanity(p.name, names));

    let filtered = newProducts;
    if (brandFilter) filtered = filtered.filter(p => p.brand === brandFilter);
    if (categoryFilter) filtered = filtered.filter(p => p.category === categoryFilter);

    filtered.sort((a, b) => {
      if (a.price && !b.price) return -1;
      if (!a.price && b.price) return 1;
      return a.name.localeCompare(b.name);
    });

    const brandCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    for (const p of newProducts) {
      brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
      categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    }

    return NextResponse.json({
      products: filtered,
      total: filtered.length,
      brands: brandCounts,
      categories: categoryCounts,
    });
  } catch (err: unknown) {
    console.error('Accessories search error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
