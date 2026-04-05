import type { ScrapedData, Pricing } from './product-processor';

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 3) + '...' : s;
}

function buildDescription(data: ScrapedData): string {
  const specs = data.specifications || {};
  let d = `${data.name}\n\n`;
  if (specs.battery)      d += `🔋 Battery: ${specs.battery}\n`;
  if (specs.ramRom)       d += `💾 Memory: ${specs.ramRom}\n`;
  if (specs.displaySize)  d += `📱 Display: ${specs.displaySize}\n`;
  if (specs.cpu)          d += `⚡ Processor: ${specs.cpu}\n`;
  if (specs.rearCamera)   d += `📸 Camera: ${specs.rearCamera}\n`;
  if (specs.waterproof)   d += `💧 Protection: ${specs.waterproof}\n`;
  d += `\n✅ Authentic product\n🚚 Ships to Trinidad & Caribbean\n🛡️ Full warranty\n💳 PayPal & USDT\n\nWhatsApp: +1 (868) 366-1212\nwww.ruggtech.com`;
  return d;
}

export async function pushToMetaCatalog(
  data: ScrapedData,
  pricing: Pricing | null,
  slug: string,
  imageUrl?: string | null,
): Promise<unknown> {
  const catalogId  = process.env.META_CATALOG_ID;
  const token      = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!catalogId || !token) return null;

  const body = JSON.stringify({
    retailer_id: slug,
    name: truncate(data.name, 150),
    description: truncate(buildDescription(data), 5000),
    availability: 'in stock',
    condition: 'new',
    price: `${(pricing?.sellingPriceTtd || 0) * 100}`,
    currency: 'TTD',
    url: `https://ruggtech.com/products/${slug}`,
    brand: data.brand || 'RUGGTECH',
    category: 'Electronics',
    ...(imageUrl ? { image_url: imageUrl } : {}),
  });

  const res = await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.warn('Meta Catalog push failed:', err);
    return null;
  }
  return res.json();
}
