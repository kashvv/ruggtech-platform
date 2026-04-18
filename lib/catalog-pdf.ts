import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { TYPE_LABELS, type SchemaType } from './sanity';

export interface CatalogProduct {
  _id: string;
  _type: SchemaType;
  name: string;
  brand?: string;
  price?: number;
  originalPrice?: number;
  description?: string;
  details?: string;
  inStock?: boolean;
  stockQuantity?: number;
  imageUrl?: string | null;
  // specs
  display?: string;
  battery?: string;
  camera?: string;
  storage?: string;
  ram?: string;
  os?: string;
  processor?: string;
  // general
  warranty?: string;
  [key: string]: unknown;
}

export interface CatalogOptions {
  title?: string;
  discountPercent?: number;
  layout?: 'grid' | 'list';
  priceOverrides?: Record<string, number>; // productId → manual wholesale price
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PURPLE = '#7c3aed';
const DARK = '#1a1a2e';
const MUTED = '#64748b';
const GREEN = '#16a34a';
const RED = '#dc2626';
const AMBER = '#d97706';

function wholesalePrice(retail: number, discountPct: number): number {
  const raw = retail * (1 - discountPct / 100);
  return Math.round(raw / 5) * 5; // round to nearest $5
}

async function fetchImageBuffer(url: string, maxWidth = 280): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return await sharp(Buffer.from(arrayBuf))
      .resize(maxWidth, maxWidth, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 3) + '...' : clean;
}

function getWholesale(product: CatalogProduct, discountPct: number, overrides?: Record<string, number>): { wholesale: number; retail: number } {
  const retail = product.price || 0;
  if (overrides && overrides[product._id] != null) {
    return { wholesale: overrides[product._id], retail };
  }
  return { wholesale: wholesalePrice(retail, discountPct), retail };
}

function collectSpecs(p: CatalogProduct): { label: string; value: string }[] {
  const specs: { label: string; value: string }[] = [];
  const fields: [string, string][] = [
    ['processor', 'Processor'], ['ram', 'RAM'], ['storage', 'Storage'],
    ['display', 'Display'], ['battery', 'Battery'], ['camera', 'Camera'],
    ['os', 'OS'], ['warranty', 'Warranty'],
  ];
  for (const [key, label] of fields) {
    const val = p[key];
    if (val && typeof val === 'string' && val.trim()) specs.push({ label, value: val.trim() });
  }
  return specs;
}

// ── PDF Generation ───────────────────────────────────────────────────────────

export async function generateCatalogPDF(
  products: CatalogProduct[],
  options: CatalogOptions = {},
): Promise<Buffer> {
  const {
    title = 'RUGGTECH Wholesale Catalog',
    discountPercent = 0,
    layout = 'grid',
    priceOverrides,
  } = options;

  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Title: title, Author: 'RUGGTECH', Creator: 'RUGGTECH Platform' },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 40;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // Pre-fetch all images in parallel
  const imageMap = new Map<string, Buffer | null>();
  const imageFetches = products.map(async (p) => {
    if (p.imageUrl) {
      const buf = await fetchImageBuffer(p.imageUrl, layout === 'list' ? 200 : 180);
      imageMap.set(p._id, buf);
    }
  });
  await Promise.allSettled(imageFetches);

  // Load logo
  let logoBuf: Buffer | null = null;
  try {
    const logoPath = path.join(process.cwd(), 'assets', 'ruggtech-watermark.png');
    if (fs.existsSync(logoPath)) {
      logoBuf = await sharp(logoPath).resize(120, 120, { fit: 'inside' }).png().toBuffer();
    }
  } catch {}

  // ── Cover Page ────────────────────────────────────────────────────────────

  if (logoBuf) {
    doc.image(logoBuf, (PAGE_W - 120) / 2, 140, { width: 120 });
  }

  doc.moveDown(logoBuf ? 12 : 6);

  doc.fontSize(28).fillColor(PURPLE).font('Helvetica-Bold')
    .text('RUGGTECH', MARGIN, logoBuf ? 280 : 200, { align: 'center', width: CONTENT_W });

  doc.moveDown(0.5);
  doc.moveTo(MARGIN + 80, doc.y).lineTo(PAGE_W - MARGIN - 80, doc.y)
    .strokeColor(PURPLE).lineWidth(1.5).stroke();

  doc.moveDown(1);
  doc.fontSize(16).fillColor(DARK).font('Helvetica')
    .text(title, { align: 'center', width: CONTENT_W });

  doc.moveDown(0.5);
  doc.fontSize(11).fillColor(MUTED)
    .text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), { align: 'center', width: CONTENT_W });

  doc.moveDown(0.3);
  doc.text(`${products.length} product${products.length !== 1 ? 's' : ''}`, { align: 'center', width: CONTENT_W });

  if (discountPercent > 0) {
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor(AMBER)
      .text(`Wholesale Discount: ${discountPercent}% off retail`, { align: 'center', width: CONTENT_W });
  }

  // Category breakdown
  const catCounts: Record<string, number> = {};
  for (const p of products) {
    const label = TYPE_LABELS[p._type] || p._type;
    catCounts[label] = (catCounts[label] || 0) + 1;
  }
  doc.moveDown(2);
  doc.fontSize(10).fillColor(MUTED);
  for (const [cat, count] of Object.entries(catCounts)) {
    doc.text(`${cat}: ${count} product${count !== 1 ? 's' : ''}`, { align: 'center', width: CONTENT_W });
  }

  // Confidential notice
  doc.fontSize(9).fillColor(RED)
    .text('Wholesale pricing — not for retail distribution', MARGIN, PAGE_H - 80, { align: 'center', width: CONTENT_W });

  // ── Product Pages ─────────────────────────────────────────────────────────

  if (layout === 'grid') {
    renderGridLayout(doc, products, imageMap, discountPercent, priceOverrides, MARGIN, CONTENT_W, PAGE_W, PAGE_H);
  } else {
    renderListLayout(doc, products, imageMap, discountPercent, priceOverrides, MARGIN, CONTENT_W, PAGE_W, PAGE_H);
  }

  // ── Page Numbers (rendered on buffered pages) ──────────────────────────────

  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  const productPages = totalPages - 1; // exclude cover

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    if (i > 0) {
      // Position Y explicitly near the bottom — use save/restore so it doesn't affect page flow
      doc.save();
      doc.fontSize(8).fillColor(MUTED).font('Helvetica');
      doc.text(
        'RUGGTECH \u2014 Confidential Wholesale Pricing',
        MARGIN, PAGE_H - 30,
        { width: CONTENT_W / 2, lineBreak: false, height: 10 },
      );
      doc.text(
        `Page ${i} of ${productPages}`,
        PAGE_W / 2, PAGE_H - 30,
        { width: CONTENT_W / 2, align: 'right', lineBreak: false, height: 10 },
      );
      doc.restore();
    }
  }

  // IMPORTANT: switch back to last page before ending to prevent blank trailing pages
  if (totalPages > 0) doc.switchToPage(totalPages - 1);

  doc.end();

  await new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  return Buffer.concat(chunks);
}

// ── Grid Layout (2 per page) ─────────────────────────────────────────────────

function renderGridLayout(
  doc: PDFKit.PDFDocument,
  products: CatalogProduct[],
  imageMap: Map<string, Buffer | null>,
  discountPct: number,
  overrides: Record<string, number> | undefined,
  MARGIN: number, CONTENT_W: number, PAGE_W: number, _PAGE_H: number,
) {
  const COL_W = (CONTENT_W - 20) / 2;
  const IMG_SIZE = 160;

  for (let i = 0; i < products.length; i += 2) {
    doc.addPage();

    for (let col = 0; col < 2 && i + col < products.length; col++) {
      const p = products[i + col];
      const x = MARGIN + col * (COL_W + 20);
      let y = MARGIN + 10;

      // Image
      const imgBuf = imageMap.get(p._id);
      if (imgBuf) {
        doc.image(imgBuf, x + (COL_W - IMG_SIZE) / 2, y, { fit: [IMG_SIZE, IMG_SIZE] });
      } else {
        doc.rect(x + (COL_W - IMG_SIZE) / 2, y, IMG_SIZE, IMG_SIZE)
          .fillColor('#f1f5f9').fill();
        doc.fontSize(10).fillColor(MUTED)
          .text('No Image', x + (COL_W - IMG_SIZE) / 2, y + IMG_SIZE / 2 - 5, { width: IMG_SIZE, align: 'center' });
      }
      y += IMG_SIZE + 12;

      // Category badge
      const catLabel = TYPE_LABELS[p._type] || p._type;
      doc.fontSize(8).fillColor(PURPLE).font('Helvetica-Bold')
        .text(catLabel.toUpperCase(), x, y, { width: COL_W });
      y += 14;

      // Name
      doc.fontSize(12).fillColor(DARK).font('Helvetica-Bold')
        .text(truncate(p.name, 60), x, y, { width: COL_W });
      y = doc.y + 4;

      // Brand
      if (p.brand) {
        doc.fontSize(9).fillColor(MUTED).font('Helvetica')
          .text(p.brand, x, y, { width: COL_W });
        y = doc.y + 6;
      }

      // Pricing
      const { wholesale, retail } = getWholesale(p, discountPct, overrides);
      if (wholesale > 0) {
        doc.fontSize(16).fillColor(GREEN).font('Helvetica-Bold')
          .text(`TT$${wholesale.toLocaleString()}`, x, y, { width: COL_W, continued: false });
        y = doc.y;
        if (retail > 0 && retail !== wholesale) {
          doc.fontSize(9).fillColor(MUTED).font('Helvetica')
            .text(`Retail: TT$${retail.toLocaleString()}`, x, y, { width: COL_W });
          y = doc.y;
        }
      } else {
        doc.fontSize(11).fillColor(MUTED).font('Helvetica')
          .text('Price on request', x, y, { width: COL_W });
        y = doc.y;
      }
      y += 6;

      // Stock
      const stockColor = p.inStock ? GREEN : RED;
      const stockText = p.inStock
        ? `In Stock${p.stockQuantity ? ` (${p.stockQuantity} units)` : ''}`
        : 'Out of Stock';
      doc.fontSize(9).fillColor(stockColor).font('Helvetica')
        .text(stockText, x, y, { width: COL_W });
      y = doc.y + 8;

      // Key specs (first 4)
      const specs = collectSpecs(p).slice(0, 4);
      if (specs.length > 0) {
        for (const s of specs) {
          doc.fontSize(8).fillColor(MUTED).font('Helvetica-Bold')
            .text(`${s.label}: `, x, y, { width: COL_W, continued: true })
            .font('Helvetica').fillColor(DARK)
            .text(truncate(s.value, 40));
          y = doc.y + 1;
        }
      }
    }
  }
}

// ── List Layout (1 per page) ─────────────────────────────────────────────────

function renderListLayout(
  doc: PDFKit.PDFDocument,
  products: CatalogProduct[],
  imageMap: Map<string, Buffer | null>,
  discountPct: number,
  overrides: Record<string, number> | undefined,
  MARGIN: number, CONTENT_W: number, _PAGE_W: number, _PAGE_H: number,
) {
  const IMG_SIZE = 200;
  const TEXT_X = MARGIN + IMG_SIZE + 20;
  const TEXT_W = CONTENT_W - IMG_SIZE - 20;

  for (const p of products) {
    doc.addPage();
    let y = MARGIN + 10;

    // Image
    const imgBuf = imageMap.get(p._id);
    if (imgBuf) {
      doc.image(imgBuf, MARGIN, y, { fit: [IMG_SIZE, IMG_SIZE] });
    } else {
      doc.rect(MARGIN, y, IMG_SIZE, IMG_SIZE).fillColor('#f1f5f9').fill();
      doc.fontSize(10).fillColor(MUTED)
        .text('No Image', MARGIN, y + IMG_SIZE / 2 - 5, { width: IMG_SIZE, align: 'center' });
    }

    // Right side: text
    let ty = y;

    // Category badge
    const catLabel = TYPE_LABELS[p._type] || p._type;
    doc.fontSize(8).fillColor(PURPLE).font('Helvetica-Bold')
      .text(catLabel.toUpperCase(), TEXT_X, ty, { width: TEXT_W });
    ty = doc.y + 4;

    // Name
    doc.fontSize(16).fillColor(DARK).font('Helvetica-Bold')
      .text(p.name, TEXT_X, ty, { width: TEXT_W });
    ty = doc.y + 4;

    // Brand
    if (p.brand) {
      doc.fontSize(10).fillColor(MUTED).font('Helvetica')
        .text(p.brand, TEXT_X, ty, { width: TEXT_W });
      ty = doc.y + 8;
    }

    // Pricing
    const { wholesale, retail } = getWholesale(p, discountPct, overrides);
    if (wholesale > 0) {
      doc.fontSize(20).fillColor(GREEN).font('Helvetica-Bold')
        .text(`TT$${wholesale.toLocaleString()}`, TEXT_X, ty, { width: TEXT_W, continued: false });
      ty = doc.y;
      if (retail > 0 && retail !== wholesale) {
        doc.fontSize(10).fillColor(MUTED).font('Helvetica')
          .text(`Retail: TT$${retail.toLocaleString()}`, TEXT_X, ty, { width: TEXT_W });
        ty = doc.y;
      }
    } else {
      doc.fontSize(12).fillColor(MUTED).font('Helvetica')
        .text('Price on request', TEXT_X, ty, { width: TEXT_W });
      ty = doc.y;
    }
    ty += 8;

    // Stock
    const stockColor = p.inStock ? GREEN : RED;
    const stockText = p.inStock
      ? `In Stock${p.stockQuantity ? ` — ${p.stockQuantity} units available` : ''}`
      : 'Currently Out of Stock';
    doc.fontSize(10).fillColor(stockColor).font('Helvetica-Bold')
      .text(stockText, TEXT_X, ty, { width: TEXT_W });
    ty = doc.y + 12;

    // Specs
    const specs = collectSpecs(p);
    if (specs.length > 0) {
      doc.fontSize(11).fillColor(PURPLE).font('Helvetica-Bold')
        .text('Specifications', TEXT_X, ty, { width: TEXT_W });
      ty = doc.y + 4;
      doc.moveTo(TEXT_X, ty).lineTo(TEXT_X + TEXT_W, ty).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      ty += 6;

      for (const s of specs) {
        doc.fontSize(9).fillColor(MUTED).font('Helvetica-Bold')
          .text(`${s.label}: `, TEXT_X, ty, { width: TEXT_W, continued: true })
          .font('Helvetica').fillColor(DARK)
          .text(s.value);
        ty = doc.y + 2;
      }
      ty += 6;
    }

    // Below the image area — full-width content
    const belowImage = Math.max(y + IMG_SIZE + 16, ty + 10);

    // Description
    if (p.description) {
      doc.fontSize(11).fillColor(PURPLE).font('Helvetica-Bold')
        .text('Description', MARGIN, belowImage, { width: CONTENT_W });
      doc.moveDown(0.3);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor(DARK).font('Helvetica')
        .text(truncate(p.description, 600), MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
    }

    // Details
    if (p.details) {
      doc.moveDown(1);
      doc.fontSize(11).fillColor(PURPLE).font('Helvetica-Bold')
        .text('Details', MARGIN, doc.y, { width: CONTENT_W });
      doc.moveDown(0.3);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor(DARK).font('Helvetica')
        .text(truncate(p.details, 800), MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
    }
  }
}
