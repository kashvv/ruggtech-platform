import { createClient } from '@sanity/client';

export const PROJECT_ID = process.env.SANITY_PROJECT_ID || 'pb8lzqs5';
export const DATASET    = process.env.SANITY_DATASET    || 'production';

export const sanity = createClient({
  projectId: PROJECT_ID,
  dataset:   DATASET,
  token:     process.env.SANITY_API_TOKEN || '',
  apiVersion: '2024-01-01',
  useCdn:    false,
});

export const ALL_TYPES = [
  'product','phone','car','agritechPage','offgrid',
  'electronic','product2','phoneacc','watch',
] as const;

export type SchemaType = typeof ALL_TYPES[number];

export const TYPE_LABELS: Record<SchemaType, string> = {
  product:      'Rugged Device',
  phone:        'Phone',
  car:          'Car Part',
  agritechPage: 'AgriTech',
  offgrid:      'Off-Grid',
  electronic:   'Electronic',
  product2:     'Headset',
  phoneacc:     'Accessory',
  watch:        'Watch',
};

export function assetRefToUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const cleaned = ref.replace(/^image-/, '').replace(/-([a-zA-Z0-9]+)$/, '.$1');
  return `https://cdn.sanity.io/images/${PROJECT_ID}/${DATASET}/${cleaned}`;
}
