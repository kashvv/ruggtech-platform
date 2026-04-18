import { NextRequest, NextResponse } from 'next/server';
import { scrapeProduct } from '@/lib/scraper';
import {
  detectSchemaType, detectCategory, buildSpecsFromScraped,
  calculatePricing, generateKeywords, generateSlug,
  generateSeoTitle, generateSeoDescription, generateDetails,
  generateMarketingContent,
} from '@/lib/product-processor';
import { predownloadImages } from '@/lib/image-pipeline';
import { createSession } from '@/lib/sessions';
import { sanity } from '@/lib/sanity';

export async function POST(req: NextRequest) {
  const { url, markup, brand } = await req.json();
  if (!url?.startsWith('http')) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const scrapedData = await scrapeProduct(url);
    if (brand) scrapedData.brand = brand;

    const schemaType  = detectSchemaType(scrapedData);
    const specs       = buildSpecsFromScraped(scrapedData, schemaType);
    const markupPct   = parseFloat(markup) || parseFloat(process.env.DEFAULT_MARKUP_PERCENT || '35');
    const usdToTtd    = parseFloat(process.env.USD_TO_TTD_RATE || '6.80');

    // Pricing is null until user manually sets their selling price
    const pricing = calculatePricing(scrapedData.price && scrapedData.currency !== 'TTD' ? scrapedData.price : 0, markupPct, usdToTtd);
    const keywords    = generateKeywords(scrapedData, specs);
    const slug        = generateSlug(scrapedData.name);
    const seoTitle    = generateSeoTitle(scrapedData);
    const seoDesc     = generateSeoDescription(scrapedData, specs);
    const details     = generateDetails(scrapedData, specs);
    const marketing   = generateMarketingContent(scrapedData, specs, pricing);

    // Duplicate check
    let isDuplicate = false;
    try {
      const count = await sanity.fetch(`count(*[slug.current == $slug])`, { slug });
      if (count > 0) isDuplicate = true;
    } catch {}

    // Pre-download images
    let downloadedFiles: { filepath: string; index: number }[] = [];
    try {
      downloadedFiles = await predownloadImages(scrapedData.name, scrapedData.images);
    } catch {}

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    createSession({
      sessionId, scrapedData, schemaType, specs, pricing,
      keywords, customTags: [], removedImages: [], slug, isDuplicate,
      seoTitle, seoDesc, details, markupPct, downloadedFiles,
      marketing,
    });

    return NextResponse.json({
      sessionId,
      name: scrapedData.name,
      brand: scrapedData.brand,
      schemaType,
      category: detectCategory(schemaType),
      slug,
      sourceUrl: scrapedData.sourceUrl,
      pricing,
      isDuplicate,
      seoTitle,
      seoDesc,
      details,
      specs,
      keywords: keywords.slice(0, 20),
      totalKeywords: keywords.length,
      images: scrapedData.images,
      imageCount: scrapedData.images.length,
      downloadedCount: downloadedFiles.length,
      marketing,
      scrapedPriceTTD: scrapedData.currency === 'TTD' ? (scrapedData.price || null) : null,
      scrapedPriceUSD: scrapedData.currency !== 'TTD' ? (scrapedData.price || null) : null,
    });
  } catch (err: unknown) {
    console.error('Scrape error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
