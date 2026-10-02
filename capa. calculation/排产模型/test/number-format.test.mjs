import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatNumber } from "../dist/ui/number-format.js";

describe("UI number formatting", () => {
  it("groups integer demand and output quantities", () => {
    assert.equal(formatNumber(1800), "1,800");
    assert.equal(formatNumber(93600), "93,600");
    assert.equal(formatNumber(1234567), "1,234,567");
  });

  it("keeps the requested decimal precision and sign", () => {
    assert.equal(formatNumber(1234.567), "1,234.567");
    assert.equal(formatNumber(12345.6, 1), "12,345.6");
    assert.equal(formatNumber(-1234.56, 1), "-1,234.6");
    assert.equal(formatNumber(Number.NaN), "-");
  });
});
