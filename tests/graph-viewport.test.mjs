import test from "node:test";
import assert from "node:assert/strict";
import {
  clampGraphZoom,
  directionalRectAnchor,
  wheelPanDelta,
} from "../scripts/graph-viewport.mjs";

const rect = { x: 100, y: 100, width: 200, height: 100 };

test("zoom reaches 20% and remains capped at 200%", () => {
  assert.equal(clampGraphZoom(0.05), 0.2);
  assert.equal(clampGraphZoom(0.4), 0.4);
  assert.equal(clampGraphZoom(3), 2);
});

test("connection follows the relative direction around the node perimeter", () => {
  assert.deepEqual(directionalRectAnchor(rect, { x: 200, y: 400 }), {
    x: 200,
    y: 200,
  });
  assert.deepEqual(directionalRectAnchor(rect, { x: 200, y: 0 }), {
    x: 200,
    y: 100,
  });
  assert.deepEqual(directionalRectAnchor(rect, { x: 500, y: 150 }), {
    x: 300,
    y: 150,
  });
  assert.deepEqual(directionalRectAnchor(rect, { x: 0, y: 150 }), {
    x: 100,
    y: 150,
  });
});

test("connections arriving from different lower angles do not share one dock", () => {
  const lowerLeft = directionalRectAnchor(rect, { x: 100, y: 400 });
  const lowerRight = directionalRectAnchor(rect, { x: 300, y: 400 });
  assert.equal(lowerLeft.y, 200);
  assert.equal(lowerRight.y, 200);
  assert.ok(lowerLeft.x < lowerRight.x);
});

test("wheel deltas support pixels, lines and shift-horizontal scrolling", () => {
  assert.deepEqual(
    wheelPanDelta({ deltaX: 4, deltaY: 8, deltaMode: 0, shiftKey: false }),
    { x: 4, y: 8 },
  );
  assert.deepEqual(
    wheelPanDelta({ deltaX: 0, deltaY: 2, deltaMode: 1, shiftKey: false }),
    { x: 0, y: 32 },
  );
  assert.deepEqual(
    wheelPanDelta({ deltaX: 0, deltaY: 12, deltaMode: 0, shiftKey: true }),
    { x: 12, y: 0 },
  );
});
