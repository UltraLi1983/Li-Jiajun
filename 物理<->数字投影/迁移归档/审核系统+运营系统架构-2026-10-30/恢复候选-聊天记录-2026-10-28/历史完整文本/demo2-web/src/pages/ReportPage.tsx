export function ReportPage() {
  return (
    <div className="page-stack">
      <section className="section-card">
        <p className="eyebrow">T9 售前报告</p>
        <h2>当前问题、推荐方案、计算假设、不承诺边界</h2>
        <p>
          报告页会绑定当前场景计算结果，用于售前会议后交付。第一版先做 Web 报告，不把 PDF 作为硬交付。
        </p>
      </section>
      <div className="report-outline">
        <div>1. 当前物料流与库容问题</div>
        <div>2. Supermarket Mode 推荐</div>
        <div>3. 高位货架 / 料道立面方案</div>
        <div>4. KPI 改善与 rough 计算假设</div>
        <div>5. 不承诺边界与付费后升级路径</div>
      </div>
    </div>
  );
}
