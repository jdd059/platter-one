export const TAU = Math.PI * 2;
export function angleAt(x, y, rect) {
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  const radius = Math.hypot(dx, dy);
  // The center is singular; ignore it and re-anchor on leaving this dead zone.
  if (radius < rect.width * 0.09 || radius > rect.width / 2) return null;
  return Math.atan2(dy, dx);
}
export function angularDelta(previous, next) {
  return Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
}
