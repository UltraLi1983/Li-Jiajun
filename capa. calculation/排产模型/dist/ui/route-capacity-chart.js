import { formatNumber } from "./number-format.js";
function escapeSvg(value) {
    return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function tickStep(maximum) {
    const rough = Math.max(1, maximum * 1.12 / 4);
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    return [1, 2, 5, 10].map(multiplier => multiplier * magnitude)
        .reduce((closest, value) => Math.abs(value - rough) < Math.abs(closest - rough) ? value : closest);
}
function stationDetail(stations, units) {
    if (!units || stations.length < 2 || stations.some(station => !station.included
        || station.nativeMostLikelyRaw === undefined || station.shareApplied === undefined))
        return "";
    return stations.map(station => {
        const pieces = station.nativeMostLikelyRaw * station.shareApplied / units;
        return formatNumber(pieces, Math.abs(pieces - Math.round(pieces)) < 1e-6 ? 0 : 1);
    }).join(" + ");
}
export function renderRouteCapacityChart(plan, labels, zh) {
    const operations = plan?.operations.map(operation => ({
        operationId: operation.operationId,
        label: labels.get(operation.operationId) ?? operation.operationId,
        best: operation.bestFinishedPieces,
        likely: operation.mostLikelyFinishedPieces,
        detail: stationDetail(plan.stations.filter(station => station.operationId === operation.operationId), operation.unitsPerFinishedProduct),
    })) ?? [];
    const values = operations.flatMap(operation => [operation.best, operation.likely]).filter((value) => value !== undefined);
    if (!operations.length || !values.length) {
        return `<section class="overview-section route-chart-section"><h3>${zh ? "工序产能对比" : "Operation capacity comparison"}</h3><p class="note">${zh ? "尚无可绘制的工序周能力；请检查周账、当前生效参数与工序用量。" : "No weekly operation capacity can be plotted yet. Check week ledgers, effective parameters and operation units."}</p></section>`;
    }
    const maxValue = Math.max(...values, plan?.demandQty ?? 0, 1);
    const step = tickStep(maxValue);
    const upper = Math.ceil(maxValue * 1.12 / step) * step;
    const groupWidth = 290;
    const width = Math.max(720, 100 + operations.length * groupWidth);
    const left = 70;
    const right = width - 24;
    const top = 125;
    const bottom = 320;
    const yFor = (value) => bottom - value / upper * (bottom - top);
    const centerFor = (index) => left + (index + 0.5) * (right - left) / operations.length;
    const grid = Array.from({ length: Math.round(upper / step) + 1 }, (_, index) => {
        const value = index * step;
        const y = yFor(value);
        return `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" class="route-chart-grid"/><text x="${left - 10}" y="${y + 4}" text-anchor="end" class="route-chart-axis">${escapeSvg(formatNumber(value))}</text>`;
    }).join("");
    const bars = operations.map((operation, index) => {
        const center = centerFor(index);
        const best = operation.best;
        const likely = operation.likely;
        const barTop = best === undefined ? bottom : yFor(best);
        const height = bottom - barTop;
        const bestText = best === undefined ? "" : formatNumber(best);
        const fitsInside = height >= 40 && bestText.length * 10 <= 90;
        const bestLabel = best === undefined ? "" : `<text x="${center}" y="${fitsInside ? Math.min(bottom - 14, barTop + Math.max(25, height / 2)) : barTop - 8}" text-anchor="middle" class="${fitsInside ? "route-chart-best-inside" : "route-chart-best-outside"}">${escapeSvg(bestText)}</text>`;
        const likelyLabel = likely === undefined ? "" : (() => {
            const detail = operation.detail;
            const detailFits = detail.length <= 22;
            const pointY = yFor(likely);
            const useSideLabel = pointY - barTop > 70;
            const labelX = useSideLabel ? center + 58 : center;
            const anchor = useSideLabel ? "start" : "middle";
            const labelY = useSideLabel ? pointY - 10 : Math.max(44, barTop - (detail && detailFits ? 43 : fitsInside ? 24 : 35));
            const detailY = useSideLabel ? pointY + 9 : labelY + 17;
            return `<text x="${labelX}" y="${labelY}" text-anchor="${anchor}" class="route-chart-likely-value">${escapeSvg(formatNumber(likely))}</text>${detail && detailFits ? `<text x="${labelX}" y="${detailY}" text-anchor="${anchor}" class="route-chart-detail">${escapeSvg(detail)}</text>` : ""}`;
        })();
        return `${best === undefined ? "" : `<rect x="${center - 50}" y="${barTop}" width="100" height="${height}" class="route-chart-best"/>`}${bestLabel}${likelyLabel}
      <text x="${center}" y="348" text-anchor="middle" class="route-chart-operation">${escapeSvg(operation.label)}</text>
      ${best === undefined || likely === undefined ? `<text x="${center}" y="368" text-anchor="middle" class="route-chart-missing">${zh ? "待补齐" : "Incomplete"}</text>` : ""}`;
    }).join("");
    const lineSegments = [];
    let current = [];
    operations.forEach((operation, index) => {
        if (operation.likely === undefined) {
            if (current.length > 1)
                lineSegments.push(`<polyline points="${current.join(" ")}" class="route-chart-likely-line"/>`);
            current = [];
        }
        else
            current.push(`${centerFor(index)},${yFor(operation.likely)}`);
    });
    if (current.length > 1)
        lineSegments.push(`<polyline points="${current.join(" ")}" class="route-chart-likely-line"/>`);
    const dots = operations.map((operation, index) => operation.likely === undefined ? ""
        : `<circle cx="${centerFor(index)}" cy="${yFor(operation.likely)}" r="6" class="route-chart-likely-dot"/>`).join("");
    const demand = plan?.demandQty === undefined ? "" : `<line x1="${left}" x2="${right}" y1="${yFor(plan.demandQty)}" y2="${yFor(plan.demandQty)}" class="route-chart-demand"/>`;
    const description = operations.map(operation => `${operation.label}: Best ${operation.best === undefined ? "missing" : formatNumber(operation.best)}, Most likely ${operation.likely === undefined ? "missing" : formatNumber(operation.likely)}`).join("; ");
    return `<section class="overview-section route-chart-section" aria-labelledby="routeChartHeading">
    <div class="panel-head"><h3 id="routeChartHeading">${zh ? "工序产能对比" : "Operation capacity comparison"}</h3><span class="section-label">${zh ? "成品等效件 / 周" : "Finished-equivalent pcs / week"}</span></div>
    <div class="route-chart-legend"><span class="route-chart-legend-best">${zh ? "挑战 · Best case" : "Best case"}</span><span class="route-chart-legend-likely">${zh ? "计划 · Most likely" : "Most likely"}</span>${plan?.demandQty === undefined ? "" : `<span class="route-chart-legend-demand">${zh ? "周需求" : "Weekly demand"} ${escapeSvg(formatNumber(plan.demandQty))}</span>`}</div>
    <div class="route-chart-wrap"><svg class="route-chart" viewBox="0 0 ${width} 385" style="min-width:${width}px" role="img" aria-labelledby="routeChartTitle routeChartDesc"><title id="routeChartTitle">${zh ? "工序周产能与需求对比" : "Weekly operation capacity versus demand"}</title><desc id="routeChartDesc">${escapeSvg(description)}</desc>
      <text x="8" y="25" class="route-chart-axis">${zh ? "件 / 周" : "pcs / week"}</text>${grid}${demand}${bars}${lineSegments.join("")}${dots}
    </svg></div>
    <p class="note">${zh ? "柱为工序 Best，线为工序 Most likely；工站先按份额计入、再按工序用量折算。多工站明细见下表，路线结果还须考虑工站流转约束。" : "Bars show operation Best, the line shows operation Most likely. Station shares and operation units are applied before aggregation; route results may also be limited by station links."}</p>
  </section>`;
}
