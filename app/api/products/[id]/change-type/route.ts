import { NextRequest, NextResponse } from 'next/server';
import { sanity, ALL_TYPES, type SchemaType } from '@/lib/sanity';

const SYSTEM_FIELDS = new Set(['_id', '_rev', '_type', '_createdAt', '_updatedAt']);

function reKey(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item, i) => {
      if (item && typeof item === 'object') {
        const copy = { ...(item as Record<string, unknown>) };
        if ('_key' in copy) copy._key = `k${Date.now().toString(36)}${i}`;
        for (const [k, v] of Object.entries(copy)) copy[k] = reKey(v);
        return copy;
      }
      return item;
    });
  }
  if (value && typeof value === 'object') {
    const copy = { ...(value as Record<string, unknown>) };
    for (const [k, v] of Object.entries(copy)) copy[k] = reKey(v);
    return copy;
  }
  return value;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { newType } = await req.json() as { newType?: string };

    if (!newType || !ALL_TYPES.includes(newType as SchemaType)) {
      return NextResponse.json({ error: 'Invalid newType' }, { status: 400 });
    }

    const existing = await sanity.getDocument(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (existing._type === newType) {
      return NextResponse.json({ error: 'Already this type' }, { status: 400 });
    }

    const carried: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(existing)) {
      if (SYSTEM_FIELDS.has(k)) continue;
      carried[k] = reKey(v);
    }

    const newDoc = { _type: newType, ...carried };
    const created = await sanity.create(newDoc);
    await sanity.delete(id);

    return NextResponse.json({ success: true, newId: created._id, newType });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
