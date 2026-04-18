import { NextRequest, NextResponse } from 'next/server';

interface ExtractedProduct {
  name: string;
  brand: string;
  price: number | null;
  currency: string;
  description: string;
  specifications: Record<string, string>;
  images: string[];
  keyFeatures: string[];
}

function parseTextContent(text: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let current: ExtractedProduct | null = null;
  let section = '';

  for (const line of lines) {
    // Detect product boundaries — lines that look like product names
    // (all-caps, or short bold-looking lines followed by specs)
    const isHeader = /^[A-Z][A-Za-z0-9\s\-\+\/().]+$/.test(line)
      && line.length > 5 && line.length < 120
      && !line.includes(':');

    if (isHeader && (!current || Object.keys(current.specifications).length > 0)) {
      if (current && current.name) products.push(current);
      current = {
        name: line,
        brand: '',
        price: null,
        currency: 'USD',
        description: '',
        specifications: {},
        images: [],
        keyFeatures: [],
      };
      section = '';
      continue;
    }

    if (!current) {
      current = {
        name: '',
        brand: '',
        price: null,
        currency: 'USD',
        description: '',
        specifications: {},
        images: [],
        keyFeatures: [],
      };
    }

    // Detect section headers
    const lowerLine = line.toLowerCase();
    if (/^(specifications?|specs|technical|features|details)/i.test(line)) {
      section = 'specs';
      continue;
    }
    if (/^(description|overview|about|summary)/i.test(line)) {
      section = 'desc';
      continue;
    }
    if (/^(key features|highlights|benefits)/i.test(line)) {
      section = 'features';
      continue;
    }

    // Parse key:value pairs
    const kvMatch = line.match(/^([A-Za-z\s]+?)\s*[:|\-|–]\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim().toLowerCase();
      const val = kvMatch[2].trim();

      // Known field mapping
      if (/^(brand|manufacturer|make)$/.test(key)) {
        current.brand = val;
      } else if (/^(price|cost|msrp|rrp|srp)$/.test(key)) {
        const priceMatch = val.match(/([\d,.]+)/);
        if (priceMatch) current.price = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (/ttd|tt\$/i.test(val)) current.currency = 'TTD';
      } else if (/^(name|product\s*name|title|model)$/.test(key)) {
        if (!current.name) current.name = val;
      } else {
        // Everything else is a spec
        const specKey = key.replace(/\s+/g, '_');
        current.specifications[specKey] = val;
      }
    } else if (section === 'desc') {
      current.description += (current.description ? ' ' : '') + line;
    } else if (section === 'features') {
      const feat = line.replace(/^[\-•*]\s*/, '').trim();
      if (feat.length > 3) current.keyFeatures.push(feat);
    } else if (!section && line.length > 30) {
      // Long lines without a section header are likely description
      current.description += (current.description ? ' ' : '') + line;
    }
  }

  if (current && (current.name || Object.keys(current.specifications).length > 0)) {
    products.push(current);
  }

  return products;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    let text = '';
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.pdf')) {
      const pdfParse = (await import('pdf-parse')) as unknown as (buffer: Buffer) => Promise<{ text: string }>;
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.csv') || fileName.endsWith('.tsv')) {
      text = await file.text();
    } else if (fileName.endsWith('.json')) {
      const raw = await file.text();
      try {
        const data = JSON.parse(raw);
        // Handle array of products or single product
        const items = Array.isArray(data) ? data : [data];
        const products: ExtractedProduct[] = items.map((item: Record<string, unknown>) => ({
          name: (item.name || item.title || item.product_name || '') as string,
          brand: (item.brand || item.manufacturer || '') as string,
          price: typeof item.price === 'number' ? item.price : (typeof item.price === 'string' ? parseFloat(item.price) : null),
          currency: (item.currency || 'USD') as string,
          description: (item.description || item.details || '') as string,
          specifications: (typeof item.specifications === 'object' && item.specifications ? item.specifications : {}) as Record<string, string>,
          images: Array.isArray(item.images) ? item.images as string[] : [],
          keyFeatures: Array.isArray(item.features) ? item.features as string[] : [],
        }));
        return NextResponse.json({
          products,
          total: products.length,
          source: file.name,
          format: 'json',
        });
      } catch {
        return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use PDF, TXT, CSV, or JSON.' }, { status: 400 });
    }

    const products = parseTextContent(text);

    return NextResponse.json({
      products,
      total: products.length,
      source: file.name,
      format: fileName.endsWith('.pdf') ? 'pdf' : 'text',
      rawTextPreview: text.substring(0, 500),
    });
  } catch (err: unknown) {
    console.error('File upload error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
