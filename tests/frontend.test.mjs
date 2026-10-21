// Browser-free event harness. This validates controller logic, not Safari rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { angleAt, angularDelta } from '../web/geometry.mjs';
import { MotionTracker, coastStep, STOP_SPEED, MAX_COAST_MS } from '../web/geometry.mjs';

function setup() {
  class Element {
    constructor() { this.events = {}; this.textContent = ''; this.hidden = false; this.value = '1'; this.style = {setProperty() {}}; this.capture = new Set(); this.attributes = {}; const values = new Set(); this.classList = {add: v => values.add(v),remove: v => values.delete(v),toggle: (v,on) => on ? values.add(v) : values.delete(v),contains: v => values.has(v)}; }
    addEventListener(name, fn) { this.events[name] = fn; }
    fire(name, data = {}) { this.events[name]?.({pointerId:1,pointerType:'touch',clientX:350,clientY:200,timeStamp:100,preventDefault() {},target:this,...data}); }
    getBoundingClientRect() { return {left:0,top:0,width:400,height:400}; }
    setPointerCapture(id) { this.capture.add(id); }
    hasPointerCapture(id) { return this.capture.has(id); }
    releasePointerCapture(id) { this.capture.delete(id); }
    setAttribute(key,value) { this.attributes[key] = value; }
  }
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id,new Element()); return elements.get(id); };
  const globalEvents = {};
  const timers = [];
  let interval, animation, now = 100;
  class Socket {
    static OPEN = 1; static CLOSING = 2;
    constructor() { this.events = {}; this.readyState = 1; this.bufferedAmount = 0; this.sent = []; Socket.instance = this; }
    addEventListener(name,fn) { this.events[name] = fn; }
    send(json) { this.sent.push(JSON.parse(json)); }
    close() { this.readyState = 3; }
    receive(message) { this.events.message({data:JSON.stringify(message)}); }
  }
  const context = vm.createContext({
    angleAt, angularDelta, MotionTracker, coastStep, STOP_SPEED, MAX_COAST_MS, URL, URLSearchParams, WebSocket:Socket,
    document:{getElementById:element,querySelector:element,addEventListener:(name,fn) => globalEvents[name] = fn},
    window:{addEventListener:(name,fn) => globalEvents[name] = fn},
    location:{hash:'#token=test',href:'http://localhost:8765/',protocol:'http:',pathname:'/'},
    history:{replaceState() {}}, sessionStorage:{getItem(){return null;},setItem(){}},
    performance:{now:() => now},
    ResizeObserver:class { observe() {} },
    requestAnimationFrame:fn => { animation = fn; return 1; }, cancelAnimationFrame:() => { animation = null; },
    setInterval:fn => interval = fn, setTimeout:fn => timers.push(fn),clearTimeout() {}
  });
  const source = fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  vm.runInContext(source,context);
  return {element,socket:Socket.instance,event:name => globalEvents[name](),advance:ms => {now += ms; interval();},frame:ms => {now += ms; const fn = animation; animation = null; fn?.(now);}};
}

test('touch rotation and release produce ordered network input without browser audio', () => {
  const {element,socket} = setup();
  const record = element('record');
  record.fire('pointerdown');
  assert.equal(socket.sent.length,0);
  socket.receive({type:'hello',output:'midi'});
  record.fire('pointerdown');
  record.fire('pointermove',{clientX:200,clientY:350,timeStamp:110});
  record.fire('pointerup');
  assert.deepEqual(socket.sent.map(m => m.type),['down','move','up']);
  assert.equal(socket.sent[1].radians,Math.PI/2);
  assert.equal(element('status').textContent,'Bridge online · Mixxx unverified');
});

test('extra fingers are ignored and pointer cancellation releases owner', () => {
  const {element,socket} = setup();
  socket.receive({type:'hello',output:'dry-run'});
  element('record').fire('pointerdown');
  element('record').fire('pointerdown',{pointerId:2});
  element('record').fire('pointerup',{pointerId:2});
  assert.equal(socket.sent.length,1);
  element('record').fire('pointercancel');
  assert.deepEqual(socket.sent.map(m => m.type),['down','up']);
  assert.equal(element('record').classList.contains('held'),false);
});

test('deck switch releases the old deck before new touch', () => {
  const {element,socket} = setup();
  socket.receive({type:'hello',output:'dry-run'});
  element('record').fire('pointerdown');
  element('deck').value = '2';
  element('deck').fire('change');
  element('record').fire('pointerdown');
  assert.deepEqual(socket.sent,[{type:'down',deck:1},{type:'up',deck:1},{type:'down',deck:2}]);
});

test('stationary hold stays alive and focus loss sends release', () => {
  const {element,socket,event,advance} = setup();
  socket.receive({type:'hello',output:'dry-run'});
  element('record').fire('pointerdown');
  advance(100);
  assert.equal(socket.sent[1].type,'hold');
  assert.equal(socket.sent[2].type,'ping');
  event('blur');
  assert.equal(socket.sent.at(-1).type,'up');
});

test('congestion releases local ownership and closes rather than queues more input', () => {
  const {element,socket} = setup();
  socket.receive({type:'hello',output:'dry-run'});
  element('record').fire('pointerdown');
  socket.bufferedAmount = 1025;
  element('record').fire('pointermove',{clientX:200,clientY:350,timeStamp:110});
  assert.equal(socket.readyState,3);
  assert.equal(element('record').classList.contains('held'),false);
  assert.deepEqual(socket.sent.map(m => m.type),['down']);
});

test('switching to half platter releases and updates the selected layout', () => {
  const {element,socket} = setup();
  socket.receive({type:'hello',output:'dry-run'});
  element('record').fire('pointerdown');
  element('half').fire('click');
  assert.equal(socket.sent.at(-1).type,'up');
  assert.equal(element('stage').classList.contains('half'),true);
  assert.equal(element('half').attributes['aria-pressed'],'true');
});

test('flick lift continues real movement and retouch catches it before new touch', () => {
  const {element,socket,frame,advance} = setup();
  socket.receive({type:'hello',output:'dry-run'});
  const record = element('record');
  record.fire('pointerdown');
  record.fire('pointermove',{clientX:200,clientY:350,timeStamp:120});
  record.fire('pointerup',{timeStamp:121});
  assert.equal(element('gesture').textContent,'PREVIEW / COASTING');
  assert.deepEqual(socket.sent.map(m=>m.type),['down','move']);
  frame(16);
  assert.equal(socket.sent.at(-1).type,'move');
  assert.ok(socket.sent.at(-1).radians>0);
  advance(100);
  assert.equal(socket.sent.at(-2).type,'hold');
  record.fire('pointerdown',{timeStamp:232});
  assert.deepEqual(socket.sent.slice(-2),[{type:'up',deck:1},{type:'down',deck:1}]);
});

test('inertia can be disabled and stale movement cannot start a coast', () => {
  for (const enabled of [true,false]) {
    const {element,socket} = setup();
    socket.receive({type:'hello',output:'dry-run'});
    if (!enabled) {
      element('inertia').checked = false;
      element('inertia').fire('change');
    }
    element('record').fire('pointerdown');
    element('record').fire('pointermove',{clientX:200,clientY:350,timeStamp:120});
    element('record').fire('pointerup',{timeStamp:enabled?250:121});
    assert.equal(socket.sent.at(-1).type,'up');
  }
});

test('cancellation and focus loss do not coast; long animation gaps release without catch-up', () => {
  const {element,socket,frame,event} = setup();
  socket.receive({type:'hello',output:'dry-run'});
  const flick = () => {
    element('record').fire('pointerdown');
    element('record').fire('pointermove',{clientX:200,clientY:350,timeStamp:120});
  };
  flick();
  element('record').fire('pointercancel',{timeStamp:121});
  assert.equal(socket.sent.at(-1).type,'up');
  flick();
  element('record').fire('pointerup',{timeStamp:121});
  const count = socket.sent.length;
  frame(300);
  assert.equal(socket.sent.length,count+1);
  assert.equal(socket.sent.at(-1).type,'up');
  flick();
  element('record').fire('pointerup',{timeStamp:121});
  event('blur');
  assert.equal(socket.sent.at(-1).type,'up');
});

test('coast decays to release, and deck change releases a coasting old deck', () => {
  const {element,socket,frame} = setup();
  socket.receive({type:'hello',output:'dry-run'});
  const flick = () => {
    element('record').fire('pointerdown');
    element('record').fire('pointermove',{clientX:200,clientY:350,timeStamp:120});
    element('record').fire('pointerup',{timeStamp:121});
  };
  flick();
  for(let i=0;i<240;i++) frame(16);
  assert.equal(socket.sent.at(-1).type,'up');
  flick();
  element('deck').value = '2';
  element('deck').fire('change');
  assert.deepEqual(socket.sent.at(-1),{type:'up',deck:1});
});
