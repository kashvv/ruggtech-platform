import { NextRequest, NextResponse } from 'next/server';
import { getSession, deleteSession } from '@/lib/sessions';
import { processAndUpload, cleanupTemp } from '@/lib/image-pipeline';
import { buildSanityDocument } from '@/lib/product-processor';
import { sanity } from '@/lib/sanity';

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const { bgRemoveIndexes = [], watermarkIndexes = [], editedCaption } = await req.json();

  try {
    const { scrapedData, schemaType, specs, pricing, customTags, removedImages, slug, details, downloadedFiles, marketing } = session;

    // Apply edited caption to marketing if the user changed it
    const finalMarketing = marketing && editedCaption != null
      ? { ...marketing, description: editedCaption }
      : marketing;

    // Filter out removed images from downloaded files
    const activeFiles = downloadedFiles.filter(f => !removedImages.includes(f.index));

    // Process + upload
    const imageAssetIds = await processAndUpload(activeFiles, bgRemoveIndexes, watermarkIndexes, sanity);

    // Filter scrapedData images
    const activeImages = scrapedData.images.filter((_, i) => !removedImages.includes(i));
    const filteredData = { ...scrapedData, images: activeImages };

    // Build & push Sanity doc
    const doc = buildSanityDocument(filteredData, specs, pricing, imageAssetIds, schemaType, customTags, details, finalMarketing);
    const result = await sanity.create(doc);

    // Meta Catalog (best-effort, don't fail the push if it errors)
    let metaSuccess = false;
    try {
      const { pushToMetaCatalog } = await import('@/lib/meta-catalog');
      const firstImg = activeImages[0] || null;
      const metaResult = await pushToMetaCatalog(filteredData, pricing, slug, firstImg);
      metaSuccess = !!metaResult;
    } catch {}

    cleanupTemp();
    deleteSession(sessionId);

    return NextResponse.json({
      success: true,
      sanityId: result._id,
      sanityType: result._type,
      slug,
      url: `https://ruggtech.com/products/${slug}`,
      metaSuccess,
      price: pricing?.sellingPriceTtd || 0,
      imagesUploaded: imageAssetIds.length,
    });
  } catch (err: unknown) {
    console.error('Push error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
