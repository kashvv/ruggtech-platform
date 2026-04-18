
'use client';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';

interface Pricing { supplierCostUsd: number; markupPercent: number; sellingPriceUsd: number; sellingPriceTtd: number; profitUsd: number; profitTtd: number; }
interface Specs { cpu?: string; gpu?: string; ramRom?: string; os?: string; displaySize?: string; resolution?: string; frontCamera?: string; rearCamera?: string; battery?: string; network?: string; sim?: string; nfc?: string; waterproof?: string; sensors?: string; biometrics?: string; dimensions?: string; weight?: string; partNumber?: string; compatibility?: string; material?: string; oem?: string; installationDifficulty?: string; [k: string]: string | string[] | undefined; }
interface Marketing { headline: string; description: string; hashtags: string[]; }
interface PreviewData { sessionId: string; name: string; brand: string; schemaType: string; category: string; slug: string; sourceUrl: string; pricing: Pricing | null; isDuplicate: boolean; seoTitle: string; seoDesc: string; details: string; specs: Specs; keywords: string[]; totalKeywords: number; images: string[]; imageCount: number; downloadedCount: number; marketing?: Marketing; scrapedPriceTTD?: number | null; scrapedPriceUSD?: number | null; }
interface AppConfig { hasRembg: boolean; hasSharp: boolean; hasWatermark: boolean; defaultMarkup: number; }

interface SearchProduct { id: string; name: string; url: string; image: string; price: number | null; brand: string; }

type QueueStatus = 'ready' | 'publishing' | 'done' | 'failed';
interface QueueItem {
  sessionId: string;
  preview: PreviewData;
  editName: string;
  editBrand: string;
  editSchema: string;
  editPrice: string;
  editDetails: string;
  editSpecs: Specs;
  removedImages: number[];
  bgIndexes: number[];
  wmIndexes: number[];
  customTags: string[];
  pricing: Pricing | null;
  editedCaption: string | null;
  status: QueueStatus;
}

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

const STATUS_STYLES: Record<QueueStatus, { bg: string; color: string; border: string }> = {
  ready: { bg: 'var(--bg-hover)', color: 'var(--text-muted)', border: 'var(--border)' },
  publishing: { bg: '#2b1f05', color: '#fbbf24', border: '#a16207' },
  done: { bg: '#071a0e', color: '#4ade80', border: '#166534' },
  failed: { bg: '#2d1010', color: '#f87171', border: '#991b1b' },
};

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

function applyPriceAdjust(price: number, add: number, round: number): number {
  if (!price || price <= 0) return price;
  let adjusted = price + add;
  if (round > 0) adjusted = Math.ceil(adjusted / round) * round;
  return adjusted;
}

function makeQueueItem(data: PreviewData, addAmount: number, roundTo: number, knownPriceTtd?: number | null): QueueItem {
  const rawPrice = data.pricing?.sellingPriceTtd || 0;
  // Fall back: scraped TTD price from API, then price known from browse results
  const fallbackTtd = data.scrapedPriceTTD || knownPriceTtd || 0;
  const basePrice = rawPrice > 0 ? rawPrice : fallbackTtd;
  const adjustedPrice = basePrice > 0 ? applyPriceAdjust(basePrice, addAmount, roundTo) : 0;
  // Inject knownPriceTtd into preview so the Cost: line on the bubble always shows
  const preview: PreviewData = (knownPriceTtd && !data.scrapedPriceTTD)
    ? { ...data, scrapedPriceTTD: knownPriceTtd }
    : data;
  return {
    sessionId: data.sessionId,
    preview,
    editName: data.name,
    editBrand: data.brand,
    editSchema: data.schemaType,
    editPrice: adjustedPrice > 0 ? String(adjustedPrice) : '',
    editDetails: data.details,
    editSpecs: data.specs || {},
    removedImages: [],
    bgIndexes: [],
    wmIndexes: [],
    customTags: [],
    pricing: data.pricing,
    editedCaption: null,
    status: 'ready',
  };
}

export default function ImportPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [url, setUrl] = useState('');
  const [markup, setMarkup] = useState('0');
  const [priceAdd, setPriceAdd] = useState('50');
  const [priceRound, setPriceRound] = useState('10');
  const [scraping, setScraping] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [customTag, setCustomTag] = useState('');
  const [pushing, setPushing] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'images' | 'seo' | 'specs' | 'marketing'>('overview');
  const [copiedMarketing, setCopiedMarketing] = useState(false);
  const [rewritingAI, setRewritingAI] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const queueRef = useRef<QueueItem[]>([]);

  const [showBgWmPrompt, setShowBgWmPrompt] = useState(false);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([]);
  const [searchBrands, setSearchBrands] = useState<Record<string, number>>({});
  const [searchBrand, setSearchBrand] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());

  // PartSouq lookup state
  const [showPartsouq, setShowPartsouq] = useState(false);
  const [psQuery, setPsQuery] = useState('');
  const [psResults, setPsResults] = useState<{ name: string; partNumber: string; brand: string; price: string; availability: string; imageUrl: string; url: string }[]>([]);
  const [psSearching, setPsSearching] = useState(false);
  const [psError, setPsError] = useState('');

  // Sunsky Accessories browse state
  const [showAccessories, setShowAccessories] = useState(false);
  const [accResults, setAccResults] = useState<(SearchProduct & { category: string })[]>([]);
  const [accCategories, setAccCategories] = useState<Record<string, number>>({});
  const [accBrands, setAccBrands] = useState<Record<string, number>>({});
  const [accCategory, setAccCategory] = useState('');
  const [accBrand, setAccBrand] = useState('');
  const [accModelFilter, setAccModelFilter] = useState('');
  const [accBrowsing, setAccBrowsing] = useState(false);
  const [accSelected, setAccSelected] = useState<Set<string>>(new Set());

  // GreenAge browse state
  const [showGreenAge, setShowGreenAge] = useState(false);
  const [greenAgeResults, setGreenAgeResults] = useState<(SearchProduct & { category: string })[]>([]);
  const [greenAgeCategories, setGreenAgeCategories] = useState<Record<string, number>>({});
  const [greenAgeCategory, setGreenAgeCategory] = useState('');
  const [greenAgeBrowsing, setGreenAgeBrowsing] = useState(false);
  const [greenAgeSelected, setGreenAgeSelected] = useState<Set<string>>(new Set());
  // Maps URL → { price, name } from browse results so queue bubbles show price immediately after scrape
  const browsePriceMap = useRef<Map<string, { price: number | null; name: string }>>(new Map());

  const activeItem = queue[activeIndex] || null;
  const preview = activeItem?.preview || null;
  const editName = activeItem?.editName || '';
  const editBrand = activeItem?.editBrand || '';
  const editSchema = activeItem?.editSchema || '';
  const editPrice = activeItem?.editPrice || '';
  const editDetails = activeItem?.editDetails || '';
  const editSpecs = activeItem?.editSpecs || {};
  const removedImages = activeItem?.removedImages || [];
  const bgIndexes = activeItem?.bgIndexes || [];
  const wmIndexes = activeItem?.wmIndexes || [];
  const customTags = activeItem?.customTags || [];
  const pricing = activeItem?.pricing || null;
  const editedCaption = activeItem?.editedCaption ?? null;

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeIndex > queue.length - 1) setActiveIndex(Math.max(0, queue.length - 1));
  }, [queue.length, activeIndex]);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { setCustomTag(''); }, [activeIndex]);

  async function handleSearch() {
    setSearching(true);
    try {
      const res = await fetch('/api/search');
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Search failed', 'error'); return; }
      setSearchResults(data.products);
      setSearchBrands(data.brands || {});
    } catch (err: unknown) {
      toast((err as Error).message, 'error');
    } finally {
      setSearching(false);
    }
  }

  function toggleSelectUrl(productUrl: string) {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(productUrl)) next.delete(productUrl);
      else next.add(productUrl);
      return next;
    });
  }

  function importSelected() {
    if (!selectedUrls.size) { toast('Select products first', 'warning'); return; }
    const urls = [...selectedUrls].join('\n');
    setUrl(prev => prev ? prev + '\n' + urls : urls);
    setSelectedUrls(new Set());
    setShowSearch(false);
    toast(`${selectedUrls.size} URL${selectedUrls.size > 1 ? 's' : ''} added to import`, 'success');
  }

  async function handleGreenAgeBrowse() {
    setGreenAgeBrowsing(true);
    try {
      const params = new URLSearchParams();
      if (greenAgeCategory) params.set('category', greenAgeCategory);
      const res = await fetch(`/api/browse/greenage?${params}`);
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Browse failed', 'error'); return; }
      setGreenAgeResults(data.products);
      setGreenAgeCategories(data.categories || {});
    } catch (err: unknown) {
      toast((err as Error).message, 'error');
    } finally {
      setGreenAgeBrowsing(false);
    }
  }

  function toggleGreenAgeUrl(productUrl: string, product?: { price: number | null; name: string }) {
    setGreenAgeSelected(prev => {
      const next = new Set(prev);
      if (next.has(productUrl)) {
        next.delete(productUrl);
        browsePriceMap.current.delete(productUrl);
      } else {
        next.add(productUrl);
        if (product) browsePriceMap.current.set(productUrl, product);
      }
      return next;
    });
  }

  function importGreenAgeSelected() {
    if (!greenAgeSelected.size) { toast('Select products first', 'warning'); return; }
    const urls = [...greenAgeSelected].join('\n');
    setUrl(prev => prev ? prev + '\n' + urls : urls);
    setGreenAgeSelected(new Set());
    setShowGreenAge(false);
    toast(`${greenAgeSelected.size} URL${greenAgeSelected.size > 1 ? 's' : ''} added to import`, 'success');
  }

  async function handleAccessoryBrowse() {
    setAccBrowsing(true);
    try {
      const params = new URLSearchParams();
      if (accBrand) params.set('brand', accBrand);
      if (accCategory) params.set('category', accCategory);
      const res = await fetch(`/api/search/accessories?${params}`);
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Browse failed', 'error'); return; }
      setAccResults(data.products);
      setAccCategories(data.categories || {});
      setAccBrands(data.brands || {});
    } catch (err: unknown) {
      toast((err as Error).message, 'error');
    } finally {
      setAccBrowsing(false);
    }
  }

  function toggleAccUrl(productUrl: string, product?: { price: number | null; name: string }) {
    setAccSelected(prev => {
      const next = new Set(prev);
      if (next.has(productUrl)) {
        next.delete(productUrl);
        browsePriceMap.current.delete(productUrl);
      } else {
        next.add(productUrl);
        if (product) browsePriceMap.current.set(productUrl, product);
      }
      return next;
    });
  }

  function importAccSelected() {
    if (!accSelected.size) { toast('Select accessories first', 'warning'); return; }
    const urls = [...accSelected].join('\n');
    setUrl(prev => prev ? prev + '\n' + urls : urls);
    setAccSelected(new Set());
    setShowAccessories(false);
    toast(`${accSelected.size} URL${accSelected.size > 1 ? 's' : ''} added to import`, 'success');
  }

  function updateQueueByIndex(index: number, updater: (item: QueueItem) => QueueItem) {
    setQueue(prev => {
      const next = prev.map((item, i) => (i === index ? updater(item) : item));
      queueRef.current = next;
      return next;
    });
  }

  function updateQueueBySession(sessionId: string, updater: (item: QueueItem) => QueueItem) {
    setQueue(prev => prev.map(item => (item.sessionId === sessionId ? updater(item) : item)));
  }

  async function patch(sessionId: string, action: string, value: string) {
    const res = await fetch(`/api/import/${sessionId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, value }),
    });
    if (!res.ok) { const d = await res.json(); toast(d.error || 'Update failed', 'error'); return; }
    const d = await res.json();
    if (d.pricing) updateQueueBySession(sessionId, item => ({ ...item, pricing: d.pricing }));
  }

  function debounceField(action: string, value: string) {
    const current = queue[activeIndex];
    if (!current) return;
    const sessionId = current.sessionId;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => patch(sessionId, action, value), 600);
  }

  async function handleAIRewrite() {
    const current = queue[activeIndex];
    if (!current) return;
    setRewritingAI(true);
    try {
      const res = await fetch(`/api/import/${current.sessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_rewrite_details', value: '' }),
      });
      const d = await res.json();
      if (!res.ok) { toast(d.error || 'AI rewrite failed', 'error'); return; }
      if (d.details) {
        updateQueueByIndex(activeIndex, item => ({ ...item, editDetails: d.details }));
      }
      toast('Description rewritten by AI', 'success');
    } catch (err: unknown) {
      toast((err as Error).message, 'error');
    } finally {
      setRewritingAI(false);
    }
  }

  async function handleAIRewriteMarketing() {
    const current = queue[activeIndex];
    if (!current) return;
    setRewritingAI(true);
    try {
      const caption = current.editedCaption !== null ? current.editedCaption : (current.preview.marketing?.description || current.editDetails);
      const res = await fetch(`/api/import/${current.sessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_rewrite_marketing', value: caption }),
      });
      const d = await res.json();
      if (!res.ok) { toast(d.error || 'AI rewrite failed', 'error'); return; }
      if (d.rewrittenMarketing) {
        updateQueueByIndex(activeIndex, item => ({ ...item, editedCaption: d.rewrittenMarketing }));
      }
      toast('Marketing caption rewritten by AI', 'success');
    } catch (err: unknown) {
      toast((err as Error).message, 'error');
    } finally {
      setRewritingAI(false);
    }
  }

  async function handleFileUpload(file: File) {
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Upload failed', 'error'); return; }
      if (!data.products?.length) { toast('No products found in file', 'warning'); return; }
      const addAmount = parseFloat(priceAdd) || 0;
      const roundTo = parseFloat(priceRound) || 0;
      let added = 0;
      for (const p of data.products) {
        const preview: PreviewData = {
          sessionId: `upload-${Date.now()}-${added}`,
          name: p.name || 'Unnamed Product',
          brand: p.brand || '',
          schemaType: 'product',
          category: 'product',
          slug: (p.name || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          sourceUrl: `file://${data.source}`,
          pricing: null,
          isDuplicate: false,
          seoTitle: p.name || '',
          seoDesc: p.description?.substring(0, 160) || '',
          details: p.description || '',
          specs: p.specifications || {},
          keywords: p.keyFeatures || [],
          totalKeywords: (p.keyFeatures || []).length,
          images: p.images || [],
          imageCount: (p.images || []).length,
          downloadedCount: 0,
          scrapedPriceTTD: p.currency === 'TTD' ? p.price : null,
          scrapedPriceUSD: p.currency === 'USD' ? p.price : null,
        };
        const rawPrice = p.price || 0;
        const adjustedPrice = rawPrice > 0 ? applyPriceAdjust(rawPrice, addAmount, roundTo) : 0;
        const qItem: QueueItem = {
          sessionId: preview.sessionId,
          preview,
          editName: preview.name,
          editBrand: preview.brand,
          editSchema: 'product',
          editPrice: adjustedPrice > 0 ? String(adjustedPrice) : '',
          editDetails: preview.details,
          editSpecs: preview.specs as Specs,
          removedImages: [],
          bgIndexes: [],
          wmIndexes: [],
          customTags: [],
          pricing: null,
          editedCaption: null,
          status: 'ready',
        };
        setQueue(prev => [...prev, qItem]);
        added++;
      }
      toast(`${added} product${added > 1 ? 's' : ''} extracted from ${data.source}`, 'success');
    } catch (err: unknown) {
      toast((err as Error).message, 'error');
    } finally {
      setUploadingFile(false);
    }
  }

  function parseUrls(input: string) {
    return input.split('\n').map(v => v.trim()).filter(Boolean);
  }

  async function handleScrape() {
    const urls = parseUrls(url);
    if (!urls.length) { toast('Please enter at least one URL', 'warning'); return; }

    setScraping(true);
    const queueStart = queue.length;
    let successes = 0;
    let failures = 0;

    for (let i = 0; i < urls.length; i++) {
      const currentUrl = urls[i];
      const prefix = `Scraping ${i + 1} of ${urls.length}: `;
      setProgress({ pct: 5, label: `${prefix}Connecting to supplier...` });
      const steps: [number, number, string][] = [
        [800, 20, 'Fetching product page...'],
        [2200, 45, 'Extracting product data...'],
        [4000, 65, 'Building specs & pricing...'],
        [5500, 80, 'Downloading images...'],
      ];
      const timers = steps.map(([delay, pct, label]) => setTimeout(() => setProgress({ pct, label: `${prefix}${label}` }), delay));

      try {
        const res = await fetch('/api/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: currentUrl, markup }),
        });
        timers.forEach(clearTimeout);
        setProgress({ pct: 95, label: `${prefix}Finishing up...` });
        const data = await res.json();
        if (!res.ok) {
          failures += 1;
          toast(data.error || `Scrape failed for URL ${i + 1}`, 'error');
          continue;
        }

        setProgress({ pct: 100, label: `${prefix}Done!` });
        const knownPrice = browsePriceMap.current.get(currentUrl)?.price ?? null;
        const qItem = makeQueueItem(data, parseFloat(priceAdd) || 0, parseFloat(priceRound) || 0, knownPrice);
        setQueue(prev => [...prev, qItem]);
        if (qItem.editPrice && qItem.editPrice !== String(data.pricing?.sellingPriceTtd || '')) {
          fetch(`/api/import/${data.sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_price', value: qItem.editPrice }) }).catch(() => {});
        }
        if (queueStart === 0 && successes === 0) setActiveIndex(0);
        successes += 1;
        if (data.isDuplicate) toast('Possible duplicate detected - review before pushing', 'warning', 6000);
      } catch (err: unknown) {
        timers.forEach(clearTimeout);
        failures += 1;
        toast((err as Error).message, 'error');
      }
    }

    setTimeout(() => setProgress(null), 600);
    setScraping(false);
    setActiveTab('overview');
    if (successes > 0) setShowBgWmPrompt(true);
    if (urls.length > 1) toast(`Scrape complete: ${successes} added, ${failures} failed`, failures ? 'warning' : 'success', 5000);
  }

  async function handleRescrape(index: number) {
    const item = queueRef.current[index];
    if (!item) return;
    const sourceUrl = item.preview.sourceUrl;
    setScraping(true);
    setProgress({ pct: 10, label: 'Rescraping...' });
    try {
      // Delete old session
      fetch(`/api/import/${item.sessionId}`, { method: 'DELETE' }).catch(() => {});
      const res = await fetch('/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl, markup }),
      });
      setProgress({ pct: 90, label: 'Finishing rescrape...' });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Rescrape failed', 'error'); return; }
      const qItem = makeQueueItem(data, parseFloat(priceAdd) || 0, parseFloat(priceRound) || 0);
      // Preserve user edits where possible
      qItem.editName = item.editName;
      qItem.editBrand = item.editBrand;
      qItem.editSchema = item.editSchema;
      qItem.editPrice = item.editPrice;
      qItem.editDetails = item.editDetails;
      qItem.customTags = item.customTags;
      updateQueueByIndex(index, () => qItem);
      setProgress({ pct: 100, label: 'Rescrape done!' });
      toast(`Rescrape complete - ${data.images?.length || 0} images found`, 'success');
      setShowBgWmPrompt(true);
    } catch (err: unknown) {
      toast((err as Error).message, 'error');
    } finally {
      setTimeout(() => setProgress(null), 600);
      setScraping(false);
    }
  }

  function applyBgWmToAll() {
    setQueue(prev => {
      const next = prev.map(item => {
        if (item.status === 'done') return item;
        const allIndexes = item.preview.images.map((_, i) => i).filter(i => !item.removedImages.includes(i));
        return { ...item, bgIndexes: allIndexes, wmIndexes: allIndexes };
      });
      queueRef.current = next;
      return next;
    });
    setShowBgWmPrompt(false);
    toast('BG removal + watermark applied to all images', 'success');
  }

  function applyWmOnly() {
    setQueue(prev => {
      const next = prev.map(item => {
        if (item.status === 'done') return item;
        const allIndexes = item.preview.images.map((_, i) => i).filter(i => !item.removedImages.includes(i));
        return { ...item, wmIndexes: allIndexes };
      });
      queueRef.current = next;
      return next;
    });
    setShowBgWmPrompt(false);
    toast('Watermark applied to all images', 'success');
  }

  async function publishQueueItem(index: number, position: number, total: number) {
    const item = queueRef.current[index];
    if (!item) return false;
    if (!item.pricing && !item.editPrice) {
      updateQueueByIndex(index, q => ({ ...q, status: 'failed' }));
      toast(`Set a price before publishing ${item.editName || item.preview.name}`, 'warning');
      return false;
    }

    setActiveIndex(index);
    updateQueueByIndex(index, q => ({ ...q, status: 'publishing' }));

    const hasBg = item.bgIndexes.length > 0;
    const prefix = `Publishing ${position} of ${total}: `;
    const pushSteps: [number, number, string][] = [
      [300, 10, 'Starting publish...'],
      [1000, hasBg ? 25 : 35, hasBg ? 'Removing backgrounds...' : 'Processing images...'],
      [hasBg ? 8000 : 3000, 55, 'Applying watermarks...'],
      [hasBg ? 14000 : 6000, 75, 'Uploading to Sanity...'],
    ];
    setProgress({ pct: 5, label: `${prefix}Preparing...` });
    const timers = pushSteps.map(([delay, pct, label]) => setTimeout(() => setProgress({ pct, label: `${prefix}${label}` }), delay));

    try {
      const res = await fetch(`/api/import/${item.sessionId}/push`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bgRemoveIndexes: item.bgIndexes, watermarkIndexes: item.wmIndexes, editedCaption: item.editedCaption }),
      });
      timers.forEach(clearTimeout);
      setProgress({ pct: 95, label: `${prefix}Saving to catalog...` });
      const data = await res.json();
      if (!res.ok) {
        updateQueueByIndex(index, q => ({ ...q, status: 'failed' }));
        toast(data.error || 'Push failed', 'error');
        return false;
      }
      updateQueueByIndex(index, q => ({ ...q, status: 'done' }));
      setProgress({ pct: 100, label: `${prefix}Published!` });
      if (data.metaSuccess) toast('WhatsApp Catalog updated', 'success');
      return true;
    } catch (err: unknown) {
      timers.forEach(clearTimeout);
      updateQueueByIndex(index, q => ({ ...q, status: 'failed' }));
      toast((err as Error).message, 'error');
      return false;
    }
  }

  function resetImporter() {
    setQueue([]);
    queueRef.current = [];
    setActiveIndex(0);
    setUrl('');
    setCustomTag('');
    setActiveTab('overview');
    setProgress(null);
  }

  async function handlePush() {
    if (!activeItem) return;
    setPushing(true);
    const ok = await publishQueueItem(activeIndex, 1, 1);
    if (ok) {
      setProgress({ pct: 100, label: 'Published!' });
      const remaining = queueRef.current.filter((_, i) => i !== activeIndex);
      if (remaining.length === 0) {
        setTimeout(() => { resetImporter(); }, 800);
      } else {
        setTimeout(() => {
          setQueue(remaining);
          queueRef.current = remaining;
          setActiveIndex(0);
          setProgress(null);
        }, 800);
      }
    } else {
      setProgress(null);
    }
    setPushing(false);
  }

  async function handlePublishAll() {
    if (!queue.length) return;
    setPushing(true);
    const indexes = queueRef.current.map((item, idx) => ({ item, idx })).filter(({ item }) => item.status !== 'done').map(({ idx }) => idx);
    if (!indexes.length) {
      toast('All queued products are already published', 'success');
      setPushing(false);
      return;
    }

    let successCount = 0;
    let failedCount = 0;
    for (let i = 0; i < indexes.length; i++) {
      const ok = await publishQueueItem(indexes[i], i + 1, indexes.length);
      if (ok) successCount += 1;
      else failedCount += 1;
    }
    toast(`${successCount} published, ${failedCount} failed`, failedCount ? 'warning' : 'success', 7000);
    setTimeout(() => {
      resetImporter();
      setPushing(false);
    }, 800);
  }

  function toggleRemove(i: number) {
    if (!activeItem) return;
    const next = removedImages.includes(i) ? removedImages.filter(x => x !== i) : [...removedImages, i];
    updateQueueByIndex(activeIndex, item => ({ ...item, removedImages: next }));
    patch(activeItem.sessionId, removedImages.includes(i) ? 'restore_image' : 'remove_image', String(i));
  }

  function toggleBg(i: number) { updateQueueByIndex(activeIndex, item => ({ ...item, bgIndexes: item.bgIndexes.includes(i) ? item.bgIndexes.filter(x => x !== i) : [...item.bgIndexes, i] })); }
  function toggleWm(i: number) { updateQueueByIndex(activeIndex, item => ({ ...item, wmIndexes: item.wmIndexes.includes(i) ? item.wmIndexes.filter(x => x !== i) : [...item.wmIndexes, i] })); }

  async function addTag() {
    if (!activeItem || !customTag.trim()) return;
    const tags = customTag.split(',').map(t => t.trim()).filter(Boolean);
    updateQueueByIndex(activeIndex, item => ({ ...item, customTags: [...new Set([...item.customTags, ...tags])] }));
    await patch(activeItem.sessionId, 'add_tags', tags.join(','));
    setCustomTag('');
  }

  function removeTag(t: string) {
    if (!activeItem) return;
    updateQueueByIndex(activeIndex, item => ({ ...item, customTags: item.customTags.filter(x => x !== t) }));
    patch(activeItem.sessionId, 'remove_tag', t);
  }

  function removeFromQueue(index: number) {
    const item = queueRef.current[index];
    if (item) {
      fetch(`/api/import/${item.sessionId}`, { method: 'DELETE' }).catch(() => {});
      // Remove the source URL from the textarea
      const sourceUrl = item.preview.sourceUrl;
      if (sourceUrl) {
        setUrl(prev => prev.split('\n').filter(line => line.trim() !== sourceUrl.trim()).join('\n'));
      }
    }
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== index);
      queueRef.current = next;
      return next;
    });
    setActiveIndex(i => Math.min(i, Math.max(0, queueRef.current.length - 1)));
  }

  async function handlePartsouqSearch() {
    const q = psQuery.trim();
    if (!q) { toast('Enter a part name, number, or chassis/VIN', 'warning'); return; }
    setPsSearching(true);
    setPsError('');
    setPsResults([]);
    try {
      const res = await fetch(`/api/partsouq/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) { setPsError(data.error || 'Search failed'); return; }
      setPsResults(data.results || []);
      if (!data.results?.length) setPsError(data.message || 'No results found');
    } catch (err: unknown) {
      setPsError((err as Error).message);
    } finally {
      setPsSearching(false);
    }
  }

  function psAddToScraper(productUrl: string) {
    setUrl(prev => prev ? prev + '\n' + productUrl : productUrl);
    toast('URL added to scraper', 'success');
  }

  const badge = preview ? BADGE_COLORS[preview.schemaType] || BADGE_COLORS.electronic : null;
  const activeImages = preview ? preview.images.filter((_, i) => !removedImages.includes(i)) : [];
  const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const bgRemovalActive = Boolean(config?.hasRembg);
  const bgRemovalLabel = !bgRemovalActive && !isLocalhost ? 'BG Removal (cloud)' : 'BG Removal';

  return (
    <div className="flex h-full flex-col overflow-hidden [&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11 [&_textarea]:min-h-24">
      <div style={{ padding: isMobile ? '8px 12px' : '0 28px', minHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: '10px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div>
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-base)' }}>Import Product</span>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginLeft: isMobile ? 0 : '10px', display: 'block' }}>Paste supplier URL(s) to import</span>
        </div>
        {config && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Chip label={bgRemovalLabel} active={bgRemovalActive} />
            <Chip label="Watermark" active={config.hasSharp && config.hasWatermark} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 12px 24px' : '24px 28px' }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', marginBottom: '20px', alignItems: 'stretch' }}>
            <textarea
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://sunsky-online.com/product/... (one URL per line)"
              rows={isMobile ? 4 : 3}
              style={{ ...inp({ minHeight: '84px' }), flex: 1, fontSize: '14px', padding: '11px 16px', resize: 'vertical' }}
              onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = 'var(--brand)'}
              onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = 'var(--border)'}
            />
            <input type="number" value={markup} onChange={e => setMarkup(e.target.value)} min={0} max={500} step={1} className="w-full md:w-20" style={{ ...inp(), width: '72px', textAlign: 'center' }} title="Markup %" placeholder="Markup %" />
            <input type="number" value={priceAdd} onChange={e => setPriceAdd(e.target.value)} min={0} step={1} className="w-full md:w-20" style={{ ...inp(), width: '72px', textAlign: 'center' }} title="Price Add (TTD)" placeholder="+TTD" />
            <input type="number" value={priceRound} onChange={e => setPriceRound(e.target.value)} min={0} step={1} className="w-full md:w-20" style={{ ...inp(), width: '72px', textAlign: 'center' }} title="Round up to nearest" placeholder="Round" />
            <button onClick={handleScrape} disabled={scraping} style={{ padding: '11px 24px', background: scraping ? '#4a2b8a' : 'var(--brand)', border: 'none', borderRadius: '9px', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: scraping ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              {scraping ? <><Spin />Scraping...</> : 'Scrape'}
            </button>
          </div>

          {/* File Upload Zone */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '16px', border: '2px dashed var(--border)', borderRadius: '10px', cursor: uploadingFile ? 'not-allowed' : 'pointer', background: 'var(--bg-raised)', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, transition: 'border-color 0.2s' }}
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand)'; }}
              onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
              onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
            >
              <input type="file" accept=".pdf,.txt,.csv,.json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />
              {uploadingFile ? 'Processing file...' : 'Upload supplier file (PDF, TXT, CSV, JSON) — drag & drop or click'}
            </label>
          </div>

          {/* Search / Browse Sunsky */}
          <div style={{ marginBottom: '20px' }}>
            <button onClick={() => { setShowSearch(!showSearch); if (!showSearch && !searchResults.length) handleSearch(); }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}>
              {showSearch ? 'Hide' : 'Browse'} Sunsky Rugged Phones
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{showSearch ? '[-]' : '[+]'}</span>
            </button>

            {showSearch && (
              <div style={{ marginTop: '12px', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                {/* Brand filter */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <button onClick={() => { setSearchBrand(''); }} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: `1px solid ${!searchBrand ? 'var(--brand)' : 'var(--border)'}`, background: !searchBrand ? 'var(--brand-glow)' : 'transparent', color: !searchBrand ? '#a78bfa' : 'var(--text-muted)', cursor: 'pointer' }}>All</button>
                  {['BLACKVIEW', 'ULEFONE', 'OUKITEL', 'UMIDIGI', 'DOOGEE', 'HOTWAV', 'UNIHERTZ', 'UNIWA', 'CUBOT', 'AGM'].map(b => (
                    <button key={b} onClick={() => setSearchBrand(b)} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: `1px solid ${searchBrand === b ? 'var(--brand)' : 'var(--border)'}`, background: searchBrand === b ? 'var(--brand-glow)' : 'transparent', color: searchBrand === b ? '#a78bfa' : 'var(--text-muted)', cursor: 'pointer' }}>
                      {b} {searchBrands[b] ? `(${searchBrands[b]})` : ''}
                    </button>
                  ))}
                  <button onClick={handleSearch} disabled={searching} style={{ marginLeft: 'auto', padding: '4px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    {searching ? 'Loading...' : 'Refresh'}
                  </button>
                </div>

                {searching && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontSize: '13px' }}><Spin /> Searching Sunsky...</div>}

                {!searching && searchResults.length > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{searchResults.length} phones found{searchBrand ? ` for ${searchBrand}` : ''} &middot; {selectedUrls.size} selected</span>
                      {selectedUrls.size > 0 && (
                        <button onClick={importSelected} style={{ padding: '6px 16px', background: 'var(--brand)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          Import {selectedUrls.size} to Scraper
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                      {searchResults.filter(p => !searchBrand || p.brand === searchBrand).map(p => {
                        const selected = selectedUrls.has(p.url);
                        return (
                          <button key={p.id} onClick={() => toggleSelectUrl(p.url)} style={{ textAlign: 'left', padding: '10px', borderRadius: '8px', border: `1px solid ${selected ? 'var(--brand)' : 'var(--border)'}`, background: selected ? 'var(--brand-glow)' : 'var(--bg-hover)', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {p.image && <div style={{ width: '44px', height: '44px', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-surface)', flexShrink: 0 }}><img src={`/api/imgproxy?url=${encodeURIComponent(p.image)}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-base)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                              <div style={{ fontSize: '11px', color: p.price ? '#4ade80' : 'var(--text-dim)', marginTop: '3px' }}>
                                {p.price ? `$${p.price.toFixed(2)} USD` : 'Price on page'}
                                <span style={{ marginLeft: '8px', color: 'var(--text-dim)' }}>{p.brand}</span>
                              </div>
                            </div>
                            <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${selected ? 'var(--brand)' : 'var(--border)'}`, background: selected ? 'var(--brand)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff' }}>
                              {selected && '\u2713'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {!searching && searchResults.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: '13px' }}>No results. Click Refresh to search.</div>
                )}
              </div>
            )}
          </div>

          {/* Browse Sunsky Accessories & Parts */}
          <div style={{ marginBottom: '20px' }}>
            <button onClick={() => { setShowAccessories(!showAccessories); if (!showAccessories && !accResults.length) handleAccessoryBrowse(); }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}>
              {showAccessories ? 'Hide' : 'Browse'} Sunsky Accessories & Parts
              <span style={{ fontSize: '10px', color: '#fbbf24' }}>[Cases, Chargers, Parts & More]</span>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{showAccessories ? '[-]' : '[+]'}</span>
            </button>

            {showAccessories && (
              <div style={{ marginTop: '12px', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                {/* Brand filter pills */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <button onClick={() => setAccBrand('')} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: `1px solid ${!accBrand ? '#f59e0b' : 'var(--border)'}`, background: !accBrand ? 'rgba(245,158,11,0.15)' : 'transparent', color: !accBrand ? '#fbbf24' : 'var(--text-muted)', cursor: 'pointer' }}>All Brands</button>
                  {['BLACKVIEW', 'ULEFONE', 'OUKITEL', 'UMIDIGI', 'DOOGEE', 'HOTWAV', 'UNIHERTZ', 'UNIWA', 'CUBOT', 'AGM'].map(b => (
                    <button key={b} onClick={() => setAccBrand(b)} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: `1px solid ${accBrand === b ? '#f59e0b' : 'var(--border)'}`, background: accBrand === b ? 'rgba(245,158,11,0.15)' : 'transparent', color: accBrand === b ? '#fbbf24' : 'var(--text-muted)', cursor: 'pointer' }}>
                      {b} {accBrands[b] ? `(${accBrands[b]})` : ''}
                    </button>
                  ))}
                  <button onClick={handleAccessoryBrowse} disabled={accBrowsing} style={{ marginLeft: 'auto', padding: '4px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    {accBrowsing ? 'Loading...' : 'Refresh'}
                  </button>
                </div>

                {/* Category filter pills */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <button onClick={() => setAccCategory('')} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: `1px solid ${!accCategory ? '#f59e0b' : 'var(--border)'}`, background: !accCategory ? 'rgba(245,158,11,0.15)' : 'transparent', color: !accCategory ? '#fbbf24' : 'var(--text-muted)', cursor: 'pointer' }}>All Categories</button>
                  {[
                    { key: 'cases', label: 'Cases & Covers' },
                    { key: 'screen-protection', label: 'Screen Protectors' },
                    { key: 'charging', label: 'Cables & Chargers' },
                    { key: 'replacement-parts', label: 'Replacement Parts' },
                    { key: 'mounts-holders', label: 'Mounts & Holders' },
                    { key: 'other', label: 'Other' },
                  ].map(cat => (
                    <button key={cat.key} onClick={() => setAccCategory(cat.key)} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: `1px solid ${accCategory === cat.key ? '#f59e0b' : 'var(--border)'}`, background: accCategory === cat.key ? 'rgba(245,158,11,0.15)' : 'transparent', color: accCategory === cat.key ? '#fbbf24' : 'var(--text-muted)', cursor: 'pointer' }}>
                      {cat.label} {accCategories[cat.key] ? `(${accCategories[cat.key]})` : ''}
                    </button>
                  ))}
                </div>

                {/* Model filter input */}
                <input type="text" value={accModelFilter} onChange={e => setAccModelFilter(e.target.value)} placeholder="Filter by model name (e.g. WP33)" style={{ ...inp(), marginBottom: '12px', fontSize: '12px' }} />

                {accBrowsing && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontSize: '13px' }}><Spin /> Searching accessories...</div>}

                {!accBrowsing && accResults.length > 0 && (() => {
                  const visible = accResults.filter(p =>
                    (!accBrand || p.brand === accBrand) &&
                    (!accCategory || p.category === accCategory) &&
                    (!accModelFilter || p.name.toLowerCase().includes(accModelFilter.toLowerCase()))
                  );
                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{visible.length} accessories{accBrand ? ` for ${accBrand}` : ''}{accCategory ? ` in ${accCategory.replace(/-/g, ' ')}` : ''} &middot; {accSelected.size} selected</span>
                        {accSelected.size > 0 && (
                          <button onClick={importAccSelected} style={{ padding: '6px 16px', background: '#92400e', border: '1px solid #f59e0b', borderRadius: '8px', color: '#fbbf24', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                            Import {accSelected.size} to Scraper
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                        {visible.map(p => {
                          const sel = accSelected.has(p.url);
                          return (
                            <button key={p.id} onClick={() => toggleAccUrl(p.url, { price: p.price, name: p.name })} style={{ textAlign: 'left', padding: '10px', borderRadius: '8px', border: `1px solid ${sel ? '#f59e0b' : 'var(--border)'}`, background: sel ? 'rgba(245,158,11,0.1)' : 'var(--bg-hover)', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center' }}>
                              {p.image && <div style={{ width: '44px', height: '44px', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-surface)', flexShrink: 0 }}><img src={`/api/imgproxy?url=${encodeURIComponent(p.image)}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-base)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                <div style={{ fontSize: '11px', color: p.price ? '#4ade80' : 'var(--text-dim)', marginTop: '3px' }}>
                                  {p.price ? `$${p.price.toFixed(2)} USD` : 'Price on page'}
                                  <span style={{ marginLeft: '8px', color: '#fbbf24', fontSize: '10px' }}>{p.category.replace(/-/g, ' ')}</span>
                                </div>
                              </div>
                              <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${sel ? '#f59e0b' : 'var(--border)'}`, background: sel ? '#f59e0b' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff' }}>
                                {sel && '\u2713'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}

                {!accBrowsing && accResults.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: '13px' }}>No accessories found. Click Refresh to browse.</div>
                )}
              </div>
            )}
          </div>

          {/* Browse GreenAge Farms */}
          <div style={{ marginBottom: '20px' }}>
            <button onClick={() => { setShowGreenAge(!showGreenAge); if (!showGreenAge && !greenAgeResults.length) handleGreenAgeBrowse(); }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}>
              {showGreenAge ? 'Hide' : 'Browse'} GreenAge Farms
              <span style={{ fontSize: '10px', color: '#4ade80' }}>[Hydroponics / AgriTech]</span>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{showGreenAge ? '[-]' : '[+]'}</span>
            </button>

            {showGreenAge && (
              <div style={{ marginTop: '12px', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                {/* Category filter pills */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <button onClick={() => setGreenAgeCategory('')} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: `1px solid ${!greenAgeCategory ? '#22c55e' : 'var(--border)'}`, background: !greenAgeCategory ? 'rgba(34,197,94,0.15)' : 'transparent', color: !greenAgeCategory ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer' }}>All</button>
                  {['hydroponic-systems','fertilizers','irrigation-components','pots-and-planters','seeds','grow-media-soil-and-amendments','greenhouse-supplies','water-pumps','testers-and-accessories','plant-care'].map(cat => (
                    <button key={cat} onClick={() => setGreenAgeCategory(cat)} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: `1px solid ${greenAgeCategory === cat ? '#22c55e' : 'var(--border)'}`, background: greenAgeCategory === cat ? 'rgba(34,197,94,0.15)' : 'transparent', color: greenAgeCategory === cat ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer' }}>
                      {cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} {greenAgeCategories[cat] ? `(${greenAgeCategories[cat]})` : ''}
                    </button>
                  ))}
                  <button onClick={handleGreenAgeBrowse} disabled={greenAgeBrowsing} style={{ marginLeft: 'auto', padding: '4px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    {greenAgeBrowsing ? 'Loading...' : 'Refresh'}
                  </button>
                </div>

                {greenAgeBrowsing && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontSize: '13px' }}><Spin /> Loading GreenAge Farms...</div>}

                {!greenAgeBrowsing && greenAgeResults.length > 0 && (() => {
                  const visible = greenAgeCategory ? greenAgeResults.filter(p => p.category === greenAgeCategory) : greenAgeResults;
                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{visible.length} products{greenAgeCategory ? ` in ${greenAgeCategory.replace(/-/g, ' ')}` : ''} &middot; {greenAgeSelected.size} selected</span>
                        {greenAgeSelected.size > 0 && (
                          <button onClick={importGreenAgeSelected} style={{ padding: '6px 16px', background: '#166534', border: '1px solid #22c55e', borderRadius: '8px', color: '#4ade80', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                            Import {greenAgeSelected.size} to Scraper
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                        {visible.map(p => {
                          const sel = greenAgeSelected.has(p.url);
                          return (
                            <button key={p.id} onClick={() => toggleGreenAgeUrl(p.url, { price: p.price, name: p.name })} style={{ textAlign: 'left', padding: '10px', borderRadius: '8px', border: `1px solid ${sel ? '#22c55e' : 'var(--border)'}`, background: sel ? 'rgba(34,197,94,0.1)' : 'var(--bg-hover)', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center' }}>
                              {p.image && <div style={{ width: '44px', height: '44px', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-surface)', flexShrink: 0 }}><img src={`/api/imgproxy?url=${encodeURIComponent(p.image)}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-base)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                <div style={{ fontSize: '11px', color: p.price ? '#4ade80' : 'var(--text-dim)', marginTop: '3px' }}>
                                  {p.price ? `TT$${p.price.toFixed(2)}` : 'Price on page'}
                                </div>
                              </div>
                              <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${sel ? '#22c55e' : 'var(--border)'}`, background: sel ? '#22c55e' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff' }}>
                                {sel && '\u2713'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}

                {!greenAgeBrowsing && greenAgeResults.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: '13px' }}>No products found. Click Refresh to browse.</div>
                )}
              </div>
            )}
          </div>

          {/* PartSouq Car Parts Lookup */}
          <div style={{ marginBottom: '20px' }}>
            <button onClick={() => { setShowPartsouq(!showPartsouq); setPsResults([]); setPsError(''); }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}>
              {showPartsouq ? 'Hide' : 'Lookup'} PartSouq Car Parts
              <span style={{ fontSize: '10px', color: '#fb923c' }}>[Part Name, Part No. or VIN]</span>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{showPartsouq ? '[-]' : '[+]'}</span>
            </button>

            {showPartsouq && (
              <div style={{ marginTop: '12px', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '10px', lineHeight: 1.5 }}>
                  Search by <strong style={{ color: 'var(--text-muted)' }}>Part Name</strong> (e.g. <code style={{ color: '#fb923c' }}>brake pad</code>), <strong style={{ color: 'var(--text-muted)' }}>Part Number</strong> (e.g. <code style={{ color: '#fb923c' }}>8954202061</code>), or <strong style={{ color: 'var(--text-muted)' }}>Chassis / VIN</strong> (e.g. <code style={{ color: '#fb923c' }}>JHMEJ9340WS050454</code>)
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    value={psQuery}
                    onChange={e => setPsQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePartsouqSearch()}
                    placeholder="Part name, part number, or Chassis/VIN..."
                    style={{ ...inp({ flex: 1, fontSize: '13px' }) }}
                  />
                  <button onClick={handlePartsouqSearch} disabled={psSearching} style={{ padding: '9px 16px', background: psSearching ? '#431407' : '#7c2d12', border: '1px solid #c2410c', borderRadius: '8px', color: '#fb923c', fontSize: '13px', fontWeight: 700, cursor: psSearching ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                    {psSearching ? 'Searching...' : 'Search'}
                  </button>
                  <a href={`https://partsouq.com/en/search/all?q=${encodeURIComponent(psQuery)}`} target="_blank" rel="noopener noreferrer" style={{ padding: '9px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                    Open Site
                  </a>
                </div>

                {psSearching && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)', fontSize: '13px' }}><Spin /> Searching PartSouq...</div>}

                {psError && (
                  <div style={{ padding: '16px', background: '#1c1a10', border: '1px solid #ca8a04', borderRadius: '10px', fontSize: '13px', color: '#fde68a', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '8px' }}>⚠ PartSouq blocks automated requests (Cloudflare)</div>
                    <div style={{ fontSize: '12px', color: '#fcd34d', marginBottom: '12px' }}>
                      Use the button below to open PartSouq in your browser, find the part, then copy the URL and paste it into the scraper above.
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href={`https://partsouq.com/en/search/all?q=${encodeURIComponent(psQuery)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ padding: '9px 18px', background: '#b45309', border: '1px solid #f59e0b', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        🔗 Open PartSouq Search
                      </a>
                      <div style={{ fontSize: '11px', color: '#a3a3a3', alignSelf: 'center' }}>
                        → Copy product URL → Paste in scraper above → Hit Scrape
                      </div>
                    </div>
                  </div>
                )}

                {psResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {psResults.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        {r.imageUrl && (
                          <div style={{ width: '64px', height: '64px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={r.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-base)', marginBottom: '2px' }}>{r.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ color: '#fb923c', fontWeight: 600 }}>{r.partNumber}</span>
                            <span>{r.brand}</span>
                            {r.price && <span style={{ color: '#4ade80', fontWeight: 600 }}>{r.price}</span>}
                            {r.availability && <span style={{ color: r.availability.includes('0') ? '#f87171' : '#a3e635' }}>{r.availability}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                          <button onClick={() => psAddToScraper(r.url)} style={{ padding: '6px 12px', background: 'var(--brand)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            + Scraper
                          </button>
                          <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                            View
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {!preview && !scraping && !showSearch && !showGreenAge && !showPartsouq && !showAccessories && (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>?</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Paste one or more product URLs above</div>
              <div style={{ fontSize: '13px' }}>Supports Sunsky, HOTWAV, GreenAge Farms, PartSouq, AliExpress, eBay, Amazon, and generic sites</div>
            </div>
          )}

          {scraping && progress && (
            <div style={{ padding: '60px 20px 80px' }}>
              <div style={{ maxWidth: '580px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{progress.label}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{progress.pct}%</span>
                </div>
                <div style={{ height: '6px', background: 'var(--bg-raised)', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '99px', background: 'linear-gradient(90deg, #7c3aed, #a78bfa)', width: `${progress.pct}%`, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            </div>
          )}

          {/* BG Removal + Watermark prompt */}
          {showBgWmPrompt && queue.length > 0 && (
            <div style={{ marginBottom: '16px', background: 'var(--bg-raised)', border: '1px solid var(--brand)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-base)', marginBottom: '12px' }}>Apply image processing to all products?</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={applyBgWmToAll} style={{ padding: '8px 16px', background: '#071a0e', border: '1px solid #166534', borderRadius: '8px', color: '#4ade80', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>BG Removal + Watermark</button>
                <button onClick={applyWmOnly} style={{ padding: '8px 16px', background: '#0f0f1a', border: '1px solid rgba(124,58,237,0.4)', borderRadius: '8px', color: '#a78bfa', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Watermark Only</button>
                <button onClick={() => setShowBgWmPrompt(false)} style={{ padding: '8px 16px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Skip</button>
              </div>
            </div>
          )}

          {preview && (
            <>
              <Section title="Queue">
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                  {queue.map((item, i) => {
                    const st = STATUS_STYLES[item.status];
                    return (
                      <div key={item.sessionId} style={{ position: 'relative', borderRadius: '10px', border: `1px solid ${i === activeIndex ? 'var(--brand)' : 'var(--border)'}`, background: i === activeIndex ? 'var(--bg-hover)' : 'var(--bg-raised)' }}>
                        <button onClick={() => setActiveIndex(i)} style={{ textAlign: 'left', padding: '10px', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <div style={{ width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-hover)', flexShrink: 0 }}>
                            {item.preview.downloadedCount > 0
                              ? <img src={`/api/import/${item.sessionId}/image/0`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).src = item.preview.images[0] || ''; }} />
                              : item.preview.images[0] ? <img src={item.preview.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-base)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.editName || item.preview.name}</div>
                            {/* Supplier cost line */}
                            {item.preview.scrapedPriceTTD
                              ? <div style={{ fontSize: '10px', color: '#fbbf24', marginTop: '2px', fontWeight: 600 }}>Cost: TT${Number(item.preview.scrapedPriceTTD).toLocaleString()}</div>
                              : item.preview.scrapedPriceUSD
                              ? <div style={{ fontSize: '10px', color: '#fbbf24', marginTop: '2px', fontWeight: 600 }}>Cost: US${Number(item.preview.scrapedPriceUSD).toFixed(2)}</div>
                              : item.pricing?.supplierCostUsd
                              ? <div style={{ fontSize: '10px', color: '#fbbf24', marginTop: '2px', fontWeight: 600 }}>Cost: US${Number(item.pricing.supplierCostUsd).toFixed(2)}</div>
                              : null}
                            {/* Selling price — always show if we have one */}
                            {(() => {
                              const sellPrice = item.editPrice ? Number(item.editPrice) : (item.pricing?.sellingPriceTtd || 0);
                              return sellPrice > 0
                                ? <div style={{ fontSize: '11px', color: '#4ade80', fontWeight: 700, marginTop: '1px' }}>TT${sellPrice.toLocaleString()}</div>
                                : null;
                            })()}
                            <span style={{ display: 'inline-block', marginTop: '2px', padding: '1px 6px', borderRadius: '999px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>{item.status}</span>
                          </div>
                        </button>
                        <button onClick={e => { e.stopPropagation(); removeFromQueue(i); }} style={{ position: 'absolute', top: '6px', right: '6px', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#f87171', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }} title="Remove from queue">&times;</button>
                      </div>
                    );
                  })}
                </div>
              </Section>

              {preview.isDuplicate && (
                <div style={{ background: '#1a1000', border: '1px solid var(--warning)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: 'var(--warning)', fontSize: '16px' }}>!</span>
                    <span style={{ color: '#fbbf24', fontSize: '13px', flex: 1 }}>Possible duplicate - a product with this slug may already exist in Sanity.</span>
                  </div>
                  <button onClick={() => removeFromQueue(activeIndex)} style={{ marginTop: '10px', padding: '6px 14px', background: '#2d1010', border: '1px solid #991b1b', borderRadius: '6px', color: '#f87171', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                    Remove from queue
                  </button>
                </div>
              )}

              <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
                {(['overview','images','seo','specs','marketing'] as const).map(t => (
                  <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === t ? '2px solid var(--brand)' : '2px solid transparent', color: activeTab === t ? (t === 'marketing' ? '#4ade80' : '#a78bfa') : 'var(--text-muted)', fontSize: isMobile ? '14px' : '13px', fontWeight: activeTab === t ? 600 : 400, cursor: 'pointer', textTransform: 'capitalize', marginBottom: '-1px', whiteSpace: 'nowrap' }}>{t === 'marketing' ? '?? Marketing' : t}</button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <>
                  <Section title="Product Info">
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
                      <div style={{ gridColumn: isMobile ? '1 / -1' : 'span 2', minWidth: 0 }}>
                        {label('Product Name')}
                        <input style={inp()} value={editName} onChange={e => { const v = e.target.value; updateQueueByIndex(activeIndex, item => ({ ...item, editName: v })); debounceField('set_name', v); }} />
                      </div>
                      <div>
                        {label('Brand')}
                        <input style={inp()} value={editBrand} onChange={e => { const v = e.target.value; updateQueueByIndex(activeIndex, item => ({ ...item, editBrand: v })); debounceField('set_brand', v); }} />
                      </div>
                      <div>
                        {label('Schema Type')}
                        <select value={editSchema} onChange={e => { const v = e.target.value; updateQueueByIndex(activeIndex, item => ({ ...item, editSchema: v })); if (activeItem) patch(activeItem.sessionId, 'set_schema', v); }} style={{ ...inp(), cursor: 'pointer' }}>
                          {SCHEMA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </Section>

                  <Section title="Pricing">
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '14px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          {label('Price (TTD)')}
                          {preview.scrapedPriceTTD
                            ? <span style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 600 }}>Supplier: TT${Number(preview.scrapedPriceTTD).toLocaleString()}</span>
                            : preview.scrapedPriceUSD
                            ? <span style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 600 }}>Supplier: US${Number(preview.scrapedPriceUSD).toFixed(2)}</span>
                            : null}
                        </div>
                        <input type="number" style={inp()} value={editPrice} placeholder="Enter your selling price"
                          onChange={e => { const v = e.target.value; updateQueueByIndex(activeIndex, item => ({ ...item, editPrice: v })); }}
                          onBlur={() => {
                            const raw = parseFloat(editPrice);
                            if (!raw || raw <= 0) return;
                            const adjusted = applyPriceAdjust(raw, parseFloat(priceAdd) || 0, parseFloat(priceRound) || 0);
                            const v = String(adjusted);
                            updateQueueByIndex(activeIndex, item => ({ ...item, editPrice: v }));
                            if (activeItem) debounceField('set_price', v);
                          }}
                        />
                      </div>
                      <div>{label('Supplier Cost')}<div style={{ ...inp(), color: 'var(--text-muted)' }}>{pricing ? `US$${pricing.supplierCostUsd.toFixed(2)}` : preview.scrapedPriceUSD ? `US$${Number(preview.scrapedPriceUSD).toFixed(2)}` : '—'}</div></div>
                      <div>{label('Profit (TTD)')}<div style={{ ...inp(), color: pricing?.profitTtd ? '#4ade80' : 'var(--text-muted)' }}>{pricing ? `TT$${pricing.profitTtd.toFixed(2)}` : '—'}</div></div>
                    </div>
                  </Section>

                  <Section title="Description">
                    <textarea value={editDetails} rows={16} onChange={e => { const v = e.target.value; updateQueueByIndex(activeIndex, item => ({ ...item, editDetails: v })); debounceField('set_details', v); }} style={{ ...inp(), resize: 'vertical', lineHeight: 1.6, minHeight: '320px' }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                      <button onClick={handleAIRewrite} disabled={rewritingAI || !editDetails} style={{ padding: '6px 16px', background: rewritingAI ? '#2b1f05' : 'rgba(124,58,237,0.15)', border: `1px solid ${rewritingAI ? '#a16207' : 'rgba(124,58,237,0.4)'}`, borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: rewritingAI ? '#fbbf24' : '#a78bfa', cursor: rewritingAI ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {rewritingAI ? 'Rewriting...' : 'AI Rewrite'}
                      </button>
                    </div>
                  </Section>

                  <Section title="Custom Tags">
                    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px', marginBottom: '12px' }}>
                      <input style={{ ...inp(), flex: 1 }} value={customTag} onChange={e => setCustomTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Add tags (comma-separated, press Enter)" />
                      <button onClick={addTag} style={{ padding: '9px 16px', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-base)', cursor: 'pointer', fontSize: '13px', width: isMobile ? '100%' : 'auto' }}>Add</button>
                    </div>
                    {customTags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{customTags.map(t => <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px 3px 12px', background: 'var(--brand-glow)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '100px', fontSize: '12px', color: '#a78bfa' }}>{t}<button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '14px' }}>×</button></span>)}</div>}
                  </Section>
                </>
              )}

              {activeTab === 'images' && (
                <>
                  {config && <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <div style={{ padding: '8px 14px', background: 'var(--bg-raised)', borderRadius: '8px', fontSize: '12px', color: config.hasRembg ? '#4ade80' : 'var(--text-dim)', border: `1px solid ${config.hasRembg ? '#166534' : 'var(--border)'}` }}>{config.hasRembg ? '?' : '?'} Background Removal</div>
                    <div style={{ padding: '8px 14px', background: 'var(--bg-raised)', borderRadius: '8px', fontSize: '12px', color: config.hasSharp && config.hasWatermark ? '#4ade80' : 'var(--text-dim)', border: `1px solid ${config.hasSharp && config.hasWatermark ? '#166534' : 'var(--border)'}` }}>{config.hasSharp && config.hasWatermark ? '?' : '?'} Watermark</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '8px 0', marginLeft: '4px' }}>{preview.downloadedCount}/{preview.imageCount} images downloaded</div>
                    <button onClick={() => handleRescrape(activeIndex)} disabled={scraping} style={{ padding: '8px 14px', background: 'var(--bg-raised)', borderRadius: '8px', fontSize: '12px', color: '#fbbf24', border: '1px solid #a16207', cursor: scraping ? 'not-allowed' : 'pointer', fontWeight: 600, marginLeft: 'auto' }}>Rescrape</button>
                  </div>}

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(140px, 1fr))' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
                    {preview.images.map((imgUrl, i) => {
                      const removed = removedImages.includes(i); const hasBg = bgIndexes.includes(i); const hasWm = wmIndexes.includes(i);
                      return <div key={i} style={{ background: 'var(--bg-raised)', border: `1px solid ${removed ? 'var(--error)' : 'var(--border)'}`, borderRadius: '12px', overflow: 'hidden', opacity: removed ? 0.4 : 1 }}>
                        <div style={{ position: 'relative', aspectRatio: '1', cursor: 'pointer' }} onClick={() => !removed && setLightbox(imgUrl)}><img src={imgUrl} alt={`Image ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.7)', borderRadius: '5px', padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: '#fff' }}>{i + 1}</div></div>
                        <div style={{ padding: '10px' }}>
                          <button onClick={() => toggleRemove(i)} style={{ width: '100%', padding: '6px', marginBottom: '6px', background: removed ? '#2d1010' : 'var(--bg-hover)', border: `1px solid ${removed ? 'var(--error)' : 'var(--border)'}`, borderRadius: '6px', color: removed ? '#f87171' : 'var(--text-muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>{removed ? 'Restore' : 'Remove'}</button>
                          {!removed && <div style={{ display: 'flex', gap: '6px' }}>{config?.hasRembg && <button onClick={() => toggleBg(i)} style={{ flex: 1, padding: '5px', fontSize: '11px', fontWeight: 600, background: hasBg ? '#071a0e' : 'var(--bg-hover)', border: `1px solid ${hasBg ? '#22c55e' : 'var(--border)'}`, borderRadius: '6px', color: hasBg ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer' }}>BG</button>}{config?.hasSharp && config?.hasWatermark && <button onClick={() => toggleWm(i)} style={{ flex: 1, padding: '5px', fontSize: '11px', fontWeight: 600, background: hasWm ? '#0f0f1a' : 'var(--bg-hover)', border: `1px solid ${hasWm ? 'var(--brand)' : 'var(--border)'}`, borderRadius: '6px', color: hasWm ? '#a78bfa' : 'var(--text-muted)', cursor: 'pointer' }}>WM</button>}</div>}
                        </div>
                      </div>;
                    })}
                  </div>

                  <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--bg-raised)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>{activeImages.length} of {preview.images.length} active · {bgIndexes.length} BG removal · {wmIndexes.length} watermark</div>
                </>
              )}

              {activeTab === 'seo' && (
                <>
                  <Section title="SEO Preview"><div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}><div style={{ fontSize: '16px', color: '#93c5fd', marginBottom: '4px', fontWeight: 600 }}>{preview.seoTitle}</div><div style={{ fontSize: '12px', color: '#4ade80', marginBottom: '6px' }}>ruggtech.com/products/{preview.slug}</div><div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{preview.seoDesc}</div></div></Section>
                  <Section title="Keywords"><div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{[...preview.keywords, ...customTags].map((kw, i) => <span key={i} style={{ padding: '2px 10px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '100px', fontSize: '11px', color: 'var(--text-muted)' }}>{kw}</span>)}</div></Section>
                </>
              )}

              {activeTab === 'specs' && (
                <Section title="Specifications">
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                    {(preview.schemaType === 'phone' || preview.schemaType === 'product' ? SPEC_FIELDS : [['partNumber','Part Number'], ['compatibility','Compatibility'], ['material','Material'], ['oem','OEM'], ['installationDifficulty','Install Difficulty']] as [string, string][]).map(([key, lbl]) => <div key={key}>{label(lbl)}<input style={inp()} value={String(editSpecs[key] || '')} onChange={e => { const next = { ...editSpecs, [key]: e.target.value }; updateQueueByIndex(activeIndex, item => ({ ...item, editSpecs: next })); debounceField('set_spec', JSON.stringify({ key, val: e.target.value })); }} /></div>)}
                  </div>
                </Section>
              )}

              {activeTab === 'marketing' && preview.marketing && (() => {
                const m = preview.marketing;
                const caption = editedCaption !== null ? editedCaption : m.description;
                const fullText = caption + '\n\n' + m.hashtags.join(' ');
                return <><Section title="Marketing Caption"><textarea value={caption} onChange={e => updateQueueByIndex(activeIndex, item => ({ ...item, editedCaption: e.target.value }))} rows={14} style={{ ...inp(), minHeight: '260px', lineHeight: 1.6 }} /><div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>{editedCaption !== null && <button onClick={() => updateQueueByIndex(activeIndex, item => ({ ...item, editedCaption: null }))} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>}<button onClick={() => { navigator.clipboard.writeText(fullText); setCopiedMarketing(true); setTimeout(() => setCopiedMarketing(false), 2000); }} style={{ padding: '5px 14px', background: copiedMarketing ? 'rgba(34,197,94,0.15)' : 'var(--brand-glow)', border: `1px solid ${copiedMarketing ? '#22c55e' : 'rgba(124,58,237,0.4)'}`, borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: copiedMarketing ? '#4ade80' : '#a78bfa', cursor: 'pointer' }}>{copiedMarketing ? '? Copied!' : 'Copy Caption + Tags'}</button><button onClick={handleAIRewriteMarketing} disabled={rewritingAI} style={{ padding: '5px 14px', background: rewritingAI ? '#2b1f05' : 'rgba(124,58,237,0.15)', border: `1px solid ${rewritingAI ? '#a16207' : 'rgba(124,58,237,0.4)'}`, borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: rewritingAI ? '#fbbf24' : '#a78bfa', cursor: rewritingAI ? 'not-allowed' : 'pointer' }}>{rewritingAI ? 'Rewriting...' : 'AI Rewrite'}</button></div></Section><Section title="Hashtags"><div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{m.hashtags.map(tag => <span key={tag} style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', cursor: 'pointer' }}>{tag}</span>)}</div></Section></>;
              })()}
            </>
          )}
        </div>

        {preview && (
          <div style={{ width: isMobile ? '100%' : '320px', maxWidth: '100%', flexShrink: 0, borderLeft: isMobile ? 'none' : '1px solid var(--border)', borderTop: isMobile ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', maxHeight: isMobile ? '50vh' : 'none' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}><div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>{preview.images.map((imgUrl, i) => <div key={i} style={{ width: '60px', height: '60px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', border: removedImages.includes(i) ? '2px solid var(--error)' : bgIndexes.includes(i) || wmIndexes.includes(i) ? '2px solid var(--brand)' : '2px solid var(--border)', opacity: removedImages.includes(i) ? 0.3 : 1, cursor: 'pointer' }} onClick={() => setLightbox(imgUrl)}><img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>)}</div></div>
            <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
              {badge && <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, marginBottom: '12px', background: badge.bg, color: badge.color, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{preview.category}</span>}
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
            </div>
            <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
              {pushing && progress && <div style={{ marginBottom: '12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', gap: '8px' }}><span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>{progress.label}</span><span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{progress.pct}%</span></div><div style={{ height: '5px', background: 'var(--bg-raised)', borderRadius: '99px', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: '99px', background: 'linear-gradient(90deg, #7c3aed, #4ade80)', width: `${progress.pct}%`, transition: 'width 0.5s ease' }} /></div></div>}
              <div style={{ display: 'grid', gap: '8px' }}>
                <button onClick={handlePush} disabled={pushing} style={{ width: '100%', padding: '13px', background: pushing ? '#4a2b8a' : 'var(--brand)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: pushing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>{pushing ? <><Spin />Publishing...</> : 'Publish to Sanity'}</button>
                <button onClick={handlePublishAll} disabled={pushing || queue.length === 0} style={{ width: '100%', padding: '11px', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-base)', fontSize: '13px', fontWeight: 700, cursor: pushing || queue.length === 0 ? 'not-allowed' : 'pointer', opacity: pushing || queue.length === 0 ? 0.7 : 1 }}>Publish All</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {lightbox && <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}><button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: '20px', right: '20px', width: '44px', height: '44px', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '50%', color: 'var(--text-base)', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button><img src={lightbox} alt="Lightbox" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px' }} onClick={e => e.stopPropagation()} /></div>}
    </div>
  );
}

function Spin({ size = 16 }: { size?: number }) {
  return <span style={{ width: size, height: size, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />;
}

function Chip({ label, active }: { label: string; active: boolean }) {
  const indicator = active ? '?' : '-';
  return <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: active ? '#071a0e' : 'var(--bg-raised)', border: `1px solid ${active ? '#166534' : 'var(--border)'}`, color: active ? '#4ade80' : 'var(--text-muted)' }}>{indicator} {label}</span>;
}

function SummaryRow({ label: lbl, value, accent, green, warn }: { label: string; value: string; accent?: boolean; green?: boolean; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{lbl}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color: warn ? '#fbbf24' : green ? '#4ade80' : accent ? '#a78bfa' : 'var(--text-base)' }}>{value}</span>
    </div>
  );
}
