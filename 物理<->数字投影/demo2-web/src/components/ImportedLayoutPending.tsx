import type { ActiveImportedLayout } from '../app/activeImportedLayout';

export function ImportedLayoutPending({ layout, title }: { layout: ActiveImportedLayout; title: string }) {
  return <div className="page-stack"><section className="section-card imported-layout-pending">
    <p className="eyebrow">SELECTED LAYOUT · MAPPING PENDING</p><h2>{title}</h2>
    <p>当前选择的是 {layout.unitName || layout.fileName}（{layout.buildingName || '楼栋待定义'} / {layout.floorLabel || '楼层待定义'}，第 {layout.pageNumber} 页）。功能区、墙、门和通道已进入平面运营视图。</p>
    <p>此页的库存、运力或方案数字需要先把仓库起点、工站、配送点、物料和运输资源关联到这版 Layout。关联完成前不显示恢复样板的计算结果。</p>
    <div className="recovery-grid"><article className="recovery-card"><strong>现有功能区</strong>{layout.regions.length} 个</article>
      <article className="recovery-card"><strong>已标点位</strong>{layout.objectPoints.length} 个</article>
      <article className="recovery-card"><strong>通道候选线</strong>{layout.lines.filter((line) => line.type === 'aisle').length} 条</article></div>
  </section></div>;
}
