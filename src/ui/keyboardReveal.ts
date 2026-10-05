/** A vertical extent in window coordinates (dp). */
export type VerticalRect = { readonly top: number; readonly bottom: number };

/** Space kept between a revealed field and the edge of the visible area. */
export const REVEAL_MARGIN = 16;

/**
 * The scroll offset that brings `field` inside `viewport` (both measured in
 * the window), or null when it is already fully visible. The field's BOTTOM
 * is kept visible first — that is where a growing multiline field's cursor
 * is while typing — and when the field fits, its top is kept visible too.
 */
export function revealOffset(
  field: VerticalRect,
  viewport: VerticalRect,
  currentOffset: number,
  margin = REVEAL_MARGIN,
): number | null {
  const visibleTop = viewport.top + margin;
  const visibleBottom = viewport.bottom - margin;
  if (field.bottom > visibleBottom) {
    const down = field.bottom - visibleBottom;
    // A field taller than the visible area: show its bottom (the typing position).
    return currentOffset + down;
  }
  if (field.top < visibleTop) return Math.max(0, currentOffset - (visibleTop - field.top));
  return null;
}

type Measurable = {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
};

/** A native view's vertical extent in the window, or null when it cannot be measured. */
export function measureWindowRect(node: Measurable | null): Promise<VerticalRect | null> {
  return new Promise((resolve) => {
    if (!node) return resolve(null);
    node.measureInWindow((_x, y, _width, height) =>
      resolve(Number.isFinite(y) && Number.isFinite(height) ? { top: y, bottom: y + height } : null),
    );
  });
}
