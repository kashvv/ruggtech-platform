import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const PARTSOUQ = 'https://partsouq.com';

// Rotate through different UA strings to avoid detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];


interface PartResult {
  name: string;
  partNumber: string;
  brand: string;
  price: string;
  availability: string;
  imageUrl: string;
  url: string;
}

// Detect if this is a VIN (17 chars alphanumeric) or chassis (contains dash) or part number
function queryType(q: string): 'vin' | 'chassis' | 'part' {
  const clean = q.trim().toUpperCase();
  if (clean.length === 17 && /^[A-Z0-9]+$/.test(clean)) return 'vin';
  if (clean.includes('-') && clean.split('-').length === 2) return 'chassis';
  return 'part';
}

function extractImageUrl(src: string): string {
  if (!src) return '';
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('/')) return PARTSOUQ + src;
  return src;
}

function parseSearchResults($: cheerio.CheerioAPI, query: string): PartResult[] {
  const results: PartResult[] = [];

  // Each result card: the structure from the snapshot shows h1 for name, h2 for part number,
  // paragraph for availability, image link for the image, and a price div
  // Cards are direct children of the main content area
  $('h1').each((_, el) => {
    const card = $(el).closest('div').parent();
    if (!card.length) return;

    const name = $(el).text().trim();
    if (!name || name.length < 3) return;

    // Part number from h2
    const h2 = card.find('h2').first().text().trim();
    const partNumberMatch = h2.match(/Part\s*number[:\s]+([A-Z0-9\-]+)/i) || h2.match(/([A-Z0-9\-]{4,30})/);
    const partNumber = partNumberMatch?.[1]?.trim() || '';

    // Price
    const priceEl = card.find('*').filter((_, e) => /\d+\.\d+\$/.test($(e).text())).first();
    const priceText = priceEl.text().trim().match(/([\d,.]+\$|\$[\d,.]+)/)?.[0] || '';

    // Availability
    const availEl = card.find('p').filter((_, e) => /Availability/i.test($(e).text())).first();
    const availability = availEl.text().replace(/Availability:?\s*/i, '').trim();

    // Brand from img alt
    const brandImg = card.find('img[alt]').filter((_, e) => {
      const alt = $(e).attr('alt') || '';
      return alt.length > 1 && alt.length < 30 && !/sensor|speed|abs|part/i.test(alt);
    }).first();
    const brand = brandImg.attr('alt') || '';

    // Image from first link's href (pattern: /assets/tesseract/assets/partsimages/Brand/PART.jpg)
    const imgLink = card.find('a[href*="partsimages"], a[href*="PartCover"]').first();
    const imageUrl = extractImageUrl(imgLink.attr('href') || '');

    // Product URL — construct from part number
    const url = partNumber
      ? `${PARTSOUQ}/en/search/all?q=${encodeURIComponent(partNumber)}`
      : `${PARTSOUQ}/en/search/all?q=${encodeURIComponent(query)}`;

    if (name && (partNumber || imageUrl)) {
      results.push({ name, partNumber, brand, price: priceText, availability, imageUrl, url });
    }
  });

  return results;
}

// For VIN/chassis results, the page shows a parts catalog table grouped by category
// Return a summary of the vehicle info and a link to browse the full catalog
function parseVinResults($: cheerio.CheerioAPI, query: string): PartResult[] {
  const results: PartResult[] = [];

  // The table rows contain category names and part links
  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;
    const cat = $(cells[0]).text().trim();
    const link = $(cells[1]).find('a').first();
    const href = link.attr('href') || '';
    const name = link.text().trim() || cat;
    if (!name || name.length < 2) return;

    const url = href.startsWith('http') ? href : href ? PARTSOUQ + href : `${PARTSOUQ}/en/search/all?q=${encodeURIComponent(query)}`;

    results.push({
      name,
      partNumber: cat,
      brand: '',
      price: '',
      availability: '',
      imageUrl: '',
      url,
    });
  });

  return results.slice(0, 30);
}

async function fetchWithPlaywright(url: string): Promise<string> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENTS[0],
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // @ts-expect-error fingerprint evasion
      window.chrome = { runtime: {} };
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for Cloudflare to resolve
    await page.waitForFunction(
      () => !document.title.includes('Just a moment'),
      { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(3000);
    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('q')?.trim() || '';
  if (!raw || raw.length < 3) {
    return NextResponse.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
  }

  const type = queryType(raw);
  // Part numbers and VINs go uppercase; part names stay as typed
  const query = type === 'part' && /\s/.test(raw) ? raw : raw.toUpperCase();
  const searchUrl = `${PARTSOUQ}/en/search/all?q=${encodeURIComponent(query)}`;

  try {
    const html = await fetchWithPlaywright(searchUrl);

    // Cloudflare challenge still showing
    if (html.includes('Just a moment') || html.includes('cf-browser-verification')) {
      return NextResponse.json({
        blocked: true,
        message: 'PartSouq requires browser verification. Try the "Open Site" button.',
        searchUrl,
        results: [],
      });
    }

    const $ = cheerio.load(html);
    const results = type === 'part' ? parseSearchResults($, query) : parseVinResults($, query);

    return NextResponse.json({
      results,
      total: results.length,
      type,
      searchUrl,
      message: results.length === 0 ? `No results parsed. Try opening PartSouq directly.` : undefined,
    });
  } catch (err: unknown) {
    console.error('PartSouq search error:', err);
    return NextResponse.json({
      blocked: true,
      message: 'Could not reach PartSouq. Use the "Open Site" button to search manually.',
      searchUrl,
      results: [],
    });
  }
}
