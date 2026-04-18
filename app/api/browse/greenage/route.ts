import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { sanity } from '@/lib/sanity';

const BASE = 'https://greenagefarms.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const CATEGORIES = [
  'air-pumps-and-accessories',
  'fertilizers',
  'greenhouse-supplies',
  'grow-media-soil-and-amendments',
  'indoor-grow-supplies',
  'irrigation-components',
  'nft-channels-and-accessories',
  'plant-care',
  'pots-and-planters',
  'propagation',
  'pvc-and-hardware',
  'seeds',
  'storage-and-harvest',
  'testers-and-accessories',
  'water-pumps',
  'hydroponic-systems',
];

interface GreenAgeProduct {
  id: string;
  name: string;
  url: string;
  image: string;
  price: number | null;
  category: string;
  inStock: boolean;
}

function stripJetpack(src: string): string {
  const m = src.match(/i\d+\.wp\.com\/(.+?)(?:\?.*)?$/);
  return m ? `https://${m[1]}` : src;
}

async function fetchCategory(slug: string): Promise<GreenAgeProduct[]> {
  const products: GreenAgeProduct[] = [];
  let page = 1;
  const maxPages = 3;

  while (page <= maxPages) {
    // Page 1 must use the base URL — /page/1/ returns 406 on this server
    const url = page === 1
      ? `${BASE}/product-category/${slug}/`
      : `${BASE}/product-category/${slug}/page/${page}/`;
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
      if (!res.ok) break;
      const html = await res.text();
      const $ = cheerio.load(html);

      // This theme uses <section class="type-product"> instead of <li class="product">
      const items = $('section.type-product, li.product, .products .product');
      if (items.length === 0) break;

      items.each((_, el) => {
        // Product URL from thumbnail anchor or any /product/ link
        const productUrl = $(el).find('a[href*="/product/"]').first().attr('href') || '';
        if (!productUrl.includes('/product/')) return;

        // Name from heading or anchor text
        const name = $(el).find('h3.product-name a, .woocommerce-loop-product__title, h2.product-name, h2').first().text().trim();
        if (!name) return;

        // Image: data-src is lazy-loaded (may be placeholder), try to get real src from product ID
        // Use the product_id attribute to build a direct image URL if placeholder
        const imgEl = $(el).find('img').first();
        let rawImg = imgEl.attr('data-src') || imgEl.attr('src') || '';
        // Skip placeholders — the real image will be fetched during individual product scrape
        if (rawImg.includes('placeholder') || rawImg.includes('prod_loading')) rawImg = '';
        const image = rawImg ? stripJetpack(rawImg) : '';

        const priceText = $(el).find('.woocommerce-Price-amount bdi, .price .amount, .woocommerce-Price-amount').first().text().replace(/[^\d.]/g, '');
        const price = priceText ? parseFloat(priceText) : null;

        const inStock = !$(el).hasClass('outofstock')
          && !$(el).text().toLowerCase().includes('out of stock');

        const slugMatch = productUrl.match(/\/product\/([^/]+)\//);
        const id = slugMatch?.[1] || productUrl;

        products.push({ id, name, url: productUrl, image, price, category: slug, inStock });
      });

      const hasNext = $('a.next, .next.page-numbers').length > 0;
      if (!hasNext) break;
      page++;
    } catch {
      break;
    }
  }

  return products;
}

export async function GET(req: NextRequest) {
  const categoryFilter = req.nextUrl.searchParams.get('category') || '';

  try {
    const categoriesToFetch = categoryFilter ? [categoryFilter] : CATEGORIES;

    const [sanityResult, ...categoryResults] = await Promise.allSettled([
      sanity.fetch<{ name: string }[]>(`*[defined(name)]{ name }`),
      ...categoriesToFetch.map(slug => fetchCategory(slug)),
    ]);

    const existingNames = new Set<string>();
    if (sanityResult.status === 'fulfilled' && Array.isArray(sanityResult.value)) {
      for (const p of sanityResult.value) {
        if (p.name) existingNames.add(p.name.toLowerCase().trim());
      }
    }

    const allProducts: GreenAgeProduct[] = [];
    const seen = new Set<string>();

    for (const result of categoryResults) {
      if (result.status !== 'fulfilled') continue;
      for (const p of result.value) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          allProducts.push(p);
        }
      }
    }

    const newProducts = allProducts.filter(p => {
      const lower = p.name.toLowerCase().trim();
      for (const eName of existingNames) {
        if (eName === lower) return false;
        const pWords = lower.split(/\s+/).slice(0, 3).join(' ');
        const eWords = eName.split(/\s+/).slice(0, 3).join(' ');
        if (pWords.length > 8 && pWords === eWords) return false;
      }
      return true;
    });

    const categoryCounts: Record<string, number> = {};
    for (const p of newProducts) {
      categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    }

    newProducts.sort((a, b) => {
      if (a.price && !b.price) return -1;
      if (!a.price && b.price) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      products: newProducts,
      total: newProducts.length,
      categories: categoryCounts,
    });
  } catch (err: unknown) {
    console.error('GreenAge browse error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
