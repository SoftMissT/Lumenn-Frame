export const MIN_GRAPH_ZOOM = 0.2;
export const MAX_GRAPH_ZOOM = 2;
export const GRAPH_ZOOM_STEP = 1.25;

export function clampGraphZoom(value) {
  return Math.max(MIN_GRAPH_ZOOM, Math.min(MAX_GRAPH_ZOOM, value));
}

export function wheelPanDelta(event, viewportHeight = 800) {
  const unit =
    event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportHeight : 1;
  let x = event.deltaX * unit;
  let y = event.deltaY * unit;
  if (event.shiftKey && Math.abs(x) < Math.abs(y)) {
    x = y;
    y = 0;
  }
  return { x, y };
}

export function directionalRectAnchor(rect, toward, fallback = "right") {
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const center = {
    x: rect.x + halfWidth,
    y: rect.y + halfHeight,
  };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    if (fallback === "left") return { x: rect.x, y: center.y };
    if (fallback === "top") return { x: center.x, y: rect.y };
    if (fallback === "bottom") return { x: center.x, y: rect.y + rect.height };
    return { x: rect.x + rect.width, y: center.y };
  }

  const scaleX = Math.abs(dx) > 0.001 ? halfWidth / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0.001 ? halfHeight / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}
