import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppSidebar } from '../../components/layout/AppSidebar';
import { AppTopBar } from '../../components/layout/AppTopBar';

function getSidebarPref(): boolean {
  try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(getSidebarPref);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  function handleCollapse(v: boolean) {
    setCollapsed(v);
    try { localStorage.setItem('sidebar-collapsed', String(v)); } catch { /* ignore */ }
  }

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const sidebarWidth = isMobile ? 0 : collapsed ? 64 : 240;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)' }}>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobile && mobileOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeMobile}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              zIndex: 39, backdropFilter: 'blur(2px)',
            }}
          />
        )}
      </AnimatePresence>

      <AppSidebar
        collapsed={collapsed}
        onCollapse={handleCollapse}
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />

      <AppTopBar
        sidebarWidth={sidebarWidth}
        isMobile={isMobile}
        onMobileMenuOpen={() => setMobileOpen(true)}
      />

      <main style={{
        marginLeft: sidebarWidth,
        marginTop: 56,
        flex: 1,
        overflowY: 'auto',
        minHeight: 'calc(100vh - 56px)',
        transition: 'margin-left 0.3s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <AnimatePresence mode="wait" initial={false}>
          <Outlet key={location.pathname} />
        </AnimatePresence>
      </main>
    </div>
  );
}
