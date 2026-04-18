import { NextRequest, NextResponse } from 'next/server';
import { scrapeProduct } from '@/lib/scraper';
import { predownloadImages } from '@/lib/image-pipeline';

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  try {
    const scraped = await scrapeProduct(url);
    if (!scraped.images.length) {
      return NextResponse.json({ error: 'No images found on page' }, { status: 400 });
    }

    // Pre-download images so they're ready for processing
    const downloaded = await predownloadImages(scraped.name, scraped.images);

    return NextResponse.json({
      name: scraped.name,
      images: scraped.images,
      downloadedCount: downloaded.length,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
