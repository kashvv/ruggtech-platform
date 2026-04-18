import { NextRequest, NextResponse } from 'next/server';
import { sanity } from '@/lib/sanity';
import { fillMissingFields } from '@/lib/ai-rewrite';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const { emptyFieldKeys } = await req.json();
    if (!Array.isArray(emptyFieldKeys) || emptyFieldKeys.length === 0) {
      return NextResponse.json({ error: 'No empty fields specified' }, { status: 400 });
    }

    const product = await sanity.fetch<Record<string, unknown>>(`*[_id == $id][0]`, { id });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const filled = await fillMissingFields(product, emptyFieldKeys);
    return NextResponse.json({ filled });
  } catch (err: unknown) {
    console.error('AI fill error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
