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

// Release momentum is estimated from recent physical movement, in radians/second.
export const MAX_SPEED = 35;
export const MIN_FLICK_SPEED = 0.8;
export const STOP_SPEED = 0.15;
export const COAST_SECONDS = 0.55;
export const MAX_COAST_MS = 3500;

export class MotionTracker {
  constructor() { this.reset(0); }
  reset(time) {
    this.time = time;
    this.lastMovement = -Infinity;
    this.velocity = 0;
  }
  move(delta, time) {
    const elapsed = (time - this.time) / 1000;
    this.time = time;
    if (elapsed <= 0) return;
    if (elapsed > 0.15) { this.velocity = 0; return; }
    const speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, delta / elapsed));
    const weight = 1 - Math.exp(-elapsed / 0.025);
    this.velocity += weight * (speed - this.velocity);
    if (Math.abs(delta) > 0.00001) this.lastMovement = time;
  }
  release(time) {
    if (time < this.time || time - this.lastMovement > 80 || Math.abs(this.velocity) < MIN_FLICK_SPEED) return 0;
    return this.velocity;
  }
}

// Exact exponential integration keeps distance consistent at 30/60/120 Hz.
export function coastStep(velocity, seconds) {
  const decay = Math.exp(-seconds / COAST_SECONDS);
  return {radians: velocity * COAST_SECONDS * (1 - decay), velocity: velocity * decay};
}
