import type { RouteWeekPlanResult, RouteWeekStationResult } from "../engine/route-week-plan.js";
import { formatNumber, formatOutputUnits } from "./number-format.js";

export function reportScale(review: RouteWeekPlanResult, outlook: RouteWeekPlanResult): number {
  const values = [
    review.demandQty, review.mostLikelyPieces, review.bestCasePieces, review.actualPieces,
    outlook.demandQty, outlook.mostLikelyPieces, outlook.bestCasePieces,
  ].filter((value): value is number => value !== undefined && value > 0);
  return values.length ? Math.max(...values) : 1;
}

export function renderRouteWeekSheets(input: {
  zh: boolean;
  productName: string;
  productVersion: string;
  routeId: string;
  review: RouteWeekPlanResult;
  outlook: RouteWeekPlanResult;
  generatedAt: string;
  weekEnd: (weekStart: string) => string;
}): string {
  const scale = reportScale(input.review, input.outlook);
  const scaleLabel = formatOutputUnits(scale);
  return `${sheet(input, input.review, scale, scaleLabel, 1)}${sheet(input, input.outlook, scale, scaleLabel, 2)}`;
}

function sheet(input: {
  zh: boolean;
  productName: string;
  productVersion: string;
  routeId: string;
  generatedAt: string;
  weekEnd: (weekStart: string) => string;
}, plan: RouteWeekPlanResult, scale: number, scaleLabel: string, page: number): string {
  const zh = input.zh;
  const review = plan.role === "review";
  const title = review ? (zh ? "上周回顾" : "Last week review") : (zh ? "下周计划" : "Next week plan");
  const key = keyStation(plan);
  const demand = plan.demandQty;
  const margin = plan.planMargin;
  const decision = review ? reviewDecision(plan, zh) : outlookDecision(plan, zh);
  return `<article class="sheet ${review ? "review" : "outlook"}" data-report-page="${plan.role}" aria-label="${escapeHtml(title)}">
    <header class="report-header">
      <div>
        <p class="kicker">CAPACITY ASSESSMENT / INTERNAL</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(input.productName)} · ${escapeHtml(input.routeId)} · ${zh ? "路线等效良品件" : "Finished-good pieces"}</p>
      </div>
      <div class="report-id"><strong>${zh ? "内部报告" : "Internal report"}</strong><span class="draft">${zh ? "本地草稿 · 非客户承诺" : "Local draft"}</span><br>${escapeHtml(input.generatedAt)}<br>${zh ? `第 ${page} / 2 页` : `Page ${page} / 2`}</div>
    </header>
    <div class="meta">
      <div class="meta-item"><small>${zh ? "产品 / 版本" : "Product / version"}</small><strong>${escapeHtml(input.productName)} / ${escapeHtml(input.productVersion || "-")}</strong></div>
      <div class="meta-item"><small>${zh ? "生产周" : "Production week"}</small><strong>${escapeHtml(plan.weekStartDate)} – ${escapeHtml(input.weekEnd(plan.weekStartDate))}</strong></div>
      <div class="meta-item"><small>${zh ? "数据状态" : "Data status"}</small><strong>${escapeHtml(statusLabel(plan, zh))}</strong></div>
    </div>
    <section class="section">
      <div class="section-head"><h2>${zh ? "决策结论" : "Decision"}</h2><span>${zh ? "两页同一指标顺序" : "Same metric order on both pages"}</span></div>
      <div class="decision ${review ? "" : "forecast-decision"}">
        <div class="decision-main"><span class="decision-label">${escapeHtml(decision.label)}</span><strong>${escapeHtml(decision.title)}</strong><p>${escapeHtml(decision.body)}</p></div>
        <div class="decision-gap"><small>${escapeHtml(review ? (zh ? "计划余量 · ML − 需求" : "Plan margin · ML − demand") : (zh ? "计划余量 · ML − 需求" : "Plan margin · ML − demand"))}</small><strong>${signedPieces(margin, zh)}</strong><span>${pieces(plan.mostLikelyPieces)} − ${pieces(demand)}</span></div>
      </div>
      <div class="metrics">
        <div class="metric"><small>${zh ? "需求" : "Demand"}</small><strong>${pieces(demand)} ${zh ? "件" : "pcs"}</strong></div>
        <div class="metric"><small>${zh ? "排产计划 · ML" : "Plan · ML"}</small><strong>${pieces(plan.mostLikelyPieces)} ${zh ? "件" : "pcs"}</strong><em class="${(margin ?? 0) < 0 ? "negative" : ""}">${margin === undefined ? (zh ? "路线未齐" : "Route incomplete") : (zh ? `对需求 ${signed(margin)}` : `vs demand ${signed(margin)}`)}</em></div>
        <div class="metric"><small>${review ? (zh ? "本周结果 · Actual" : "Actual") : (zh ? "结果 · Actual" : "Actual")}</small><strong>${plan.actualPieces === undefined ? "—" : `${pieces(plan.actualPieces)} ${zh ? "件" : "pcs"}`}</strong><em>${escapeHtml(plan.actualPieces === undefined ? (zh ? "留空" : "Blank") : "")}</em></div>
        <div class="metric"><small>${zh ? "Best case 挑战" : "Best case"}</small><strong>${pieces(plan.bestCasePieces)} ${zh ? "件" : "pcs"}</strong><em>${zh ? "非默认排产目标" : "Not the default plan"}</em></div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>${zh ? "需求 / 计划 / 结果 / 挑战" : "Demand / plan / actual / best"}</h2><span>${zh ? `两页同用 0–${scaleLabel} 件` : `Shared scale 0–${scaleLabel}`}</span></div>
      <div class="compare" style="--demand:${percentOf(demand, scale)}" role="img" aria-label="${escapeHtml(compareLabel(plan, zh))}">
        ${bar(zh ? "需求" : "Demand", "demand", demand, scale)}
        ${bar(zh ? "计划 · ML" : "Plan · ML", "likely", plan.mostLikelyPieces, scale)}
        ${bar(zh ? "结果 · Actual" : "Actual", "outcome", plan.actualPieces, scale)}
        ${bar(zh ? "挑战 · Best" : "Best", "best", plan.bestCasePieces, scale)}
        <div class="legend">${zh ? "竖线为本页需求。两页横轴刻度一致。ML 不写入 Actual。" : "The marker is this page's demand. Both pages share the scale. ML is not copied into Actual."}</div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>${zh ? "工序能力对照" : "Operation comparison"}</h2><span>${zh ? "按每件成品所需件数折成成品" : "Converted by units per finished product"}</span></div>
      <div class="table-scroll"><table>
        <thead><tr><th>${zh ? "工序" : "Operation"}</th><th>${zh ? "计划 · ML" : "Plan · ML"}</th><th>${zh ? "结果 · Actual" : "Actual"}</th><th>${zh ? "挑战 · Best" : "Best"}</th><th>${zh ? "用量" : "Units"}</th></tr></thead>
        <tbody>${plan.operations.map(operation => `<tr>
          <td class="${operation.isPlanBottleneck ? "bottleneck" : ""}">${escapeHtml(operation.operationId)}${operation.isPlanBottleneck ? (zh ? " · 计划瓶颈" : " · plan bottleneck") : ""}</td>
          <td>${pieces(operation.mostLikelyFinishedPieces)}</td>
          <td class="${operation.isActualBottleneck ? "bottleneck" : ""}">${pieces(operation.actualFinishedPieces)}</td>
          <td>${pieces(operation.bestFinishedPieces)}</td>
          <td>${operation.unitsPerFinishedProduct === undefined ? "—" : formatNumber(operation.unitsPerFinishedProduct)}</td>
        </tr>`).join("") || `<tr><td colspan="5">—</td></tr>`}</tbody>
      </table></div>
    </section>
    <section class="section">
      <div class="section-head"><h2>${zh ? "关键参数" : "Key parameters"} · ${escapeHtml(key?.operationId ?? "-")}</h2><span>${zh ? "计划列来自该周账；实际列只在有完整同周实绩时填写" : "Plan comes from this week's ledger"}</span></div>
      <div class="spq">
        ${spq(zh ? "SA · 时间开动率" : "SA", zh ? "计划 · 含休息" : "Plan · with breaks", rate(key?.withBreaksSa), zh ? "实际 · Actual" : "Actual", rate(review ? plan.actualSa : undefined), key?.shareRule ?? "")}
        ${spq(zh ? "P · 节拍达成率" : "P", zh ? "计划 · 已发布" : "Published plan", key && !key.mixedParameters ? rate(key.performanceRate) : (key?.mixedParameters ? (zh ? "按日取版本" : "By day") : "—"), zh ? "实际 · Actual" : "Actual", rate(review ? plan.actualPerformanceRate : undefined), key?.mixedParameters ? key.parameterIds.join(" · ") : (key?.standardCycleSec === undefined ? "" : `CT ${formatNumber(key.standardCycleSec, 1)}s`))}
        ${spq(zh ? "Q · 良品率" : "Q", zh ? "计划 · 已发布" : "Published plan", key && !key.mixedParameters ? rate(key.qualityRate) : (key?.mixedParameters ? (zh ? "按日取版本" : "By day") : "—"), zh ? "实际 · Actual" : "Actual", rate(review ? plan.actualQualityRate : undefined), key?.piecesPerCycle === undefined ? "" : (zh ? `每循环 ${formatNumber(key.piecesPerCycle)} 件` : `${formatNumber(key.piecesPerCycle)} pcs/cycle`))}
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>${zh ? "周期补充信息" : "Week notes"}</h2><span>${escapeHtml(plan.shareNote)}</span></div>
      <div class="table-scroll"><table>
        <thead><tr><th>${zh ? "工站" : "Station"}</th><th>${zh ? "原周账 Best" : "Native Best"}</th><th>${zh ? "原周账 ML" : "Native ML"}</th><th>${zh ? "份额规则" : "Share rule"}</th><th>${zh ? "参数" : "Parameters"}</th></tr></thead>
        <tbody>${plan.stations.map(station => `<tr>
          <td>${escapeHtml(station.operationId)} / ${escapeHtml(station.stationId)}</td>
          <td>${pieces(station.nativeBestPieces)}</td>
          <td>${pieces(station.nativeMostLikelyPieces)}</td>
          <td>${escapeHtml(station.shareRule)}</td>
          <td>${station.parameterIds.length ? escapeHtml(station.parameterIds.join(", ")) : "—"}</td>
        </tr>`).join("") || `<tr><td colspan="5">—</td></tr>`}</tbody>
      </table></div>
      ${plan.reasons.length ? `<div class="evidence"><strong>${zh ? "缺口" : "Gaps"}</strong> ${escapeHtml(plan.reasons.join("；"))}</div>` : ""}
      ${plan.actualBlankReason ? `<div class="evidence"><strong>Actual</strong> ${escapeHtml(plan.actualBlankReason)}</div>` : ""}
    </section>
    <section class="section basis"><strong>${zh ? "口径" : "Basis"}</strong> ${zh
      ? "Best 不乘 P、Q。Most likely 只乘当日已发布的 P、Q 一次。计划余量 = ML 路线成品件数 − 需求。没有历史计划快照时标为当前参数回算。本机草稿不是整周实绩归档。"
      : "Best ignores P and Q. Most likely multiplies the published P and Q once. Plan margin is route ML minus demand. Without a historical snapshot this is a current-parameter recalculation. A local draft is not a full-week actual archive."}
      ${plan.planBasis === "currentParameterRecalc" ? (zh ? " 本页计划为当前参数回算。" : " This page is a current-parameter recalculation.") : plan.planBasis === "snapshot" ? (zh ? " 本页计划来自排产快照。" : " This page uses a planning snapshot.") : ""}
    </section>
    <footer class="footer"><span>${zh ? "内部评估 · 非客户产能承诺" : "Internal only"}</span><span>${zh ? `第 ${page} / 2 页` : `Page ${page} / 2`}</span></footer>
  </article>`;
}

function keyStation(plan: RouteWeekPlanResult): RouteWeekStationResult | undefined {
  const operationId = plan.planBottleneckOperationId ?? plan.operations.find(item => item.stationCount > 0)?.operationId;
  const members = plan.stations.filter(station => station.operationId === operationId && station.included);
  if (!members.length) return plan.stations.find(station => station.included) ?? plan.stations[0];
  return members.reduce((selected, station) => (station.nativeMostLikelyRaw ?? Infinity) < (selected.nativeMostLikelyRaw ?? Infinity) ? station : selected);
}

function reviewDecision(plan: RouteWeekPlanResult, zh: boolean): { label: string; title: string; body: string } {
  if (!plan.calculable) {
    return {
      label: zh ? "路线计划未齐" : "Route plan incomplete",
      title: zh ? "不显示路线件数" : "Route pieces stay blank",
      body: plan.reasons[0] ?? (zh ? "缺少周账、份额或用量。" : "A ledger, share or quantity is missing."),
    };
  }
  const gap = plan.planMargin ?? 0;
  return {
    label: gap < 0 ? (zh ? "Most likely 低于需求" : "Most likely is below demand") : (zh ? "Most likely 覆盖需求" : "Most likely covers demand"),
    title: plan.planBottleneckOperationId ? (zh ? `${plan.planBottleneckOperationId} 是计划瓶颈` : `${plan.planBottleneckOperationId} is the plan bottleneck`) : (zh ? "计划已汇总" : "Plan is complete"),
    body: plan.actualPieces === undefined
      ? (zh ? "Actual 留空。计划余量不是实际余量。" : "Actual stays blank. Plan margin is not an actual gap.")
      : (zh ? "Actual 来自完整同周实绩，不由 Most likely 复制。" : "Actual comes from a complete same-week record."),
  };
}

function outlookDecision(plan: RouteWeekPlanResult, zh: boolean): { label: string; title: string; body: string } {
  if (!plan.calculable) return reviewDecision(plan, zh);
  const gap = plan.planMargin ?? 0;
  return {
    label: gap < 0 ? (zh ? "计划未覆盖需求" : "Plan does not cover demand") : (zh ? "计划覆盖需求" : "Plan covers demand"),
    title: plan.planBottleneckOperationId ? (zh ? `${plan.planBottleneckOperationId} 是计划瓶颈` : `${plan.planBottleneckOperationId} is the plan bottleneck`) : (zh ? "计划已汇总" : "Plan is complete"),
    body: zh ? "尚未发生的 Actual 留空。Most likely 是计划线，也是产出预测，但不写入结果列。" : "Future Actual stays blank. Most likely is the plan and the forecast, and it is not copied into Actual.",
  };
}

function statusLabel(plan: RouteWeekPlanResult, zh: boolean): string {
  const basis = plan.planBasis === "snapshot" ? (zh ? "排产快照" : "Planning snapshot")
    : plan.planBasis === "currentParameterRecalc" ? (zh ? "当前参数回算" : "Current-parameter recalculation")
    : (zh ? "缺少周账" : "Ledger missing");
  const actual = plan.role === "outlook" ? (zh ? "Actual 未发生" : "Actual not started")
    : plan.actualPieces === undefined ? (zh ? "Actual 无完整实绩" : "Actual not evidenced")
    : (zh ? "Actual 有同周实绩" : "Actual evidenced");
  return `${basis} · ${actual}`;
}

function compareLabel(plan: RouteWeekPlanResult, zh: boolean): string {
  return zh
    ? `需求 ${pieces(plan.demandQty)}，计划 ${pieces(plan.mostLikelyPieces)}，Actual ${pieces(plan.actualPieces)}，Best ${pieces(plan.bestCasePieces)}`
    : `Demand ${pieces(plan.demandQty)}, plan ${pieces(plan.mostLikelyPieces)}, actual ${pieces(plan.actualPieces)}, best ${pieces(plan.bestCasePieces)}`;
}

function bar(label: string, kind: string, value: number | undefined, scale: number): string {
  return `<div class="compare-row"><span>${escapeHtml(label)}</span><div class="bar-track"><span class="bar ${kind}" style="width:${percentOf(value, scale)}"></span></div><strong>${pieces(value)}</strong></div>`;
}

function percentOf(value: number | undefined, scale: number): string {
  if (value === undefined || scale <= 0) return "0%";
  return `${Math.max(0, Math.min(100, value / scale * 100))}%`;
}

function spq(title: string, left: string, leftValue: string, right: string, rightValue: string, note: string): string {
  return `<div><small>${escapeHtml(title)}</small><div class="spq-values"><div><span>${escapeHtml(left)}</span><strong>${escapeHtml(leftValue)}</strong></div><div><span>${escapeHtml(right)}</span><strong>${escapeHtml(rightValue)}</strong></div></div>${note ? `<p class="spq-note">${escapeHtml(note)}</p>` : ""}</div>`;
}

function pieces(value: number | undefined): string {
  return value === undefined ? "—" : formatOutputUnits(value);
}

function signedPieces(value: number | undefined, zh: boolean): string {
  if (value === undefined) return "—";
  return `${signed(value)} ${zh ? "件" : "pcs"}`;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${formatOutputUnits(value)}`;
}

function rate(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${formatNumber(value * 100, 1)}%`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
}
