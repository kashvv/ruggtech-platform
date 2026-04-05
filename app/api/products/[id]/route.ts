import { NextRequest, NextResponse } from 'next/server';
import { sanity, assetRefToUrl } from '@/lib/sanity';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await sanity.getDocument(id);
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const imageFields = ['image','image2','image3','image4','image5','image6'];
    const resolved = { ...doc } as Record<string, unknown>;
    for (const field of imageFields) {
      const arr = doc[field];
      if (Array.isArray(arr)) {
        resolved[`${field}Url`] = arr
          .map((img: { asset?: { _ref?: string } }) => assetRefToUrl(img?.asset?._ref))
          .filter(Boolean);
      }
    }
    return NextResponse.json(resolved);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const fields = await req.json();
    if (!fields || Object.keys(fields).length === 0)
      return NextResponse.json({ error: 'No fields' }, { status: 400 });
    const updated = await sanity.patch(id).set(fields).commit();
    return NextResponse.json(updated);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await sanity.delete(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
