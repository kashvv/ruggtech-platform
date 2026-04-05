import { sanity, ALL_TYPES } from '@/lib/sanity';
import {
  generateKeywords, generateDetails, generateSlug,
  generateSeoTitle, generateSeoDescription, generateMarketingContent,
  buildSpecsFromScraped,
} from '@/lib/product-processor';
import type { ScrapedData, Specs } from '@/lib/product-processor';

// Streams NDJSON — one JSON line per product as it's processed.
// Each line is one of:
//   { type: 'total', total: number }
//   { type: 'progress', index: number, id: string, name: string, status: 'updated'|'skipped'|'error', fields?: string[], error?: string }
//   { type: 'done', updated: number, skipped: number, errors: number }

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      }

      try {
        const docs = await sanity.fetch(
          `*[_type in $types] | order(_updatedAt asc) {
            _id, _type, name, brand, price, details, description,
            keywoards, seoTitle, seoDescription, originalPrice,
            inStock, stockQuantity, warranty, featured, slug,
            specifications, display, battery, camera, ram, storage, os, processor,
            connectivity, waterResistance, batteryLife,
            partNumber, compatibility, oem, installationDifficulty, material, location,
            marketingHeadline, marketingCaption, marketingHashtags
          }`,
          { types: [...ALL_TYPES] }
        );

        send({ type: 'total', total: docs.length });

        let updated = 0, skipped = 0, errors = 0;

        for (let i = 0; i < docs.length; i++) {
          const doc = docs[i];
          try {
            const patch: Record<string, unknown> = {};
            const patchedFields: string[] = [];

            const specs: Specs = {
              ...(doc.specifications || {}),
              cpu:         doc.specifications?.cpu         || doc.processor  || '',
              gpu:         doc.specifications?.gpu         || '',
              ramRom:      doc.specifications?.ramRom      || (doc.ram && doc.storage ? `${doc.ram} + ${doc.storage}` : doc.ram || ''),
              os:          doc.specifications?.os          || doc.os          || '',
              displaySize: doc.specifications?.displaySize || doc.display     || '',
              rearCamera:  doc.specifications?.rearCamera  || doc.camera      || '',
              battery:     doc.specifications?.battery     || doc.battery     || '',
              network:     doc.specifications?.network     || '',
              waterproof:  doc.specifications?.waterproof  || doc.waterResistance || '',
              bluetooth:   doc.specifications?.bluetooth   || doc.connectivity    || '',
            };

            const fakeScraped: ScrapedData = {
              sourceUrl: '',
              name:        doc.name  || '',
              brand:       doc.brand || '',
              price:       null,
              currency:    'USD',
              description: doc.description || doc.details || '',
              specifications: (doc.specifications as Record<string, string>) || {},
              images: [], keyFeatures: [], boxContents: [],
            };

            const schema = doc._type;

            // ── phone / product spec fields ──────────────────────────────
            if (schema === 'phone' || schema === 'product') {
              if (!doc.specifications || Object.keys(doc.specifications).length === 0) {
                const built = buildSpecsFromScraped(fakeScraped, schema);
                const sanitized: Record<string, string> = {};
                Object.entries({ ...specs, ...built }).forEach(([k, v]) => {
                  if (typeof v === 'string' && v) sanitized[k] = v;
                });
                if (Object.keys(sanitized).length > 0) { patch.specifications = sanitized; patchedFields.push('specs'); }
              }
              const parts = (specs.ramRom as string || '').split(/[+\/]/);
              if (!doc.display   && specs.displaySize)                      { patch.display    = specs.displaySize;   patchedFields.push('display'); }
              if (!doc.battery   && specs.battery)                          { patch.battery    = specs.battery;       patchedFields.push('battery'); }
              if (!doc.camera    && (specs.rearCamera || specs.frontCamera)){ patch.camera     = specs.rearCamera || specs.frontCamera; patchedFields.push('camera'); }
              if (!doc.ram       && parts[0]?.trim())                       { patch.ram        = parts[0].trim();     patchedFields.push('ram'); }
              if (!doc.storage   && parts[1]?.trim())                       { patch.storage    = parts[1].trim();     patchedFields.push('storage'); }
              if (!doc.os        && specs.os)                               { patch.os         = specs.os;            patchedFields.push('os'); }
              if (!doc.processor && specs.cpu)                              { patch.processor  = specs.cpu;           patchedFields.push('processor'); }
            }

            // ── watch / headset ──────────────────────────────────────────
            if ((schema === 'watch' || schema === 'product2') && !doc.batteryLife && specs.battery) {
              patch.batteryLife     = specs.battery;
              patch.connectivity    = specs.bluetooth || specs.network || '';
              patch.waterResistance = specs.waterproof || '';
              patchedFields.push('battery', 'connectivity');
            }

            // ── car ──────────────────────────────────────────────────────
            if (schema === 'car') {
              if (!doc.oem)                    { patch.oem = 'Yes';                   patchedFields.push('oem'); }
              if (!doc.installationDifficulty) { patch.installationDifficulty = 'Medium'; patchedFields.push('difficulty'); }
              if (!doc.location)               { patch.location = 'Worldwide Shipping'; patchedFields.push('location'); }
            }

            // ── core defaults ────────────────────────────────────────────
            if (doc.inStock == null)    { patch.inStock = true;        patchedFields.push('stock'); }
            if (doc.featured == null)   { patch.featured = false;      patchedFields.push('featured'); }
            if (!doc.stockQuantity)     { patch.stockQuantity = 10;    patchedFields.push('qty'); }
            if (!doc.warranty)          { patch.warranty = '1 Year';   patchedFields.push('warranty'); }
            if (!doc.originalPrice && doc.price) {
              patch.originalPrice = Math.round(doc.price * 1.15);
              patchedFields.push('originalPrice');
            }
            if (!doc.slug?.current && doc.name) {
              patch.slug = { _type: 'slug', current: generateSlug(doc.name) };
              patchedFields.push('slug');
            }

            // ── keywords ────────────────────────────────────────────────
            if (!doc.keywoards || (Array.isArray(doc.keywoards) && doc.keywoards.length < 10)) {
              patch.keywoards = generateKeywords(fakeScraped, specs);
              patchedFields.push('keywords');
            }

            // ── SEO ──────────────────────────────────────────────────────
            if (!doc.seoTitle)       { patch.seoTitle       = generateSeoTitle(fakeScraped);              patchedFields.push('seoTitle'); }
            if (!doc.seoDescription) { patch.seoDescription = generateSeoDescription(fakeScraped, specs); patchedFields.push('seoDesc'); }

            // ── details ──────────────────────────────────────────────────
            if (!doc.details || doc.details.length < 50) {
              patch.details = generateDetails(fakeScraped, specs);
              patchedFields.push('details');
            }

            // ── marketing ────────────────────────────────────────────────
            if (!doc.marketingCaption || !doc.marketingHeadline) {
              const mkt = generateMarketingContent(fakeScraped, specs, null);
              patch.marketingHeadline = mkt.headline;
              patch.marketingCaption  = mkt.description;
              patch.marketingHashtags = mkt.hashtags;
              patchedFields.push('marketing');
            }

            if (Object.keys(patch).length === 0) {
              skipped++;
              send({ type: 'progress', index: i, id: doc._id, name: doc.name || doc._id, status: 'skipped' });
              continue;
            }

            await sanity.patch(doc._id).set(patch).commit();
            updated++;
            send({ type: 'progress', index: i, id: doc._id, name: doc.name || doc._id, status: 'updated', fields: patchedFields });

          } catch (err) {
            errors++;
            send({ type: 'progress', index: i, id: doc._id, name: doc.name || doc._id, status: 'error', error: (err as Error).message });
          }
        }

        send({ type: 'done', updated, skipped, errors });
      } catch (err) {
        send({ type: 'error', error: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}
