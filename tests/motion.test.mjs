import test from 'node:test';
import assert from 'node:assert/strict';
import {MotionTracker,coastStep,MAX_SPEED} from '../web/geometry.mjs';

test('release estimate preserves direction, bounds speed, and discards stale movement', () => {
  for (const sign of [1,-1]) {
    const motion = new MotionTracker();
    motion.reset(0);
    for (let t=10;t<=80;t+=10) motion.move(sign*0.1,t);
    assert.ok(sign*motion.release(85)>9);
    assert.equal(motion.release(200),0);
    motion.move(sign*3,90);
    assert.ok(Math.abs(motion.release(91))<=MAX_SPEED);
    motion.reset(100);
    assert.equal(motion.release(101),0);
  }
});

test('coast speed decreases and integrated distance is independent of frame rate', () => {
  for(const sign of [1,-1]) {
    const whole = coastStep(sign*12,1);
    for(const frames of [30,60,120]) {
      let velocity=sign*12,distance=0;
      for(let frame=0;frame<frames;frame++) {
        const next=coastStep(velocity,1/frames);
        assert.ok(Math.abs(next.velocity)<Math.abs(velocity));
        velocity=next.velocity;
        distance+=next.radians;
      }
      assert.ok(Math.abs(velocity-whole.velocity)<1e-10);
      assert.ok(Math.abs(distance-whole.radians)<1e-10);
      assert.ok(sign*distance>0);
    }
  }
});
