// Browser-free event harness. This validates controller logic, not Safari rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { angleAt, angularDelta } from '../web/geometry.mjs';

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
  let interval, now = 100;
  class Socket {
    static OPEN = 1; static CLOSING = 2;
    constructor() { this.events = {}; this.readyState = 1; this.bufferedAmount = 0; this.sent = []; Socket.instance = this; }
    addEventListener(name,fn) { this.events[name] = fn; }
    send(json) { this.sent.push(JSON.parse(json)); }
    close() { this.readyState = 3; }
    receive(message) { this.events.message({data:JSON.stringify(message)}); }
  }
  const context = vm.createContext({
    angleAt, angularDelta, URL, URLSearchParams, WebSocket:Socket,
    document:{getElementById:element,querySelector:element,addEventListener:(name,fn) => globalEvents[name] = fn},
    window:{addEventListener:(name,fn) => globalEvents[name] = fn},
    location:{hash:'#token=test',href:'http://localhost:8765/',protocol:'http:',pathname:'/'},
    history:{replaceState() {}}, sessionStorage:{getItem(){return null;},setItem(){}},
    performance:{now:() => now},
    ResizeObserver:class { observe() {} },
    setInterval:fn => interval = fn, setTimeout:fn => timers.push(fn),clearTimeout() {}
  });
  const source = fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
  vm.runInContext(source,context);
  return {element,socket:Socket.instance,event:name => globalEvents[name](),advance:ms => {now += ms; interval();}};
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
