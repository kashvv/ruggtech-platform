import { NextRequest, NextResponse } from 'next/server';
import { sanity, ALL_TYPES, assetRefToUrl } from '@/lib/sanity';
import { generateCatalogPDF, type CatalogProduct } from '@/lib/catalog-pdf';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      productIds,
      title,
      discountPercent = 0,
      layout = 'grid',
      priceOverrides,
    } = body as {
      productIds: string[];
      title?: string;
      discountPercent?: number;
      layout?: 'grid' | 'list';
      priceOverrides?: Record<string, number>;
    };

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: 'No products selected' }, { status: 400 });
    }
    if (productIds.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 products per catalog' }, { status: 400 });
    }
    if (discountPercent < 0 || discountPercent > 100) {
      return NextResponse.json({ error: 'Discount must be 0-100' }, { status: 400 });
    }

    const typeFilter = `_type in ${JSON.stringify([...ALL_TYPES])}`;
    const groq = `*[${typeFilter} && _id in $ids] | order(name asc) {
      _id, _type, name, brand, price, originalPrice,
      description, details, inStock, stockQuantity,
      warranty,
      display, battery, camera, storage, ram, os, processor,
      "imageRef": image[0].asset._ref
    }`;

    const docs = await sanity.fetch(groq, { ids: productIds });

    const products: CatalogProduct[] = docs.map((d: Record<string, unknown>) => ({
      ...d,
      imageUrl: assetRefToUrl(d.imageRef as string),
    }));

    const pdfBuffer = await generateCatalogPDF(products, {
      title,
      discountPercent,
      layout,
      priceOverrides,
    });

    const date = new Date().toISOString().split('T')[0];

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ruggtech-catalog-${date}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (err: unknown) {
    console.error('Catalog generation error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
