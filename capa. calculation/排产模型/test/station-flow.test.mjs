import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateStationFlow } from "../dist/engine/station-flow.js";

const order = ["casting", "machining", "assembly"];
const stations = [
  { operationId: "casting", stationId: "CAST", finishedPieces: 200 },
  { operationId: "machining", stationId: "M1", finishedPieces: 70 },
  { operationId: "machining", stationId: "M2", finishedPieces: 30 },
  { operationId: "assembly", stationId: "A1", finishedPieces: 30 },
  { operationId: "assembly", stationId: "A2", finishedPieces: 70 },
];
const pair = (fromStationId, toStationId) => ({ fromStationId, toStationId });

describe("station flow", () => {
  it("shares casting but limits machining-to-assembly to confirmed pairs", () => {
    assert.equal(calculateStationFlow(order, stations, []).pieces, 100);
    const policy = { fromOperationId: "machining", toOperationId: "assembly",
      allowedPairs: [pair("M1", "A1"), pair("M2", "A2")] };
    assert.equal(calculateStationFlow(order, stations, [policy]).pieces, 60);
    assert.equal(calculateStationFlow(order, stations, [{ ...policy, allowedPairs: [pair("M1", "A2"), pair("M2", "A1")] }]).pieces, 100);
  });

  it("rejects stale or missing route links instead of assuming full interchangeability", () => {
    assert.match(calculateStationFlow(order, stations, [{ fromOperationId: "casting", toOperationId: "assembly",
      allowedPairs: [pair("CAST", "A1")] }]).issue, /相邻工序/);
    assert.match(calculateStationFlow(order, stations, [{ fromOperationId: "machining", toOperationId: "assembly",
      allowedPairs: [pair("M3", "A1")] }]).issue, /未参与/);
    assert.match(calculateStationFlow(order, stations, [{ fromOperationId: "machining", toOperationId: "assembly",
      allowedPairs: [] }]).issue, /尚未连接/);
  });
});
