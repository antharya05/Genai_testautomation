import { AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppSidebar } from '../../components/layout/AppSidebar';
import { AppTopBar } from '../../components/layout/AppTopBar';

function getSidebarPref(): boolean {
  try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(getSidebarPref);
  const location = useLocation();
  const sidebarWidth = collapsed ? 64 : 240;

  function handleCollapse(v: boolean) {
    setCollapsed(v);
    try { localStorage.setItem('sidebar-collapsed', String(v)); } catch { /* ignore */ }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)' }}>
      <AppSidebar collapsed={collapsed} onCollapse={handleCollapse} />
      <AppTopBar sidebarWidth={sidebarWidth} />

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
