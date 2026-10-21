import { angleAt, angularDelta, MotionTracker, coastStep, STOP_SPEED, MAX_COAST_MS } from './geometry.mjs';

const $ = id => document.getElementById(id);
const record = $('record');
const stage = $('stage');
let socket, connected = false, pointer = null, previous = null, rotation = 0;
let deck = 1, layout = 'full', sensitivity = 1, touchedAt = 0;
let reconnectTimer, lastReply = 0, stopped = false, preview = false;
const motion = new MotionTracker();
let inertia = true, coast = null, animation = null;
const fragment = new URLSearchParams(location.hash.slice(1));
let token = fragment.get('token') || sessionStorage.getItem('platter-token') || '';
if (token) {
  sessionStorage.setItem('platter-token', token);
  history.replaceState(null, '', location.pathname);
}

function status(text, online = false) {
  $('status').textContent = text;
  $('connection').classList.toggle('online', online);
}
function notice(text) {
  $('notice').hidden = !text;
  $('notice').textContent = text;
}
function send(message) {
  if (!connected || socket?.readyState !== WebSocket.OPEN) return false;
  if (socket.bufferedAmount > 1024) {
    disconnect('Connection delayed. Lift and reconnect.');
    return false;
  }
  socket.send(JSON.stringify(message));
  return true;
}
function rotate(radians) {
  rotation = (rotation + radians * 180 / Math.PI) % 360;
  $('vinyl').style.transform = `rotate(${rotation}deg)`;
}
function move(radians) {
  const scaled = radians * sensitivity;
  const parts = Math.max(1, Math.ceil(Math.abs(scaled) / Math.PI));
  for (let part = 0; part < parts; part++) {
    if (!send({ type: 'move', deck, radians: scaled / parts })) return false;
  }
  rotate(radians);
  return true;
}
function animateCoast(time) {
  animation = null;
  if (!coast) return;
  const elapsed = (time - coast.time) / 1000;
  // Stop after a suspended frame instead of sending a catch-up burst.
  if (!connected || elapsed > 0.15 || time - coast.start > MAX_COAST_MS) {
    release();
    return;
  }
  if (elapsed > 0) {
    const next = coastStep(coast.velocity, elapsed);
    coast.velocity = next.velocity;
    coast.time = time;
    if (!move(next.radians)) return;
    if (Math.abs(next.velocity) < STOP_SPEED) {
      release();
      return;
    }
  }
  animation = requestAnimationFrame(animateCoast);
}
function release(transmit = true, allowCoast = false, time = performance.now()) {
  const id = pointer;
  const wasActive = id !== null || coast !== null;
  if (animation !== null) cancelAnimationFrame(animation);
  animation = null;
  coast = null;
  const velocity = allowCoast && inertia && connected && id !== null ? motion.release(time) : 0;
  pointer = null;
  previous = null;
  record.classList.remove('held');
  $('gesture').textContent = 'READY TO TOUCH';
  if (velocity) {
    // Keep the bridge touch lease while synthetic movement drives the real mapping.
    coast = {velocity, time: performance.now(), start: performance.now()};
    $('gesture').textContent = preview ? 'PREVIEW / COASTING' : 'COASTING';
    animation = requestAnimationFrame(animateCoast);
  } else if (transmit && wasActive) {
    send({ type: 'up', deck });
  }
  if (id !== null && record.hasPointerCapture(id)) record.releasePointerCapture(id);
}
function disconnect(reason) {
  release(false);
  connected = false;
  record.classList.add('disabled');
  status(reason);
  notice(reason);
  socket?.close();
}
function connect() {
  clearTimeout(reconnectTimer);
  if (!token) {
    record.classList.add('disabled');
    return;
  }
  if (socket && socket.readyState < WebSocket.CLOSING) return;
  stopped = false;
  status('Connecting…');
  const url = new URL('/ws', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  socket = new WebSocket(url);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    lastReply = performance.now();
    if (message.type === 'hello') {
      connected = true;
      preview = message.output === 'dry-run';
      status(preview ? 'Preview · no MIDI' : 'Bridge online · Mixxx unverified', true);
      notice('');
      record.classList.remove('disabled');
    } else if (message.type === 'pong') {
      $('latency').textContent = `${Math.round(performance.now() - message.time)} MS ROUND TRIP`;
    } else if (message.type === 'released') {
      release(false);
      notice('Touch timed out. Lift and touch again.');
    } else if (message.type === 'busy') {
      stopped = true;
      disconnect('Another controller is connected');
    }
  });
  socket.addEventListener('close', event => {
    release(false);
    connected = false;
    record.classList.add('disabled');
    if (event.code === 1008) stopped = true;
    if (!stopped) {
      status('Bridge offline · reconnecting');
      notice('Waiting for the Mac bridge');
      reconnectTimer = setTimeout(connect, 1500);
    } else {
      status('Pairing or connection refused');
      notice('Close other controllers, then reopen the pairing URL from the Mac');
    }
  });
  socket.addEventListener('error', () => {
    status('Cannot reach bridge');
    notice('Check the pairing URL, Mac firewall, and local network access');
  });
}

record.addEventListener('pointerdown', event => {
  if (!connected || pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const angle = angleAt(event.clientX, event.clientY, record.getBoundingClientRect());
  if (angle === null) return;
  event.preventDefault();
  if (coast !== null) release();
  if (!send({ type: 'down', deck })) return;
  pointer = event.pointerId;
  previous = angle;
  touchedAt = event.timeStamp;
  motion.reset(event.timeStamp);
  record.setPointerCapture(pointer);
  record.classList.add('held');
  $('gesture').textContent = preview ? 'PREVIEW / HELD' : 'HELD / SCRATCH';
  notice('');
});
record.addEventListener('pointermove', event => {
  if (pointer !== event.pointerId) return;
  event.preventDefault();
  const rect = record.getBoundingClientRect();
  const samples = event.getCoalescedEvents?.() || [];
  if (!samples.length) samples.push(event);
  for (const sample of samples) {
    if (pointer === null) break;
    // Ignore delayed browser samples after long UI suspension.
    if (sample.timeStamp - touchedAt > 250) {
      release();
      notice('Touch paused. Lift and touch again.');
      break;
    }
    touchedAt = sample.timeStamp;
    const angle = angleAt(sample.clientX, sample.clientY, rect);
    if (angle !== null && previous !== null) {
      const delta = angularDelta(previous, angle);
      motion.move(delta, sample.timeStamp);
      if (!move(delta)) break;
    } else {
      motion.reset(sample.timeStamp);
    }
    previous = angle;
  }
}, { passive: false });
record.addEventListener('pointerup', event => {
  if (pointer === event.pointerId) release(true, true, event.timeStamp);
});
for (const name of ['pointercancel', 'lostpointercapture']) {
  record.addEventListener(name, event => {
    if (pointer === event.pointerId) release();
  });
}
for (const name of ['blur', 'pagehide']) window.addEventListener(name, () => release());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) release();
});
// Keep stationary touches alive, independent of movement. Measure transport only.
setInterval(() => {
  if (!connected) return;
  if (performance.now() - lastReply > 700) {
    disconnect('Connection stalled');
    return;
  }
  if (pointer !== null || coast !== null) {
    // A stationary touch is valid; only movement sample gaps need re-anchoring.
    touchedAt = performance.now();
    send({ type: 'hold', deck });
  }
  send({ type: 'ping', time: performance.now() });
}, 100);

$('deck').addEventListener('change', event => {
  release();
  deck = Number(event.target.value);
  document.querySelector('.label strong').textContent = `0${deck}`;
  document.querySelector('.label-bottom').textContent = `SIDE ${deck === 1 ? 'A' : 'B'} / TOUCH SERIES`;
});
function resize() {
  release();
  const { width, height } = stage.getBoundingClientRect();
  const size = layout === 'half' ? Math.min(width * 1.55, height * 2.7) : Math.min(width - 28, height - 62);
  stage.style.setProperty('--diameter', `${Math.max(140, size)}px`);
}
for (const name of ['full', 'half']) {
  $(name).addEventListener('click', () => {
    layout = name;
    stage.classList.toggle('half', name === 'half');
    $('full').setAttribute('aria-pressed', String(name === 'full'));
    $('half').setAttribute('aria-pressed', String(name === 'half'));
    resize();
  });
}
$('sensitivity').addEventListener('input', event => {
  release();
  sensitivity = Number(event.target.value);
  $('gain').textContent = `${sensitivity.toFixed(2)}×`;
});
$('inertia').addEventListener('change', event => {
  release();
  inertia = event.target.checked;
  $('hint').textContent = inertia ? 'Touch to hold. Rotate to scratch. Flick to coast.' : 'Touch to hold. Rotate to scratch. Lift to release.';
});
$('reconnect').addEventListener('click', () => {
  if (socket && socket.readyState < WebSocket.CLOSING) {
    stopped = false;
    disconnect('Reconnecting');
  } else connect();
});
new ResizeObserver(resize).observe(stage);
record.addEventListener('contextmenu', event => event.preventDefault());
connect();
