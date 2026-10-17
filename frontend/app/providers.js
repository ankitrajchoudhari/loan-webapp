'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n, { restoreLanguage } from '@/lib/i18n';
import { Icon } from '@/components/icons';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export default function Providers({ children }) {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    restoreLanguage();
  }, []);

  const show = useCallback((message, tone = 'ok') => {
    setToast({ message, tone, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <I18nextProvider i18n={i18n}>
      <ToastContext.Provider value={show}>
        {children}
        {toast && (
          <div className="no-print fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4" role="status" aria-live="polite">
            <div
              key={toast.id}
              className={`flex max-w-md items-center gap-3 rounded-2xl px-5 py-4 text-base font-semibold text-white shadow-xl ${
                toast.tone === 'bad' ? 'bg-bad' : 'bg-ok'
              }`}
            >
              <Icon name={toast.tone === 'bad' ? 'alert' : 'check'} className="size-5 shrink-0" />
              {toast.message}
            </div>
          </div>
        )}
      </ToastContext.Provider>
    </I18nextProvider>
  );
}
