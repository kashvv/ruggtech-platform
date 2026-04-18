import { NextRequest, NextResponse } from 'next/server';
import { scrapeProduct } from '@/lib/scraper';
import { predownloadImages, addWatermark, removeBackground, hasWatermarkFile } from '@/lib/image-pipeline';
import { sanity } from '@/lib/sanity';
import fs from 'fs';
import path from 'path';

async function uploadImage(filepath: string): Promise<string | null> {
  if (!fs.existsSync(filepath)) return null;
  const buf = fs.readFileSync(filepath);
  const ext = path.extname(filepath).toLowerCase();
  const mime = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' } as Record<string, string>)[ext] || 'image/jpeg';
  const asset = await sanity.assets.upload('image', buf, { filename: path.basename(filepath), contentType: mime });
  return asset._id;
}

export async function POST(req: NextRequest) {
  const { productId, url, bgRemoveIndexes = [], watermarkIndexes = [], removedIndexes = [] } = await req.json();

  if (!productId || !url) {
    return NextResponse.json({ error: 'Missing productId or url' }, { status: 400 });
  }

  try {
    const scraped = await scrapeProduct(url);
    if (!scraped.images.length) {
      return NextResponse.json({ error: 'No images found on page' }, { status: 400 });
    }

    const downloaded = await predownloadImages(scraped.name, scraped.images);
    if (!downloaded.length) {
      return NextResponse.json({ error: 'Failed to download any images' }, { status: 400 });
    }

    // Filter out removed images
    const activeFiles = downloaded.filter(f => !removedIndexes.includes(f.index));
    const doWm = hasWatermarkFile();

    const results = await Promise.allSettled(
      activeFiles.map(async ({ filepath, index }) => {
        let current = filepath;
        if (bgRemoveIndexes.includes(index)) {
          try { current = await removeBackground(current); } catch { current = filepath; }
        }
        if (watermarkIndexes.includes(index) && doWm) {
          try { current = await addWatermark(current); } catch {}
        }
        return uploadImage(current);
      })
    );

    const imageAssetIds = results
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter((id): id is string => !!id);

    if (!imageAssetIds.length) {
      return NextResponse.json({ error: 'Failed to upload any images' }, { status: 500 });
    }

    // Patch Sanity document — clear old images first, then set new ones
    const patch: Record<string, unknown> = {};
    for (let i = 0; i < 8; i++) {
      const field = i === 0 ? 'image' : `image${i + 1}`;
      if (i < imageAssetIds.length) {
        patch[field] = [{
          _type: 'image', _key: `img${i}`,
          asset: { _type: 'reference', _ref: imageAssetIds[i] },
          alt: `${scraped.name} - RUGGTECH`,
        }];
      }
    }

    await sanity.patch(productId).set(patch).commit();

    return NextResponse.json({
      success: true,
      imagesUploaded: imageAssetIds.length,
      totalFound: scraped.images.length,
    });
  } catch (err: unknown) {
    console.error('Rescrape error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
