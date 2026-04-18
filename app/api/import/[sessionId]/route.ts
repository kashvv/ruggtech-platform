import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession, deleteSession } from '@/lib/sessions';
import {
  buildSpecsFromScraped, calculatePricing, generateKeywords,
  generateSlug, generateSeoTitle, generateDetails,
} from '@/lib/product-processor';
import { ALL_TYPES } from '@/lib/sanity';

type Ctx = { params: Promise<{ sessionId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { sessionId } = await params;
  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const { action, value } = await req.json();
  const usdToTtd = parseFloat(process.env.USD_TO_TTD_RATE || '6.80');
  let s = { ...session };

  switch (action) {
    case 'set_price': {
      const p = parseFloat(value);
      if (!isNaN(p) && p > 0) {
        s.pricing = s.pricing
          ? { ...s.pricing, sellingPriceTtd: p, sellingPriceUsd: p / usdToTtd, profitTtd: p - s.pricing.supplierCostUsd * usdToTtd, profitUsd: (p - s.pricing.supplierCostUsd * usdToTtd) / usdToTtd }
          : { supplierCostUsd: 0, markupPercent: s.markupPct, sellingPriceUsd: p / usdToTtd, sellingPriceTtd: p, profitUsd: 0, profitTtd: 0 };
      }
      break;
    }
    case 'set_markup': {
      const m = parseFloat(value);
      if (!isNaN(m) && s.pricing?.supplierCostUsd) {
        s.pricing = calculatePricing(s.pricing.supplierCostUsd, m, usdToTtd) || s.pricing;
        s.markupPct = m;
      }
      break;
    }
    case 'set_name': {
      s.scrapedData = { ...s.scrapedData, name: value };
      s.slug = generateSlug(value);
      s.keywords = generateKeywords(s.scrapedData, s.specs);
      s.seoTitle = generateSeoTitle(s.scrapedData);
      break;
    }
    case 'set_brand': {
      s.scrapedData = { ...s.scrapedData, brand: value };
      s.keywords = generateKeywords(s.scrapedData, s.specs);
      break;
    }
    case 'set_schema': {
      if (ALL_TYPES.includes(value)) {
        s.schemaType = value;
        s.specs = buildSpecsFromScraped(s.scrapedData, value);
        s.keywords = generateKeywords(s.scrapedData, s.specs);
      }
      break;
    }
    case 'remove_image': {
      const idx = parseInt(value);
      if (!isNaN(idx) && !s.removedImages.includes(idx)) s.removedImages = [...s.removedImages, idx];
      break;
    }
    case 'restore_image': {
      s.removedImages = s.removedImages.filter(i => i !== parseInt(value));
      break;
    }
    case 'add_tags': {
      const tags = String(value).split(',').map(t => t.trim()).filter(Boolean);
      const unique = tags.filter(t => !s.customTags.includes(t));
      s.customTags = [...s.customTags, ...unique];
      break;
    }
    case 'remove_tag': {
      s.customTags = s.customTags.filter(t => t !== value);
      break;
    }
    case 'set_details': {
      s.details = value;
      break;
    }
    case 'set_spec': {
      const { key, val } = JSON.parse(value);
      s.specs = { ...s.specs, [key]: val };
      break;
    }
    case 'ai_rewrite_details': {
      const { rewriteDescription } = await import('@/lib/ai-rewrite');
      const rewritten = await rewriteDescription(
        s.details || '',
        s.scrapedData?.name || '',
        s.scrapedData?.brand || '',
        s.schemaType || 'product',
        s.specs || {},
      );
      s.details = rewritten;
      break;
    }
    case 'ai_rewrite_marketing': {
      const { rewriteMarketing } = await import('@/lib/ai-rewrite');
      const currentCaption = value || s.details || '';
      const rewritten = await rewriteMarketing(
        currentCaption,
        s.scrapedData?.name || '',
        s.scrapedData?.brand || '',
      );
      // Return the rewritten marketing text in the response — don't store it on session
      updateSession(sessionId, s);
      return NextResponse.json({
        sessionId: s.sessionId,
        name: s.scrapedData.name,
        brand: s.scrapedData.brand,
        schemaType: s.schemaType,
        slug: s.slug,
        pricing: s.pricing,
        removedImages: s.removedImages,
        customTags: s.customTags,
        specs: s.specs,
        details: s.details,
        rewrittenMarketing: rewritten,
      });
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  updateSession(sessionId, s);

  return NextResponse.json({
    sessionId: s.sessionId,
    name: s.scrapedData.name,
    brand: s.scrapedData.brand,
    schemaType: s.schemaType,
    slug: s.slug,
    pricing: s.pricing,
    removedImages: s.removedImages,
    customTags: s.customTags,
    specs: s.specs,
    details: s.details,
  });
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { sessionId } = await params;
  deleteSession(sessionId);
  return NextResponse.json({ success: true });
}
