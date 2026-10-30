import { useMemo, useState } from 'react';
import { BarChart3, Boxes, ClipboardList, FileText, Layers3, Map, Settings, SplitSquareHorizontal } from 'lucide-react';
import { DashboardPage } from '../pages/DashboardPage';
import { LayoutAnnotationPage } from '../pages/LayoutAnnotationPage';
import { PlaneViewPage } from '../pages/PlaneViewPage';
import { ElevationViewPage } from '../pages/ElevationViewPage';
import { ParametersPage } from '../pages/ParametersPage';
import { ScenarioComparePage } from '../pages/ScenarioComparePage';
import { ReportPage } from '../pages/ReportPage';
import { useScenarioStore } from './scenarioStore';

type PageKey = 'dashboard' | 'layout' | 'plane' | 'elevation' | 'parameters' | 'compare' | 'report';

const pages = [
  { key: 'dashboard', label: '总览', icon: BarChart3 },
  { key: 'layout', label: 'Layout 标注', icon: Map },
  { key: 'plane', label: '平面运营视图', icon: Layers3 },
  { key: 'elevation', label: '立面钻取', icon: Boxes },
  { key: 'parameters', label: '参数', icon: Settings },
  { key: 'compare', label: '方案对比', icon: SplitSquareHorizontal },
  { key: 'report', label: '报告', icon: FileText }
] satisfies Array<{ key: PageKey; label: string; icon: typeof ClipboardList }>;

export function App() {
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const scenario = useScenarioStore((state) => state.scenario);
  const supermarketEnabled = useScenarioStore((state) => state.supermarketEnabled);
  const toggleSupermarket = useScenarioStore((state) => state.toggleSupermarket);

  const activeTitle = useMemo(
    () => pages.find((page) => page.key === activePage)?.label ?? 'Demo2',
    [activePage]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Demo2 navigation">
        <div className="brand-block">
          <div className="brand-mark">D2</div>
          <div>
            <div className="brand-title">Demo2 OPS Twin</div>
            <div className="brand-subtitle">物理数字孪生与运营优化</div>
          </div>
        </div>

        <nav className="nav-list">
          {pages.map((page) => {
            const Icon = page.icon;
            return (
              <button
                key={page.key}
                className={activePage === page.key ? 'nav-item nav-item-active' : 'nav-item'}
                type="button"
                onClick={() => setActivePage(page.key)}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{page.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="eyebrow">Standard Demo Scenario</div>
            <h1>{activeTitle}</h1>
          </div>
          <div className="topbar-actions">
            <div className="scenario-chip">{scenario.name}</div>
            <button className="mode-toggle" type="button" onClick={toggleSupermarket} aria-pressed={supermarketEnabled}>
              Supermarket {supermarketEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </header>

        <section className="content-panel">
          {activePage === 'dashboard' && <DashboardPage />}
          {activePage === 'layout' && <LayoutAnnotationPage />}
          {activePage === 'plane' && <PlaneViewPage />}
          {activePage === 'elevation' && <ElevationViewPage />}
          {activePage === 'parameters' && <ParametersPage />}
          {activePage === 'compare' && <ScenarioComparePage />}
          {activePage === 'report' && <ReportPage />}
        </section>
      </main>
    </div>
  );
}
