import assert from "node:assert/strict";
import { it } from "node:test";
import { buildRnrShiftBreakdown } from "../dist/engine/rnr-shift-breakdown.js";

const shifts = [
  { startMinute: 0, endMinute: 60, label: "day" },
  { startMinute: 60, endMinute: 120, label: "night" },
];
const event = (id, kind, startMinute, endMinute, extra = {}) => ({
  id, kind, startMinute, endMinute, stationId: "station-a", productId: "A", source: "runRate", ...extra,
});

it("splits observed minutes at the shift boundary and keeps recorded quantities exact", () => {
  const rows = buildRnrShiftBreakdown({ shifts,
    planned: [event("plan", "production", 0, 120)],
    actual: [event("day-prod", "production", 0, 50, { okQty: 9, nokQty: 1 }),
      event("day-stop", "equipmentFailure", 50, 60),
      event("night-prod", "production", 60, 100, { okQty: 8, nokQty: 0 })],
  });
  assert.deepEqual(rows.map(row => [row.plannedProductionMinutes, row.actualProductionMinutes,
    row.actualNonProductionMinutes, row.unrecordedMinutes, row.okQty, row.nokQty]), [
    [60, 50, 10, 0, 9, 1], [60, 40, 0, 20, 8, 0],
  ]);
});

it("does not invent OK/NOK for a production event spanning two shifts", () => {
  const rows = buildRnrShiftBreakdown({ shifts,
    planned: [event("plan", "production", 0, 120)],
    actual: [event("cross", "production", 30, 90, { okQty: 12, nokQty: 2 })],
  });
  assert.deepEqual(rows.map(row => row.actualProductionMinutes), [30, 30]);
  assert.deepEqual(rows.map(row => row.okQty), [null, null]);
  assert.deepEqual(rows.map(row => row.unallocatedProductionEventIds), [["cross"], ["cross"]]);
});
