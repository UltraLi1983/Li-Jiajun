export function LayoutAnnotationPage() {
  return (
    <div className="page-stack">
      <section className="section-card">
        <p className="eyebrow">T3 Layout 导入与人工标注</p>
        <h2>图片 / PDF 背景 + 比例尺 + 点线面标注</h2>
        <p>
          第一版先支持背景导入和人工标注。仓储区面积、通道距离优先基于标注边界和比例尺计算，人工输入只作为 override。
        </p>
      </section>
      <div className="placeholder-canvas">
        <span>Layout Annotation Canvas Placeholder</span>
      </div>
    </div>
  );
}
