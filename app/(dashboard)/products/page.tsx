'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/Toast';
import { ALL_TYPES, TYPE_LABELS } from '@/lib/sanity';

type SchemaType = typeof ALL_TYPES[number];

interface ProductSummary {
  _id: string;
  _type: SchemaType;
  name: string;
  brand?: string;
  price?: number;
  inStock?: boolean;
  stockQuantity?: number;
  slug?: { current: string };
  _updatedAt: string;
  imageUrl?: string;
}

interface ProductDetail extends ProductSummary {
  description?: string;
  details?: string;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string[];
  // image arrays resolved to URLs
  imageUrl2?: string[];
  imageUrl3?: string[];
  imageUrl4?: string[];
  imageUrl5?: string[];
  imageUrl6?: string[];
  imageUrls?: string[]; // unified list for display
  // phone specs
  display?: string;
  battery?: string;
  camera?: string;
  storage?: string;
  ram?: string;
  os?: string;
  processor?: string;
  // car
  make?: string;
  model?: string;
  year?: string;
  // all raw fields
  [key: string]: unknown;
}

const FIELD_GROUPS: Record<string, { label: string; fields: { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'boolean' | 'tags' }[] }> = {
  core: {
    label: 'Core Info',
    fields: [
      { key: 'name', label: 'Product Name', type: 'text' },
      { key: 'brand', label: 'Brand', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'details', label: 'Details', type: 'textarea' },
      { key: 'price', label: 'Price (TTD)', type: 'number' },
      { key: 'inStock', label: 'In Stock', type: 'boolean' },
      { key: 'stockQuantity', label: 'Stock Qty', type: 'number' },
      { key: 'tags', label: 'Tags', type: 'tags' },
    ],
  },
  seo: {
    label: 'SEO',
    fields: [
      { key: 'seoTitle', label: 'SEO Title', type: 'text' },
      { key: 'seoDescription', label: 'SEO Description', type: 'textarea' },
      { key: 'keywords', label: 'Keywords', type: 'tags' },
    ],
  },
  specs: {
    label: 'Specs',
    fields: [
      { key: 'display', label: 'Display', type: 'text' },
      { key: 'battery', label: 'Battery', type: 'text' },
      { key: 'camera', label: 'Camera', type: 'text' },
      { key: 'storage', label: 'Storage', type: 'text' },
      { key: 'ram', label: 'RAM', type: 'text' },
      { key: 'os', label: 'OS', type: 'text' },
      { key: 'processor', label: 'Processor', type: 'text' },
      { key: 'make', label: 'Make (Car)', type: 'text' },
      { key: 'model', label: 'Model (Car)', type: 'text' },
      { key: 'year', label: 'Year (Car)', type: 'text' },
    ],
  },
};

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TagEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');
  function add() {
    const v = input.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput('');
  }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {value.map(tag => (
          <span key={tag} style={{
            background: 'var(--brand-glow)', border: '1px solid rgba(124,58,237,0.4)',
            borderRadius: '20px', padding: '3px 10px', fontSize: '11px',
            color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            {tag}
            <span onClick={() => onChange(value.filter(t => t !== tag))}
              style={{ cursor: 'pointer', opacity: 0.7, fontSize: '10px' }}>✕</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="Add tag…"
          style={{
            flex: 1, padding: '6px 10px', background: 'var(--bg-raised)',
            border: '1px solid var(--border)', borderRadius: '6px',
            color: 'var(--text-base)', fontSize: '12px', outline: 'none',
            minHeight: '44px',
          }}
        />
        <button onClick={add} style={{
          padding: '6px 12px', background: 'var(--brand-glow)',
          border: '1px solid rgba(124,58,237,0.4)', borderRadius: '6px',
          color: '#a78bfa', fontSize: '12px', cursor: 'pointer',
          minHeight: '44px',
        }}>Add</button>
      </div>
    </div>
  );
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <img src={src} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px' }} />
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { toast } = useToast();

  // list state
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SchemaType>('all');

  // detail state
  const [selected, setSelected] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<'core' | 'seo' | 'specs'>('core');
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateLog, setMigrateLog] = useState<{ name: string; status: 'processing' | 'updated' | 'skipped' | 'error'; fields?: string[]; error?: string }[]>([]);
  const [migrateTotal, setMigrateTotal] = useState(0);
  const [migrateDone, setMigrateDone] = useState<{ updated: number; skipped: number; errors: number } | null>(null);
  const migrateLogRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // fetch list
  const fetchProducts = useCallback(async (q: string, t: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      if (t !== 'all') params.set('type', t);
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      setProducts(data.products || []);
      setTotal(data.total || 0);
    } catch {
      toast('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const debouncedFetch = useRef(debounce((q: string, t: string) => fetchProducts(q, t), 350)).current;

  async function handleMigrate() {
    if (!confirm(`Backfill all ${total} products with missing specs, SEO, keywords and marketing data?`)) return;
    setMigrating(true);
    setMigrateLog([]);
    setMigrateTotal(0);
    setMigrateDone(null);
    try {
      const res = await fetch('/api/products/migrate', { method: 'POST' });
      if (!res.ok || !res.body) { toast('Migration failed', 'error'); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'total') {
              setMigrateTotal(msg.total);
            } else if (msg.type === 'progress') {
              setMigrateLog(prev => {
                const next = [...prev];
                // find existing entry (processing placeholder) or append
                const idx = next.findIndex(e => e.name === msg.name && e.status === 'processing');
                const entry = { name: msg.name, status: msg.status, fields: msg.fields, error: msg.error };
                if (idx >= 0) next[idx] = entry; else next.push(entry);
                // auto-scroll
                setTimeout(() => migrateLogRef.current?.scrollTo({ top: migrateLogRef.current.scrollHeight, behavior: 'smooth' }), 30);
                return next;
              });
            } else if (msg.type === 'done') {
              setMigrateDone({ updated: msg.updated, skipped: msg.skipped, errors: msg.errors });
              fetchProducts(search, typeFilter);
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      toast((err as Error).message, 'error');
    } finally {
      setMigrating(false);
    }
  }

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileView('list');
  }, [isMobile]);

  useEffect(() => { debouncedFetch(search, typeFilter); }, [search, typeFilter, debouncedFetch]);

  // fetch detail
  async function selectProduct(id: string) {
    if (isMobile) setMobileView('detail');
    setLoadingDetail(true);
    setSelected(null);
    setEdits({});
    setActiveTab('core');
    setConfirmDelete(false);
    try {
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) { toast('Failed to load product', 'error'); if (isMobile) setMobileView('list'); return; }
      const data = await res.json();
      // Build unified image list
      const allImages: string[] = [];
      for (const key of ['imageUrl','imageUrl2','imageUrl3','imageUrl4','imageUrl5','imageUrl6']) {
        const v = data[key];
        if (!v) continue;
        if (Array.isArray(v)) allImages.push(...v.filter(Boolean));
        else if (typeof v === 'string') allImages.push(v);
      }
      setSelected({ ...data, imageUrls: allImages });
    } catch {
      toast('Error loading product', 'error');
      if (isMobile) setMobileView('list');
    } finally {
      setLoadingDetail(false);
    }
  }

  function getField(key: string): unknown {
    if (key in edits) return edits[key];
    return selected?.[key];
  }

  function setField(key: string, value: unknown) {
    setEdits(prev => ({ ...prev, [key]: value }));
  }

  async function saveChanges() {
    if (!selected || Object.keys(edits).length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${selected._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      });
      if (!res.ok) { toast('Save failed', 'error'); return; }
      toast('Saved!', 'success');
      // Update list item
      setProducts(prev => prev.map(p =>
        p._id === selected._id ? { ...p, ...(edits as Partial<ProductSummary>) } : p
      ));
      setSelected(prev => prev ? { ...prev, ...edits } : prev);
      setEdits({});
    } catch {
      toast('Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!selected) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${selected._id}`, { method: 'DELETE' });
      if (!res.ok) { toast('Delete failed', 'error'); return; }
      toast('Product deleted', 'success');
      setProducts(prev => prev.filter(p => p._id !== selected._id));
      setTotal(t => t - 1);
      setSelected(null);
      if (isMobile) setMobileView('list');
      setEdits({});
    } catch {
      toast('Delete failed', 'error');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const hasEdits = Object.keys(edits).length > 0;
  const showListPanel = !isMobile || mobileView === 'list';
  const showDetailPanel = !isMobile || mobileView === 'detail';

  // ── Render ──

  return (
    <div className="flex h-full flex-col overflow-hidden md:flex-row">

      {/* ── Left: product list ── */}
      {showListPanel && <div className="flex w-full max-w-full shrink-0 flex-col overflow-hidden border-b border-[var(--border)] md:w-80 md:border-b-0 md:border-r">
        {/* Search + filter */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-dim)', fontSize: '14px', pointerEvents: 'none',
            }}>⌕</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              style={{
                width: '100%', padding: '8px 12px 8px 30px',
                background: 'var(--bg-raised)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--text-base)', fontSize: '13px',
                outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box',
                minHeight: '44px',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--brand)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
            style={{
              padding: '7px 10px', background: 'var(--bg-raised)',
              border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-base)', fontSize: '12px', outline: 'none', cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            <option value="all">All Types</option>
            {ALL_TYPES.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              {loading ? 'Loading…' : `${total} product${total !== 1 ? 's' : ''}`}
            </div>
            <button
              onClick={handleMigrate}
              disabled={migrating || loading}
              title="Backfill all existing products with missing specs, SEO, keywords and marketing data"
              style={{
                fontSize: '11px', fontWeight: 600, padding: '4px 10px',
                background: migrating ? '#1e1b4b' : 'transparent',
                border: '1px solid var(--border)', borderRadius: '6px',
                color: migrating ? '#a78bfa' : 'var(--text-dim)',
                cursor: migrating ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                minHeight: '44px',
              }}
            >
              {migrating ? 'Migrating…' : 'Backfill All'}
            </button>
          </div>
        </div>

        {/* Migration live log */}
        {(migrating || migrateDone) && (
          <div style={{ borderBottom: '1px solid var(--border)', background: '#0a0a14' }}>
            {/* Header */}
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {migrating ? 'Backfilling…' : 'Complete'}
              </span>
              {migrateDone && (
                <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                  <span style={{ color: '#4ade80' }}>✓ {migrateDone.updated}</span>
                  <span style={{ color: 'var(--text-dim)' }}>— {migrateDone.skipped}</span>
                  {migrateDone.errors > 0 && <span style={{ color: '#f87171' }}>✗ {migrateDone.errors}</span>}
                </div>
              )}
            </div>
            {/* Progress bar */}
            {migrating && migrateTotal > 0 && (
              <div style={{ height: '2px', background: 'var(--bg-raised)', margin: '0 12px 6px' }}>
                <div style={{
                  height: '100%', borderRadius: '99px',
                  background: 'linear-gradient(90deg, #7c3aed, #4ade80)',
                  width: `${Math.round((migrateLog.length / migrateTotal) * 100)}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            )}
            {/* Scrolling log */}
            <div ref={migrateLogRef} style={{ maxHeight: '180px', overflowY: 'auto', padding: '0 12px 8px' }}>
              {migrateLog.map((entry, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '6px',
                  padding: '2px 0', fontSize: '11px', lineHeight: '1.4',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                }}>
                  <span style={{ flexShrink: 0, marginTop: '1px' }}>
                    {entry.status === 'updated'    ? <span style={{ color: '#4ade80' }}>✓</span>
                   : entry.status === 'skipped'   ? <span style={{ color: 'var(--text-dim)' }}>–</span>
                   : entry.status === 'error'     ? <span style={{ color: '#f87171' }}>✗</span>
                   : <span style={{ color: '#a78bfa', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>}
                  </span>
                  <span style={{
                    flex: 1, color: entry.status === 'error' ? '#f87171' : entry.status === 'skipped' ? 'var(--text-dim)' : 'var(--text-base)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={entry.name}>{entry.name}</span>
                  {entry.fields && entry.fields.length > 0 && (
                    <span style={{ color: '#7c3aed', fontSize: '10px', flexShrink: 0 }}>
                      {entry.fields.join(', ')}
                    </span>
                  )}
                  {entry.error && (
                    <span style={{ color: '#f87171', fontSize: '10px', flexShrink: 0 }} title={entry.error}>
                      err
                    </span>
                  )}
                </div>
              ))}
              {migrating && (
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', padding: '4px 0' }}>
                  {migrateLog.length}{migrateTotal > 0 ? ` / ${migrateTotal}` : ''} processed…
                </div>
              )}
            </div>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && products.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
              Loading…
            </div>
          ) : products.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
              No products found
            </div>
          ) : (
            products.map(p => {
              const active = selected?._id === p._id;
              return (
                <div
                  key={p._id}
                  onClick={() => selectProduct(p._id)}
                  style={{
                    display: 'flex', gap: '12px', padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    background: active ? 'var(--brand-glow)' : 'transparent',
                    borderLeft: active ? '3px solid var(--brand)' : '3px solid transparent',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    width: '44px', height: '44px', flexShrink: 0,
                    borderRadius: '8px', overflow: 'hidden',
                    background: 'var(--bg-raised)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {p.imageUrl
                      ? <img src={p.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: 'var(--text-dim)', fontSize: '18px' }}>⊞</span>
                    }
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: 600, color: 'var(--text-base)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{p.name || 'Untitled'}</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '3px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '10px', background: 'rgba(124,58,237,0.15)',
                        color: '#a78bfa', borderRadius: '4px', padding: '1px 6px',
                      }}>{TYPE_LABELS[p._type] || p._type}</span>
                      {p.brand && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.brand}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
                      {p.price != null && (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#4ade80' }}>
                          ${p.price.toLocaleString()}
                        </span>
                      )}
                      <span style={{
                        fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                        background: p.inStock ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                        color: p.inStock ? '#4ade80' : '#f87171',
                      }}>{p.inStock ? 'In Stock' : 'Out'}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>}

      {/* ── Right: detail panel ── */}
      {showDetailPanel && <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected && !loadingDetail ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '12px', color: 'var(--text-dim)',
          }}>
            <div style={{ fontSize: '40px', opacity: 0.3 }}>⊞</div>
            <div style={{ fontSize: '14px' }}>Select a product to edit</div>
          </div>
        ) : loadingDetail ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', fontSize: '14px', flexDirection: 'column', gap: '10px',
          }}>
            {isMobile && (
              <button
                onClick={() => setMobileView('list')}
                style={{
                  minHeight: '44px',
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-base)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Back to List
              </button>
            )}
            Loading…
          </div>
        ) : selected && (
          <>
            {/* Header */}
            <div style={{
              padding: isMobile ? '12px' : '16px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: '10px',
              flexShrink: 0,
            }}>
              <div style={{ minWidth: 0 }}>
                {isMobile && (
                  <button
                    onClick={() => setMobileView('list')}
                    style={{
                      minHeight: '44px',
                      padding: '8px 14px',
                      marginBottom: '8px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text-base)',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Back to List
                  </button>
                )}
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-base)' }}>
                  {(getField('name') as string) || 'Untitled'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  {TYPE_LABELS[selected._type]} • {selected._id}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {hasEdits && (
                  <button onClick={saveChanges} disabled={saving} style={{
                    padding: '8px 18px', background: 'var(--brand)',
                    border: 'none', borderRadius: '8px', color: '#fff',
                    fontSize: '13px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                    minHeight: '44px',
                  }}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                )}
                {confirmDelete ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#f87171' }}>Confirm delete?</span>
                    <button onClick={deleteProduct} disabled={deleting} style={{
                      padding: '7px 14px', background: '#7f1d1d',
                      border: '1px solid #ef4444', borderRadius: '7px',
                      color: '#f87171', fontSize: '12px', cursor: 'pointer', minHeight: '44px',
                    }}>{deleting ? 'Deleting…' : 'Yes, Delete'}</button>
                    <button onClick={() => setConfirmDelete(false)} style={{
                      padding: '7px 12px', background: 'transparent',
                      border: '1px solid var(--border)', borderRadius: '7px',
                      color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', minHeight: '44px',
                    }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} style={{
                    padding: '8px 14px', background: 'transparent',
                    border: '1px solid var(--border)', borderRadius: '8px',
                    color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', minHeight: '44px',
                    transition: 'border-color 0.1s, color 0.1s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
                  >Delete</button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">

              {/* Tabs + form */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Tab bar */}
                <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] px-3 pt-3 md:px-6">
                  {(['core', 'seo', 'specs'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                      padding: '10px 16px',
                      background: activeTab === tab ? 'var(--brand-glow)' : 'transparent',
                      border: 'none',
                      borderBottom: activeTab === tab ? '2px solid var(--brand)' : '2px solid transparent',
                      color: activeTab === tab ? '#a78bfa' : 'var(--text-muted)',
                      fontSize: isMobile ? '14px' : '12px', fontWeight: activeTab === tab ? 600 : 400,
                      cursor: 'pointer', borderRadius: '6px 6px 0 0',
                      transition: 'color 0.1s',
                      minHeight: '44px',
                      whiteSpace: 'nowrap',
                    }}>{FIELD_GROUPS[tab].label}</button>
                  ))}
                </div>

                {/* Fields */}
                <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-5">
                  {FIELD_GROUPS[activeTab].fields.map(({ key, label, type }) => {
                    const val = getField(key);
                    const isDirty = key in edits;

                    return (
                      <div key={key} style={{ marginBottom: '18px' }}>
                        <label style={{
                          display: 'block', fontSize: '11px', fontWeight: 600,
                          color: isDirty ? '#a78bfa' : 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
                        }}>
                          {label}{isDirty && ' •'}
                        </label>

                        {type === 'boolean' ? (
                          <div style={{ display: 'flex', gap: '10px' }}>
                            {[true, false].map(bval => (
                              <button key={String(bval)} onClick={() => setField(key, bval)} style={{
                                padding: '10px 16px',
                                background: val === bval ? (bval ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)') : 'var(--bg-raised)',
                                border: `1px solid ${val === bval ? (bval ? '#22c55e' : '#ef4444') : 'var(--border)'}`,
                                borderRadius: '7px',
                                color: val === bval ? (bval ? '#4ade80' : '#f87171') : 'var(--text-muted)',
                                fontSize: isMobile ? '14px' : '12px', cursor: 'pointer', fontWeight: val === bval ? 600 : 400,
                                minHeight: '44px',
                              }}>{bval ? 'Yes' : 'No'}</button>
                            ))}
                          </div>
                        ) : type === 'tags' ? (
                          <TagEditor
                            value={(val as string[]) || []}
                            onChange={v => setField(key, v)}
                          />
                        ) : type === 'number' ? (
                          <input
                            type="number"
                            value={(val as number) ?? ''}
                            onChange={e => setField(key, e.target.value === '' ? null : Number(e.target.value))}
                            style={{
                              width: '100%', padding: '9px 12px',
                              background: 'var(--bg-raised)',
                              border: `1px solid ${isDirty ? 'var(--brand)' : 'var(--border)'}`,
                              borderRadius: '8px', color: 'var(--text-base)',
                              fontSize: isMobile ? '16px' : '13px', outline: 'none', boxSizing: 'border-box',
                              minHeight: '44px',
                            }}
                          />
                        ) : type === 'textarea' ? (
                          <textarea
                            value={(val as string) || ''}
                            onChange={e => setField(key, e.target.value)}
                            rows={4}
                            style={{
                              width: '100%', padding: '9px 12px',
                              background: 'var(--bg-raised)',
                              border: `1px solid ${isDirty ? 'var(--brand)' : 'var(--border)'}`,
                              borderRadius: '8px', color: 'var(--text-base)',
                              fontSize: isMobile ? '16px' : '13px', outline: 'none', resize: 'vertical',
                              fontFamily: 'inherit', boxSizing: 'border-box',
                              minHeight: '88px',
                            }}
                          />
                        ) : (
                          <input
                            type="text"
                            value={(val as string) || ''}
                            onChange={e => setField(key, e.target.value)}
                            style={{
                              width: '100%', padding: '9px 12px',
                              background: 'var(--bg-raised)',
                              border: `1px solid ${isDirty ? 'var(--brand)' : 'var(--border)'}`,
                              borderRadius: '8px', color: 'var(--text-base)',
                              fontSize: isMobile ? '16px' : '13px', outline: 'none', boxSizing: 'border-box',
                              minHeight: '44px',
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: images + quick info */}
              <div className="flex w-full max-w-full shrink-0 flex-col overflow-hidden border-t border-[var(--border)] md:w-60 md:border-l md:border-t-0">
                {/* Images */}
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Images</div>
                  {selected.imageUrls && selected.imageUrls.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 md:grid-cols-2">
                      {selected.imageUrls.map((url, i) => (
                        <div key={i} onClick={() => setLightbox(url)} style={{
                          aspectRatio: '1', borderRadius: '8px', overflow: 'hidden',
                          background: 'var(--bg-raised)', border: '1px solid var(--border)',
                          cursor: 'zoom-in',
                        }}>
                          <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', padding: '16px 0' }}>
                      No images
                    </div>
                  )}
                </div>

                {/* Quick stats */}
                <div style={{ padding: isMobile ? '12px' : '16px', overflowY: 'auto', flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Quick Info</div>

                  {[
                    { label: 'Type', value: TYPE_LABELS[selected._type] },
                    { label: 'Price', value: selected.price != null ? `$${selected.price.toLocaleString()} TTD` : '—' },
                    { label: 'Stock', value: selected.inStock ? `${selected.stockQuantity ?? '?'} units` : 'Out of stock' },
                    { label: 'Updated', value: new Date(selected._updatedAt).toLocaleDateString() },
                    { label: 'Slug', value: selected.slug?.current || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-base)', marginTop: '2px', wordBreak: 'break-all' }}>{value}</div>
                    </div>
                  ))}

                  {selected.tags && (selected.tags as string[]).length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Tags</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {(selected.tags as string[]).map(tag => (
                          <span key={tag} style={{
                            fontSize: '10px', background: 'var(--brand-glow)',
                            color: '#a78bfa', borderRadius: '4px', padding: '2px 7px',
                          }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}




