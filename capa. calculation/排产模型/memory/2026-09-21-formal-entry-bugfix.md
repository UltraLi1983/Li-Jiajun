# Debug Report: Formal UI Entry Bugfix

## Symptom

- Switching formal UI product to `B-Housing` could crash preflight because UI always passed `plannedQuantityByOperation: { "op-a-10": 250 }`.
- Route selector existed but did not drive the main routing configuration view.

## Root Cause

- `src/ui/formal-app.ts` hardcoded Product A operation quantity for all products.
- `buildProductRoutingConfiguration()` only used product / product.routeId and did not accept the currently selected route id.

## Fix

- `buildProductRoutingConfiguration(scenario, productId, routeId?)` now accepts an explicit selected route id.
- Formal UI now calls `buildProductRoutingConfiguration(scenarioState, productId, selectedRouteId())`.
- Formal UI now builds planned quantities from the current routing configuration and matching batch HU policies instead of hardcoding `op-a-10`.
- Operation mock edit now looks up the selected route explicitly.

## Evidence

- `npm run check` passes.
- `npm test` passes: 34 tests, 11 suites, fail 0.
- Reproduction for `B-Housing` now returns business blocker `op-b-10 has no station assignment` instead of throwing missing `op-a-10` HU policy.

## Regression Tests

- `test/readiness-engine.test.mjs`: selected route id builds the selected route view.
- `test/formal-ui-smoke.test.mjs`: formal UI compiled source no longer contains hardcoded Product A planned quantity and includes route/planned quantity helper references.
