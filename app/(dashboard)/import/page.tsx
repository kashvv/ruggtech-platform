'use client';
import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/Toast';

// ── Types ──────────────────────────────────────────────────────────────────
interface Pricing { supplierCostUsd: number; markupPercent: number; sellingPriceUsd: number; sellingPriceTtd: number; profitUsd: number; profitTtd: number; }
interface Specs { cpu?: string; gpu?: string; ramRom?: string; os?: string; displaySize?: string; resolution?: string; frontCamera?: string; rearCamera?: string; battery?: string; network?: string; sim?: string; nfc?: string; waterproof?: string; sensors?: string; biometrics?: string; dimensions?: string; weight?: string; partNumber?: string; compatibility?: string; material?: string; oem?: string; installationDifficulty?: string; [k: string]: string | string[] | undefined; }
interface Marketing { headline: string; description: string; hashtags: string[]; }
interface PreviewData { sessionId: string; name: string; brand: string; schemaType: string; category: string; slug: string; sourceUrl: string; pricing: Pricing | null; isDuplicate: boolean; seoTitle: string; seoDesc: string; details: string; specs: Specs; keywords: string[]; totalKeywords: number; images: string[]; imageCount: number; downloadedCount: number; marketing?: Marketing; }
interface AppConfig { hasRembg: boolean; hasSharp: boolean; hasWatermark: boolean; defaultMarkup: number; }

const SCHEMA_OPTIONS = [
  { value: 'product', label: 'Rugged Device' }, { value: 'phone', label: 'Phone' },
  { value: 'car', label: 'Car Part' }, { value: 'agritechPage', label: 'AgriTech' },
  { value: 'offgrid', label: 'Off-Grid' }, { value: 'electronic', label: 'Electronic' },
  { value: 'product2', label: 'Headset' }, { value: 'phoneacc', label: 'Accessory' },
  { value: 'watch', label: 'Watch' },
];

const BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  product: { bg: '#4c1d95', color: '#c4b5fd' }, phone: { bg: '#1e3a5f', color: '#93c5fd' },
  car: { bg: '#431407', color: '#fdba74' }, agritechPage: { bg: '#14532d', color: '#86efac' },
  offgrid: { bg: '#134e4a', color: '#5eead4' }, electronic: { bg: '#083344', color: '#67e8f9' },
  product2: { bg: '#500724', color: '#fda4af' }, phoneacc: { bg: '#422006', color: '#fde68a' },
  watch: { bg: '#1e1b4b', color: '#a5b4fc' },
};

const SPEC_FIELDS: [string, string][] = [
  ['cpu','CPU'], ['gpu','GPU'], ['ramRom','RAM / ROM'], ['os','OS'],
  ['displaySize','Display'], ['resolution','Resolution'],
  ['frontCamera','Front Camera'], ['rearCamera','Rear Camera'],
  ['battery','Battery'], ['network','Network'], ['sim','SIM'],
  ['nfc','NFC'], ['waterproof','Waterproof'], ['sensors','Sensors'],
  ['biometrics','Biometrics'], ['dimensions','Dimensions'], ['weight','Weight'],
];

function inp(style?: React.CSSProperties): React.CSSProperties {
  return { background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-base)', fontSize: '14px', padding: '9px 12px', width: '100%', outline: 'none', minHeight: '44px', ...style };
}

function label(text: string) {
  return <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: '5px' }}>{text}</label>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-dim)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {title}
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>
      {children}
    </div>
  );
}

export default function ImportPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [url, setUrl] = useState('');
  const [markup, setMarkup] = useState('35');
  const [scraping, setScraping] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editSchema, setEditSchema] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editSpecs, setEditSpecs] = useState<Specs>({});
  const [removedImages, setRemovedImages] = useState<number[]>([]);
  const [bgIndexes, setBgIndexes] = useState<number[]>([]);
  const [wmIndexes, setWmIndexes] = useState<number[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [pricing, setPricing] = useState<Pricing | null>(null);

  const [pushing, setPushing] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'images' | 'seo' | 'specs' | 'marketing'>('overview');
  const [copiedMarketing, setCopiedMarketing] = useState(false);
  const [editedCaption, setEditedCaption] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const previewRef = useRef<PreviewData | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setConfig).catch(() => {});
  }, []);

  useEffect(() => { previewRef.current = preview; }, [preview]);

  async function patch(action: string, value: string) {
    const current = previewRef.current;
    if (!current) return;
    const res = await fetch(`/api/import/${current.sessionId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, value }),
    });
    if (!res.ok) { const d = await res.json(); toast(d.error || 'Update failed', 'error'); return; }
    const d = await res.json();
    if (d.pricing) setPricing(d.pricing);
  }

  async function handleScrape() {
    if (!url.trim()) { toast('Please enter a URL', 'warning'); return; }
    setScraping(true);
    setPreview(null);
    setProgress({ pct: 5, label: 'Connecting to supplier…' });
    const steps: [number, number, string][] = [
      [800,  20, 'Fetching product page…'],
      [2200, 45, 'Extracting product data…'],
      [4000, 65, 'Building specs & pricing…'],
      [5500, 80, 'Downloading images…'],
    ];
    const timers = steps.map(([delay, pct, label]) =>
      setTimeout(() => setProgress({ pct, label }), delay)
    );
    try {
      const res = await fetch('/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), markup }),
      });
      timers.forEach(clearTimeout);
      setProgress({ pct: 95, label: 'Finishing up…' });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Scrape failed', 'error'); return; }
      setProgress({ pct: 100, label: 'Done!' });
      setTimeout(() => setProgress(null), 600);
      setPreview(data);
      setEditName(data.name);
      setEditBrand(data.brand);
      setEditSchema(data.schemaType);
      setEditPrice(String(data.pricing?.sellingPriceTtd || ''));
      setEditDetails(data.details);
      setEditSpecs(data.specs || {});
      setRemovedImages([]);
      setBgIndexes([]);
      setWmIndexes([]);
      setCustomTags([]);
      setPricing(data.pricing);
      setActiveTab('overview');
      setEditedCaption(null);
      if (data.isDuplicate) toast('Possible duplicate detected — review before pushing', 'warning', 6000);
    } catch (err: unknown) {
      timers.forEach(clearTimeout);
      setProgress(null);
      toast((err as Error).message, 'error');
    } finally {
      setScraping(false);
    }
  }

  function debounceField(action: string, value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => patch(action, value), 600);
  }

  async function handlePush() {
    if (!preview) return;
    if (!pricing && !editPrice) { toast('Set a price before pushing', 'warning'); return; }
    setPushing(true);
    const hasBg = bgIndexes.length > 0;
    const pushSteps: [number, number, string][] = [
      [300,  10, 'Starting publish…'],
      [1000, hasBg ? 25 : 35, hasBg ? 'Removing backgrounds…' : 'Processing images…'],
      [hasBg ? 8000 : 3000, 55, 'Applying watermarks…'],
      [hasBg ? 14000 : 6000, 75, 'Uploading to Sanity…'],
    ];
    setProgress({ pct: 5, label: 'Preparing…' });
    const timers = pushSteps.map(([delay, pct, label]) =>
      setTimeout(() => setProgress({ pct, label }), delay)
    );
    try {
      const res = await fetch(`/api/import/${previewRef.current?.sessionId}/push`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bgRemoveIndexes: bgIndexes, watermarkIndexes: wmIndexes, editedCaption }),
      });
      timers.forEach(clearTimeout);
      setProgress({ pct: 95, label: 'Saving to catalog…' });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Push failed', 'error'); return; }
      setProgress({ pct: 100, label: 'Published!' });
      setTimeout(() => setProgress(null), 800);
      toast(`✓ Published! TT$${data.price.toLocaleString()} — ${data.imagesUploaded} image${data.imagesUploaded !== 1 ? 's' : ''}`, 'success', 6000);
      if (data.metaSuccess) toast('WhatsApp Catalog updated', 'success');
      setPreview(null);
      setUrl('');
    } catch (err: unknown) {
      timers.forEach(clearTimeout);
      setProgress(null);
      toast((err as Error).message, 'error');
    } finally {
      setPushing(false);
    }
  }

  function toggleRemove(i: number) {
    const next = removedImages.includes(i) ? removedImages.filter(x => x !== i) : [...removedImages, i];
    setRemovedImages(next);
    patch(removedImages.includes(i) ? 'restore_image' : 'remove_image', String(i));
  }

  function toggleBg(i: number) { setBgIndexes(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]); }
  function toggleWm(i: number) { setWmIndexes(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]); }

  async function addTag() {
    if (!customTag.trim()) return;
    const tags = customTag.split(',').map(t => t.trim()).filter(Boolean);
    setCustomTags(p => [...new Set([...p, ...tags])]);
    await patch('add_tags', tags.join(','));
    setCustomTag('');
  }

  function removeTag(t: string) {
    setCustomTags(p => p.filter(x => x !== t));
    patch('remove_tag', t);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const badge = preview ? BADGE_COLORS[preview.schemaType] || BADGE_COLORS.electronic : null;
  const activeImages = preview ? preview.images.filter((_, i) => !removedImages.includes(i)) : [];

  return (
    <div className="flex h-full flex-col overflow-hidden [&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11 [&_textarea]:min-h-24">
      {/* Header */}
      <div style={{ padding: isMobile ? '8px 12px' : '0 28px', minHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: '10px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div>
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-base)' }}>Import Product</span>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginLeft: isMobile ? 0 : '10px', display: 'block' }}>Paste a supplier URL to import</span>
        </div>
        {config && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Chip label="BG Removal" active={config.hasRembg} />
            <Chip label="Watermark" active={config.hasSharp && config.hasWatermark} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Left: URL input + preview form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 12px 24px' : '24px 28px' }}>
          {/* URL Bar */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', marginBottom: '20px' }}>
            <input
              type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://sunsky-online.com/product/... or any supplier URL"
              onKeyDown={e => e.key === 'Enter' && handleScrape()}
              style={{ ...inp(), flex: 1, fontSize: '14px', padding: '11px 16px' }}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--brand)'}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
            />
            <input
              type="number" value={markup} onChange={e => setMarkup(e.target.value)}
              min={0} max={500} step={1}
              className="w-full md:w-28"
              style={{ ...inp(), textAlign: 'center' }}
              title="Markup %"
              placeholder="Markup %"
            />
            <button onClick={handleScrape} disabled={scraping} style={{
              padding: '11px 24px', background: scraping ? '#4a2b8a' : 'var(--brand)',
              border: 'none', borderRadius: '9px', color: '#fff', fontWeight: 700,
              fontSize: '14px', cursor: scraping ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, width: isMobile ? '100%' : 'auto', justifyContent: 'center',
            }}>
              {scraping ? <><Spin />Scraping…</> : 'Scrape'}
            </button>
          </div>

          {!preview && !scraping && (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>↓</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                Paste a product URL above
              </div>
              <div style={{ fontSize: '13px' }}>
                Supports Sunsky, HOTWAV, AliExpress, eBay, Amazon, and generic sites
              </div>
            </div>
          )}

          {scraping && progress && (
            <div style={{ padding: '60px 20px 80px' }}>
              <div style={{ maxWidth: '480px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{progress.label}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{progress.pct}%</span>
                </div>
                <div style={{ height: '6px', background: 'var(--bg-raised)', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '99px',
                    background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                    width: `${progress.pct}%`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            </div>
          )}

          {preview && (
            <>
              {/* Duplicate warning */}
              {preview.isDuplicate && (
                <div style={{ background: '#1a1000', border: '1px solid var(--warning)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: 'var(--warning)', fontSize: '16px' }}>⚠</span>
                  <span style={{ color: '#fbbf24', fontSize: '13px' }}>Possible duplicate — a product with this slug may already exist in Sanity.</span>
                </div>
              )}

              {/* Tabs */}
              <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
                {(['overview','images','seo','specs','marketing'] as const).map(t => (
                  <button key={t} onClick={() => setActiveTab(t)} style={{
                    padding: '10px 16px', background: 'transparent', border: 'none',
                    borderBottom: activeTab === t ? '2px solid var(--brand)' : '2px solid transparent',
                    color: activeTab === t ? (t === 'marketing' ? '#4ade80' : '#a78bfa') : 'var(--text-muted)',
                    fontSize: isMobile ? '14px' : '13px', fontWeight: activeTab === t ? 600 : 400,
                    cursor: 'pointer', textTransform: 'capitalize', marginBottom: '-1px', whiteSpace: 'nowrap',
                  }}>{t === 'marketing' ? '🚀 Marketing' : t}</button>
                ))}
              </div>

              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <>
                  <Section title="Product Info">
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
                      <div style={{ gridColumn: isMobile ? 'auto' : 'span 2' }}>
                        {label('Product Name')}
                        <input style={inp()} value={editName}
                          onChange={e => { setEditName(e.target.value); debounceField('set_name', e.target.value); }}
                          onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--brand)'}
                          onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
                        />
                      </div>
                      <div>
                        {label('Brand')}
                        <input style={inp()} value={editBrand}
                          onChange={e => { setEditBrand(e.target.value); debounceField('set_brand', e.target.value); }}
                          onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--brand)'}
                          onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
                        />
                      </div>
                      <div>
                        {label('Schema Type')}
                        <select value={editSchema} onChange={e => { setEditSchema(e.target.value); patch('set_schema', e.target.value); }} style={{ ...inp(), cursor: 'pointer' }}>
                          {SCHEMA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </Section>

                  <Section title="Pricing">
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '14px' }}>
                      <div>
                        {label('Price (TTD)')}
                        <input type="number" style={inp()} value={editPrice}
                          onChange={e => { setEditPrice(e.target.value); debounceField('set_price', e.target.value); }}
                          onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--brand)'}
                          onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
                        />
                      </div>
                      <div>
                        {label('Supplier Cost')}
                        <div style={{ ...inp(), color: 'var(--text-muted)', cursor: 'default' }}>
                          {pricing ? `US$${pricing.supplierCostUsd.toFixed(2)}` : '—'}
                        </div>
                      </div>
                      <div>
                        {label('Profit (TTD)')}
                        <div style={{ ...inp(), color: pricing?.profitTtd ? '#4ade80' : 'var(--text-muted)', cursor: 'default' }}>
                          {pricing ? `TT$${pricing.profitTtd.toFixed(2)}` : '—'}
                        </div>
                      </div>
                    </div>
                  </Section>

                  <Section title="Description">
                    <textarea value={editDetails} rows={8}
                      onChange={e => { setEditDetails(e.target.value); debounceField('set_details', e.target.value); }}
                      onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = 'var(--brand)'}
                      onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = 'var(--border)'}
                      style={{ ...inp(), resize: 'vertical', lineHeight: 1.6, minHeight: '160px' }}
                    />
                  </Section>

                  <Section title="Custom Tags">
                    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px', marginBottom: '12px' }}>
                        <input style={{ ...inp(), flex: 1 }} value={customTag}
                        onChange={e => setCustomTag(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addTag()}
                        placeholder="Add tags (comma-separated, press Enter)"
                        onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--brand)'}
                        onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
                      />
                      <button onClick={addTag} style={{ padding: '9px 16px', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-base)', cursor: 'pointer', fontSize: '13px', width: isMobile ? '100%' : 'auto' }}>Add</button>
                    </div>
                    {customTags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {customTags.map(t => (
                          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px 3px 12px', background: 'var(--brand-glow)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '100px', fontSize: '12px', color: '#a78bfa' }}>
                            {t}
                            <button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', padding: '0', lineHeight: 1, fontSize: '14px' }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </Section>
                </>
              )}

              {/* Images Tab */}
              {activeTab === 'images' && (
                <>
                  {config && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                      <div style={{ padding: '8px 14px', background: 'var(--bg-raised)', borderRadius: '8px', fontSize: '12px', color: config.hasRembg ? '#4ade80' : 'var(--text-dim)', border: `1px solid ${config.hasRembg ? '#166534' : 'var(--border)'}` }}>
                        {config.hasRembg ? '✓' : '✗'} Background Removal
                      </div>
                      <div style={{ padding: '8px 14px', background: 'var(--bg-raised)', borderRadius: '8px', fontSize: '12px', color: config.hasSharp && config.hasWatermark ? '#4ade80' : 'var(--text-dim)', border: `1px solid ${config.hasSharp && config.hasWatermark ? '#166534' : 'var(--border)'}` }}>
                        {config.hasSharp && config.hasWatermark ? '✓' : '✗'} Watermark
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '8px 0', marginLeft: '4px' }}>
                        {preview.downloadedCount}/{preview.imageCount} images downloaded
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(140px, 1fr))' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
                    {preview.images.map((imgUrl, i) => {
                      const removed = removedImages.includes(i);
                      const hasBg = bgIndexes.includes(i);
                      const hasWm = wmIndexes.includes(i);
                      return (
                        <div key={i} style={{
                          background: 'var(--bg-raised)', border: `1px solid ${removed ? 'var(--error)' : 'var(--border)'}`,
                          borderRadius: '12px', overflow: 'hidden', opacity: removed ? 0.4 : 1,
                          transition: 'all 0.15s',
                        }}>
                          <div style={{ position: 'relative', aspectRatio: '1', cursor: 'pointer' }}
                            onClick={() => !removed && setLightbox(imgUrl)}>
                            <img src={imgUrl} alt={`Image ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.7)', borderRadius: '5px', padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: '#fff' }}>
                              {i + 1}
                            </div>
                          </div>
                          <div style={{ padding: '10px' }}>
                            {/* Remove toggle */}
                            <button onClick={() => toggleRemove(i)} style={{
                              width: '100%', padding: '6px', marginBottom: '6px',
                              background: removed ? '#2d1010' : 'var(--bg-hover)',
                              border: `1px solid ${removed ? 'var(--error)' : 'var(--border)'}`,
                              borderRadius: '6px', color: removed ? '#f87171' : 'var(--text-muted)',
                              fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                            }}>
                              {removed ? 'Restore' : 'Remove'}
                            </button>
                            {!removed && (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {config?.hasRembg && (
                                  <button onClick={() => toggleBg(i)} style={{
                                    flex: 1, padding: '5px', fontSize: '11px', fontWeight: 600,
                                    background: hasBg ? '#071a0e' : 'var(--bg-hover)',
                                    border: `1px solid ${hasBg ? '#22c55e' : 'var(--border)'}`,
                                    borderRadius: '6px', color: hasBg ? '#4ade80' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                  }}>BG</button>
                                )}
                                {config?.hasSharp && config?.hasWatermark && (
                                  <button onClick={() => toggleWm(i)} style={{
                                    flex: 1, padding: '5px', fontSize: '11px', fontWeight: 600,
                                    background: hasWm ? '#0f0f1a' : 'var(--bg-hover)',
                                    border: `1px solid ${hasWm ? 'var(--brand)' : 'var(--border)'}`,
                                    borderRadius: '6px', color: hasWm ? '#a78bfa' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                  }}>WM</button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--bg-raised)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {activeImages.length} of {preview.images.length} active • {bgIndexes.length} BG removal • {wmIndexes.length} watermark
                  </div>
                </>
              )}

              {/* SEO Tab */}
              {activeTab === 'seo' && (
                <>
                  <Section title="SEO Preview">
                    <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '16px', color: '#93c5fd', marginBottom: '4px', fontWeight: 600 }}>{preview.seoTitle}</div>
                      <div style={{ fontSize: '12px', color: '#4ade80', marginBottom: '6px' }}>ruggtech.com/products/{preview.slug}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{preview.seoDesc}</div>
                    </div>
                  </Section>
                  <Section title="Keywords">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {[...preview.keywords, ...customTags].map((kw, i) => (
                        <span key={i} style={{ padding: '2px 10px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '100px', fontSize: '11px', color: 'var(--text-muted)' }}>{kw}</span>
                      ))}
                      {preview.totalKeywords > preview.keywords.length && (
                        <span style={{ padding: '2px 10px', background: 'var(--bg-raised)', borderRadius: '100px', fontSize: '11px', color: 'var(--text-dim)' }}>+{preview.totalKeywords - preview.keywords.length} more</span>
                      )}
                    </div>
                  </Section>
                </>
              )}

              {/* Specs Tab */}
              {activeTab === 'specs' && (
                <Section title="Specifications">
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                    {(preview.schemaType === 'phone' || preview.schemaType === 'product' ? SPEC_FIELDS : [
                      ['partNumber','Part Number'], ['compatibility','Compatibility'],
                      ['material','Material'], ['oem','OEM'], ['installationDifficulty','Install Difficulty'],
                    ] as [string,string][]).map(([key, lbl]) => (
                      <div key={key}>
                        {label(lbl)}
                        <input style={inp()} value={String(editSpecs[key] || '')}
                          onChange={e => {
                            const next = { ...editSpecs, [key]: e.target.value };
                            setEditSpecs(next);
                            debounceField('set_spec', JSON.stringify({ key, val: e.target.value }));
                          }}
                          onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--brand)'}
                          onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
                          placeholder="—"
                        />
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {activeTab === 'marketing' && preview.marketing && (() => {
                const m = preview.marketing!;
                const caption = editedCaption !== null ? editedCaption : m.description;
                const fullText = caption + '\n\n' + m.hashtags.join(' ');
                return (
                  <>
                    <Section title="Marketing Caption">
                      <div style={{ position: 'relative' }}>
                        <textarea
                          value={caption}
                          onChange={e => setEditedCaption(e.target.value)}
                          rows={18}
                          style={{
                            width: '100%', background: 'var(--bg-raised)',
                            border: '1px solid var(--border)', borderRadius: '10px',
                            padding: '16px', fontSize: '13px', color: 'var(--text-base)',
                            lineHeight: 1.7, fontFamily: 'inherit', resize: 'vertical',
                            outline: 'none', boxSizing: 'border-box',
                            transition: 'border-color 0.15s',
                          }}
                          onFocus={e => e.target.style.borderColor = 'var(--brand)'}
                          onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                          {editedCaption !== null && (
                            <button
                              onClick={() => setEditedCaption(null)}
                              style={{
                                padding: '5px 12px', background: 'transparent',
                                border: '1px solid var(--border)', borderRadius: '6px',
                                fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer',
                              }}>
                              Reset
                            </button>
                          )}
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(fullText);
                              setCopiedMarketing(true);
                              setTimeout(() => setCopiedMarketing(false), 2000);
                            }}
                            style={{
                              padding: '5px 14px',
                              background: copiedMarketing ? 'rgba(34,197,94,0.15)' : 'var(--brand-glow)',
                              border: `1px solid ${copiedMarketing ? '#22c55e' : 'rgba(124,58,237,0.4)'}`,
                              borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                              color: copiedMarketing ? '#4ade80' : '#a78bfa', cursor: 'pointer',
                            }}>
                            {copiedMarketing ? '✓ Copied!' : 'Copy Caption + Tags'}
                          </button>
                        </div>
                      </div>
                    </Section>

                    <Section title="Hashtags">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {m.hashtags.map(tag => (
                          <span key={tag} style={{
                            padding: '4px 10px', borderRadius: '20px', fontSize: '12px',
                            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                            color: '#4ade80', cursor: 'pointer',
                          }}
                            onClick={() => navigator.clipboard.writeText(tag)}
                            title="Click to copy"
                          >{tag}</span>
                        ))}
                      </div>
                      <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-dim)' }}>
                        Click any hashtag to copy individually · {m.hashtags.length} tags total
                      </div>
                    </Section>

                    <Section title="Quick Preview">
                      <div style={{
                        background: '#0f0f0f', border: '1px solid #2a2a2a',
                        borderRadius: '12px', padding: '16px', fontSize: '12px',
                        color: '#e5e5e5', lineHeight: 1.6,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#fff' }}>RT</div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '13px' }}>RUGGTECH</div>
                            <div style={{ color: '#888', fontSize: '11px' }}>@ruggtech.tt</div>
                          </div>
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{caption.substring(0, 300)}{caption.length > 300 ? '…' : ''}</div>
                        <div style={{ marginTop: '10px', color: '#1d9bf0', fontSize: '12px' }}>
                          {m.hashtags.slice(0, 5).join(' ')}
                        </div>
                      </div>
                    </Section>
                  </>
                );
              })()}
            </>
          )}
        </div>

        {/* Right: Summary + Push panel */}
        {preview && (
          <div style={{ width: isMobile ? '100%' : '300px', maxWidth: '100%', flexShrink: 0, borderLeft: isMobile ? 'none' : '1px solid var(--border)', borderTop: isMobile ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', maxHeight: isMobile ? '50vh' : 'none' }}>
            {/* Image strip */}
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {preview.images.map((imgUrl, i) => (
                  <div key={i} style={{
                    width: '60px', height: '60px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden',
                    border: removedImages.includes(i) ? '2px solid var(--error)' : bgIndexes.includes(i) || wmIndexes.includes(i) ? '2px solid var(--brand)' : '2px solid var(--border)',
                    opacity: removedImages.includes(i) ? 0.3 : 1, cursor: 'pointer',
                  }} onClick={() => setLightbox(imgUrl)}>
                    <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
              {badge && (
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, marginBottom: '12px', background: badge.bg, color: badge.color, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  {preview.category}
                </span>
              )}
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-base)', lineHeight: 1.3, marginBottom: '8px' }}>{editName}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>{editBrand} · {preview.slug}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                <SummaryRow label="Price" value={editPrice ? `TT$${Number(editPrice).toLocaleString()}` : '—'} accent />
                {pricing && <SummaryRow label="Profit" value={`TT$${pricing.profitTtd.toFixed(0)}`} green />}
                {pricing && <SummaryRow label="Markup" value={`${pricing.markupPercent}%`} />}
                <SummaryRow label="Images" value={`${activeImages.length} active${bgIndexes.length ? ` · ${bgIndexes.length} BG` : ''}${wmIndexes.length ? ` · ${wmIndexes.length} WM` : ''}`} />
                <SummaryRow label="Tags" value={`${preview.totalKeywords + customTags.length} keywords`} />
                {preview.isDuplicate && <SummaryRow label="Warning" value="Possible duplicate" warn />}
              </div>

              <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--text-dim)', wordBreak: 'break-all', display: 'block', marginBottom: '8px' }}>
                {preview.sourceUrl.length > 60 ? preview.sourceUrl.slice(0, 57) + '…' : preview.sourceUrl}
              </a>
            </div>

            {/* Push button */}
            <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
              {pushing && progress && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>{progress.label}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{progress.pct}%</span>
                  </div>
                  <div style={{ height: '5px', background: 'var(--bg-raised)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '99px',
                      background: 'linear-gradient(90deg, #7c3aed, #4ade80)',
                      width: `${progress.pct}%`,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              )}
              <button onClick={handlePush} disabled={pushing} style={{
                width: '100%', padding: '13px',
                background: pushing ? '#4a2b8a' : 'var(--brand)',
                border: 'none', borderRadius: '10px',
                color: '#fff', fontSize: '14px', fontWeight: 700,
                cursor: pushing ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'background 0.15s',
              }}>
                {pushing ? <><Spin />Publishing…</> : 'Publish to Sanity'}
              </button>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', marginTop: '8px' }}>
                Sanity CMS + WhatsApp Catalog
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <button onClick={() => setLightbox(null)} style={{
            position: 'absolute', top: '20px', right: '20px', width: '44px', height: '44px',
            background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '50%',
            color: 'var(--text-base)', fontSize: '20px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
          <img src={lightbox} alt="Lightbox" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px' }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ── Mini components ────────────────────────────────────────────────────────
function Spin({ size = 16 }: { size?: number }) {
  return <span style={{ width: size, height: size, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />;
}

function Chip({ label, active }: { label: string; active: boolean }) {
  return (
    <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: active ? '#071a0e' : 'var(--bg-raised)', border: `1px solid ${active ? '#166534' : 'var(--border)'}`, color: active ? '#4ade80' : 'var(--text-dim)' }}>
      {active ? '✓' : '✗'} {label}
    </span>
  );
}

function SummaryRow({ label: lbl, value, accent, green, warn }: { label: string; value: string; accent?: boolean; green?: boolean; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{lbl}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color: warn ? '#fbbf24' : green ? '#4ade80' : accent ? '#a78bfa' : 'var(--text-base)' }}>{value}</span>
    </div>
  );
}





