import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { angularDelta, angleAt } from '../web/geometry.mjs';

function mapping() {
  const calls = [];
  let tick, now = 1000;
  const context = vm.createContext({
    Date: { now: () => now },
    engine: {
      scratchEnable: (...args) => calls.push(['enable', ...args]),
      scratchTick: (...args) => calls.push(['tick', ...args]),
      scratchDisable: (...args) => calls.push(['disable', ...args]),
      beginTimer: (ms, cb) => { tick = cb; return 42; },
      stopTimer: id => calls.push(['stopTimer', id])
    }
  });
  vm.runInContext(fs.readFileSync(new URL('../mixxx/Platter-One-scripts.js', import.meta.url), 'utf8'), context);
  context.PlatterOne.init();
  return { p: context.PlatterOne, calls, expire: (ms) => { now += ms; tick(); } };
}

test('clockwise rotation is positive and crosses angular seam without a jump', () => {
  assert.ok(angularDelta(3.13, -3.13) > 0);
  assert.ok(Math.abs(angularDelta(3.13, -3.13)) < 0.03);
  assert.ok(angularDelta(-3.13, 3.13) < 0);
  assert.equal(angularDelta(0, Math.PI / 2), Math.PI / 2);
});
test('geometry uses the actual offscreen center and rejects center and outside', () => {
  const rect = {left: -150, top: 100, width: 600, height: 600};
  assert.equal(angleAt(150, 150, rect), -Math.PI / 2);
  assert.equal(angleAt(150, 400, rect), null);
  assert.equal(angleAt(150, 0, rect), null);
});
test('Mixxx mapping enables once, sends signed ticks, releases and ignores late motion', () => {
  const {p, calls} = mapping();
  p.touch(0, 0, 127, 0x90);
  p.touch(0, 0, 127, 0x90);
  p.move(0, 0x10, 70, 0xB0);
  p.move(0, 0x10, 59, 0xB0);
  p.touch(0, 0, 0, 0x90);
  p.move(0, 0x10, 127, 0xB0);
  assert.deepEqual(calls, [
    ['enable',1,2048,33+1/3,1/8,1/256,false],
    ['tick',1,6], ['tick',1,-5], ['disable',1,true]
  ]);
});
test('Mixxx stationary heartbeat preserves hold and independent watchdog releases after bridge death', () => {
  const {p, calls, expire} = mapping();
  p.touch(1, 0, 127, 0x91);
  expire(600);
  p.hold(1, 0x11, 127, 0xB1);
  expire(600);
  assert.equal(calls.length, 1);
  expire(151);
  assert.deepEqual(calls.at(-1), ['disable',2,true]);
  p.shutdown();
  assert.deepEqual(calls.at(-1), ['stopTimer',42]);
});
test('note off with nonzero release velocity releases rather than enabling', () => {
  const {p, calls} = mapping();
  p.touch(1, 0, 127, 0x91);
  p.touch(1, 0, 100, 0x81);
  assert.deepEqual(calls.at(-1), ['disable',2,true]);
});

test('XML MIDI bindings dispatch both decks through the real mapping handlers', () => {
  const xml = fs.readFileSync(new URL('../mixxx/Platter-One.midi.xml', import.meta.url), 'utf8');
  const bindings = [...xml.matchAll(/<control>\s*<group>(.*?)<\/group>\s*<key>PlatterOne\.(.*?)<\/key>\s*<status>(.*?)<\/status>\s*<midino>(.*?)<\/midino>\s*<options><Script-Binding\/><\/options>\s*<\/control>/gs)];
  assert.equal(bindings.length, 8);
  const {p, calls} = mapping();
  const messages = [[0x91,0,127], [0xB1,0x10,127], [0xB1,0x10,1], [0xB1,0x11,127], [0x91,0,0]];
  for (const [status,control,value] of messages) {
    const found = bindings.filter(b => Number(b[3]) === status && Number(b[4]) === control);
    assert.equal(found.length, 1);
    const [ , group, handler ] = found[0];
    p[handler](status & 0x0f,control,value,status,group);
  }
  assert.deepEqual(calls, [['enable',2,2048,33+1/3,1/8,1/256,false],['tick',2,63],['tick',2,-63],['disable',2,true]]);
});
