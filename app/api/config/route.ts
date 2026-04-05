import { NextResponse } from 'next/server';
import { checkRembg, checkSharp, hasWatermarkFile } from '@/lib/image-pipeline';
import { PROJECT_ID, DATASET } from '@/lib/sanity';

export async function GET() {
  return NextResponse.json({
    projectId: PROJECT_ID,
    dataset: DATASET,
    defaultMarkup: parseFloat(process.env.DEFAULT_MARKUP_PERCENT || '35'),
    usdToTtd: parseFloat(process.env.USD_TO_TTD_RATE || '6.80'),
    hasRembg: checkRembg(),
    hasSharp: checkSharp(),
    hasWatermark: hasWatermarkFile(),
  });
}
