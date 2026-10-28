import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSystemTerm } from "../dist/ui/display-label.js";

describe("human-facing system terms", () => {
  it("separates words in enum codes without changing the stored code", () => {
    const kind = "equipmentFailure";
    assert.equal(formatSystemTerm(kind), "Equipment Failure");
    assert.equal(kind, "equipmentFailure");
    assert.equal(formatSystemTerm("plannedStop"), "Planned Stop");
    assert.equal(formatSystemTerm("quality_hold"), "Quality hold");
    assert.equal(formatSystemTerm("rampUp"), "Ramp Up");
  });

  it("leaves station and product identifiers intact", () => {
    assert.equal(formatSystemTerm("OP20A"), "OP20A");
    assert.equal(formatSystemTerm("A-Housing"), "A-Housing");
    assert.equal(formatSystemTerm("R&R"), "R&R");
  });
});
