import { NextRequest, NextResponse } from 'next/server';
import { sanity, ALL_TYPES, assetRefToUrl } from '@/lib/sanity';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();
    const type   = searchParams.get('type') || 'all';

    const types = (type !== 'all' && ALL_TYPES.includes(type as never))
      ? [type]
      : [...ALL_TYPES];

    const typeFilter = `_type in ${JSON.stringify(types)}`;
    let groq: string;
    let params: Record<string, string> = {};

    if (search) {
      groq = `*[${typeFilter} && (name match $q || brand match $q)] | order(_updatedAt desc) [0..499] {
        _id, _type, name, brand, price, inStock, stockQuantity, slug, _updatedAt,
        "imageRef": image[0].asset._ref
      }`;
      params = { q: `${search}*` };
    } else {
      groq = `*[${typeFilter}] | order(_updatedAt desc) [0..499] {
        _id, _type, name, brand, price, inStock, stockQuantity, slug, _updatedAt,
        "imageRef": image[0].asset._ref
      }`;
    }

    const docs = await sanity.fetch(groq, params);
    const result = docs.map((d: Record<string, unknown>) => ({
      ...d,
      imageUrl: assetRefToUrl(d.imageRef as string),
    }));

    return NextResponse.json({ products: result, total: result.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
