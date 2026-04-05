'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

interface ToastCtx {
  toast: (msg: string, type?: ToastType, duration?: number) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast() { return useContext(Ctx); }

const COLORS: Record<ToastType, { bg: string; border: string; color: string }> = {
  success: { bg: '#071a0e', border: '#22c55e', color: '#4ade80' },
  error: { bg: '#1a0808', border: '#ef4444', color: '#f87171' },
  info: { bg: '#0f0f1a', border: '#7c3aed', color: '#a78bfa' },
  warning: { bg: '#1a1000', border: '#f59e0b', color: '#fbbf24' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let counter = 0;

  const toast = useCallback((msg: string, type: ToastType = 'info', duration = 3500) => {
    const id = ++counter;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px',
        pointerEvents: 'none', alignItems: 'center',
        width: 'calc(100vw - 24px)',
        maxWidth: '460px',
      }}>
        {toasts.map(t => {
          const c = COLORS[t.type];
          return (
            <div key={t.id} style={{
              padding: '12px 16px', borderRadius: '10px',
              background: c.bg, border: `1px solid ${c.border}`, color: c.color,
              fontSize: '14px', fontWeight: 600,
              width: '100%', textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              animation: 'slideUp 0.22s ease',
              pointerEvents: 'auto',
            }}>{t.msg}</div>
          );
        })}
      </div>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </Ctx.Provider>
  );
}
