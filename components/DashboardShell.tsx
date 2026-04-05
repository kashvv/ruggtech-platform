'use client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/import', label: 'Import', icon: 'I' },
  { href: '/products', label: 'Products', icon: 'P' },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, mobileOpen]);

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    setMobileOpen(false);
    router.push('/login');
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1190,
          }}
        />
      )}

      <aside style={{
        width: isMobile ? '280px' : '220px',
        maxWidth: '84vw',
        flexShrink: 0,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: isMobile ? 'fixed' : 'relative',
        inset: isMobile ? '0 auto 0 0' : 'auto',
        transform: isMobile ? (mobileOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
        transition: isMobile ? 'transform 0.2s ease' : 'none',
        zIndex: 1200,
        pointerEvents: isMobile && !mobileOpen ? 'none' : 'auto',
      }}>
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div style={{
            width: '32px', height: '32px', background: 'var(--brand)',
            borderRadius: '8px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#fff',
            flexShrink: 0,
          }}>RT</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-base)', lineHeight: 1.2 }}>RUGGTECH</div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Platform</div>
          </div>
        </div>

        <nav style={{ padding: '12px 10px', flex: 1 }}>
          {NAV.map(({ href, label, icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                minHeight: '44px',
                padding: '10px 12px', borderRadius: '8px', marginBottom: '4px',
                color: active ? '#a78bfa' : 'var(--text-muted)',
                background: active ? 'var(--brand-glow)' : 'transparent',
                textDecoration: 'none', fontSize: '14px', fontWeight: active ? 600 : 400,
                transition: 'background 0.1s, color 0.1s',
                border: active ? '1px solid rgba(124,58,237,0.3)' : '1px solid transparent',
              }}>
                <span style={{ fontSize: '16px', lineHeight: 1 }}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)' }}>
          <button onClick={logout} style={{
            width: '100%', minHeight: '44px', padding: '10px 12px',
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: '8px', color: 'var(--text-muted)',
            fontSize: '14px', cursor: 'pointer', textAlign: 'left',
            transition: 'border-color 0.1s, color 0.1s',
          }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--error)'; (e.target as HTMLButtonElement).style.color = '#f87171'; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.target as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isMobile && (
          <div style={{
            minHeight: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
            zIndex: 100,
          }}>
            <button
              onClick={() => setMobileOpen(open => !open)}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              style={{
                minWidth: '44px',
                minHeight: '44px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-raised)',
                color: 'var(--text-base)',
                fontSize: '18px',
                cursor: 'pointer',
              }}
            >
              =
            </button>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>RUGGTECH</div>
            <div style={{ width: '44px', height: '44px' }} />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
