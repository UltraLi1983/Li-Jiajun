import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderRouteCapacityChart } from "../dist/ui/route-capacity-chart.js";

const basePlan = {
  demandQty: 1800,
  operations: [
    { operationId: "op10", bestFinishedPieces: 2070, mostLikelyFinishedPieces: 2008, unitsPerFinishedProduct: 1 },
    { operationId: "op20", bestFinishedPieces: 2070, mostLikelyFinishedPieces: 2070, unitsPerFinishedProduct: 1 },
    { operationId: "op30", bestFinishedPieces: 1920, mostLikelyFinishedPieces: 1862, unitsPerFinishedProduct: 1 },
  ],
  stations: [
    { operationId: "op20", stationId: "OP20A", included: true, nativeMostLikelyRaw: 2070, shareApplied: 0.7 },
    { operationId: "op20", stationId: "OP20B", included: true, nativeMostLikelyRaw: 2070, shareApplied: 0.3 },
  ],
};

describe("route capacity chart", () => {
  it("shows process totals and the two-station ML composition without putting detail inside the bar", () => {
    const html = renderRouteCapacityChart(basePlan, new Map([["op10", "OP10 压铸"], ["op20", "OP20 机加工"], ["op30", "OP30 装配"]]), true);
    assert.match(html, /route-chart-likely-value">2,070<\/text>/);
    assert.match(html, /route-chart-detail">1,449 \+ 621<\/text>/);
    assert.match(html, /route-chart-best-inside">2,070<\/text>/);
    assert.match(html, /周需求.*1,800/);
    assert.equal((html.match(/class="route-chart-best"/g) ?? []).length, 3);
    const op20BarTop = Number(html.match(/<rect x="\d+" y="([\d.]+)" width="100"[^>]*class="route-chart-best"/g)?.[1]?.match(/y="([\d.]+)"/)?.[1]);
    const detailBaseline = Number(html.match(/y="([\d.]+)" text-anchor="middle" class="route-chart-detail">1,449 \+ 621/)?.[1]);
    assert.ok(detailBaseline + 5 < op20BarTop, "ML composition must stay above the Best bar");
  });

  it("keeps incomplete operations blank instead of rendering a zero bar", () => {
    const plan = { ...basePlan, operations: [basePlan.operations[0], { operationId: "op20" }], stations: [] };
    const html = renderRouteCapacityChart(plan, new Map(), true);
    assert.equal((html.match(/class="route-chart-best"/g) ?? []).length, 1);
    assert.match(html, /待补齐/);
    assert.doesNotMatch(html, /class="route-chart-detail"/);
  });

  it("places a long Best number outside the bar without truncating it", () => {
    const plan = { ...basePlan, operations: [{ operationId: "big", bestFinishedPieces: 1234567890, mostLikelyFinishedPieces: 1234567000 }], stations: [] };
    const html = renderRouteCapacityChart(plan, new Map(), true);
    assert.match(html, /route-chart-best-outside">1,234,567,890<\/text>/);
  });

  it("moves a low ML point label to the side of the Best bar", () => {
    const plan = { ...basePlan, operations: [{ operationId: "op20", bestFinishedPieces: 2070, mostLikelyFinishedPieces: 600, unitsPerFinishedProduct: 1 }], stations: basePlan.stations.map(station => ({ ...station, nativeMostLikelyRaw: 600 })) };
    const html = renderRouteCapacityChart(plan, new Map(), true);
    assert.match(html, /text-anchor="start" class="route-chart-likely-value">600<\/text>/);
    assert.match(html, /text-anchor="start" class="route-chart-detail">420 \+ 180<\/text>/);
  });

  it("explains why no chart is available when no operation has calculated pieces", () => {
    const html = renderRouteCapacityChart({ operations: [{ operationId: "op10" }], stations: [] }, new Map(), true);
    assert.match(html, /尚无可绘制的工序周能力/);
    assert.doesNotMatch(html, /<svg/);
  });
});
