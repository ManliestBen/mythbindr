import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import { ToastProvider } from './ToastProvider';

export default function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  // Navigating closes the mobile drawer.
  useEffect(() => setNavOpen(false), [pathname]);

  // Global shortcuts: Ctrl/Cmd-K anywhere; "/" outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        const typing =
          t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          t instanceof HTMLSelectElement ||
          Boolean(t?.isContentEditable);
        if (!typing) {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ToastProvider>
    <div className="flex h-screen overflow-hidden bg-app-bg text-fg">
      <div className="hidden h-full md:block">
        <Sidebar />
      </div>

      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setNavOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenPalette={() => setPaletteOpen(true)}
          onToggleNav={() => setNavOpen((v) => !v)}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
    </ToastProvider>
  );
}
