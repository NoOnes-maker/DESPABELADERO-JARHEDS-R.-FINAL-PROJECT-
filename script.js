'use strict';
/* Hanoi Workshop - UI + animation. Moves come from SWI-Prolog (/api/solve),
   with an identical JS solver as a fallback when no Prolog server is running. */

const DISK_H = 26, GAP = 2, BASE_Y = 22, LIFT_Y = 262;
const PEGS = ['left', 'center', 'right'];
const $ = id => document.getElementById(id);
const el = {
  stage: $('stage'), disks: $('disks'), count: $('diskCount'), speed: $('speed'),
  play: $('btnPlay'), playText: $('playText'), playIcon: $('playIcon'), sound: $('btnSound'),
  reset: $('btnReset'), counter: $('stepCounter'), you: $('statYou'), opt: $('statOpt'),
  eff: $('statEff'), hint: $('hint'), done: $('btnDone'), prompt: $('autoPrompt'),
  yes: $('btnYes'), no: $('btnNo'), log: $('console'), clear: $('btnClear'),
  codeBase: $('codeBase'), codeRec: $('codeRec'), engine: $('engine')
};

const S = {
  n: 3, speed: 700, running: false, paused: false, step: 0, queue: [], ready: null,
  diskEls: {}, pegs: { left: [], center: [], right: [] }, inflight: null, loopId: 0,
  manual: 0, solved: false, autoDone: false, lastManual: null, drag: null
};
let token = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));
const total = () => 2 ** S.n - 1;

/* ---------- solver: Prolog first, JS fallback ---------- */
function solveJS(n, from, to, via, out = []) {
  if (n === 0) return out;
  solveJS(n - 1, from, via, to, out);
  out.push({ disk: n, from, to });
  solveJS(n - 1, via, to, from, out);
  return out;
}

async function fetchMoves(n) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`api/solve?n=${n}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data.moves) || data.moves.length !== 2 ** n - 1) throw new Error('bad payload');
    return { moves: data.moves, kind: 'prolog' };
  } catch (_) {
    return { moves: solveJS(n, 'left', 'right', 'center'), kind: 'js' };
  }
}

function setEngine(kind) {
  el.engine.dataset.kind = kind;
  el.engine.textContent = kind === 'prolog' ? 'Solver: SWI-Prolog server' : 'Solver: JS fallback';
  el.engine.title = kind === 'prolog' ? 'Moves computed by hanoi.pl' : 'Run "swipl server.pl" to use Prolog';
}

/* ---------- sound (synthesized, no files) ---------- */
let ac = null, noise = null, soundOn = true;
function audio() {
  if (!ac) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ac = new A();
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function whoosh(f0, f1, ms, vol = 0.25) {
  if (!soundOn || !audio()) return;
  const t = ac.currentTime, d = ms / 1000;
  const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
  const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 1.4;
  b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + d);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + d * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(b); b.connect(g); g.connect(ac.destination);
  s.start(t); s.stop(t + d + 0.05);
}
function pop(f0, f1, ms = 120, vol = 0.35) {
  if (!soundOn || !audio()) return;
  const t = ac.currentTime, d = ms / 1000;
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + d + 0.02);
}
const sfx = {
  lift(i) { pop(500 + i * 60, 1100 + i * 80, 110, 0.3); whoosh(400, 1800, 180, 0.18); },
  slide(a, b, ms) { getX(b) > getX(a) ? whoosh(500, 2600, ms, 0.3) : whoosh(2600, 500, ms, 0.3); },
  land(i) { whoosh(1800, 300, 140, 0.15); setTimeout(() => pop(Math.max(90, 260 - i * 20), 70, 140, 0.45), 90); },
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => pop(f * 1.5, f, 260, 0.25), i * 110)); }
};

/* ---------- geometry ---------- */
function getX(peg) { return el.stage.clientWidth * (PEGS.indexOf(peg) * 2 + 1) / 6; }
function place(d, peg, idx, w) {
  d.style.left = (getX(peg) - w / 2) + 'px';
  d.style.bottom = (BASE_Y + idx * (DISK_H + GAP)) + 'px';
}

/* ---------- console / ui helpers ---------- */
function log(msg, cls = '') {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.textContent = msg;
  el.log.appendChild(p);
  el.log.scrollTop = el.log.scrollHeight;
}
function resetLog() {
  el.log.innerHTML = '';
  log('% SWI-Prolog ready.', 'dim');
  log(`?- hanoi(${S.n}, left, right, center, Moves).`, 'q');
}
function counter() { el.counter.textContent = `Move ${S.step} / ${total()}`; }
function hint(msg, bad) { el.hint.textContent = msg; el.hint.className = 'hint' + (bad ? ' bad' : ''); }
function btnState() {
  const playing = S.running && !S.paused;
  el.play.dataset.mode = playing ? 'pause' : 'play';
  el.playText.textContent = playing ? 'Pause' : S.step >= total() ? 'Replay' : S.step > 0 ? 'Resume' : 'Auto Solve';
  el.playIcon.innerHTML = playing ? '<path d="M5 4h3v12H5zM12 4h3v12h-3z"/>' : '<path d="M4 4l12 6-12 6z"/>';
}
function stats() {
  const opt = total();
  el.you.textContent = S.manual;
  el.opt.textContent = opt;
  el.eff.textContent = S.solved ? Math.round(opt / S.manual * 100) + '%' : '-';
  const last = S.lastManual && S.lastManual.disks === S.n ? S.lastManual : null;
  if (S.solved) {
    hint(S.manual === opt ? `Perfect! You matched Prolog (${opt} moves).`
      : `Solved in ${S.manual} moves. Prolog needs ${opt}, so ${S.manual - opt} extra.`);
  } else if (S.autoDone) {
    hint(`Auto solve finished in ${opt} moves (2^${S.n} - 1).` +
      (last ? ` Your last try: ${last.moves} moves${last.solved ? '' : ' (unfinished)'}.` : ''));
  } else if (last) {
    hint(`Last manual try: ${last.moves} moves${last.solved ? '' : ' (unfinished)'} vs ${opt} for Prolog. Beat it!`);
  } else {
    hint('Drag the top disk of any peg. Move the whole stack to another peg, then press Done.');
  }
}
function flash(disk) {
  const parts = [el.codeRec].concat(disk === 1 ? [el.codeBase] : []);
  parts.forEach(c => c.classList.add('hit'));
  setTimeout(() => parts.forEach(c => c.classList.remove('hit')), S.speed * 0.8);
}

/* ---------- lifecycle ---------- */
function stop() { S.running = false; S.paused = false; btnState(); }

function init() {
  stop();
  S.n = +el.count.value;
  S.manual = 0; S.solved = false; S.autoDone = false; S.drag = null; S.step = 0; S.inflight = null;
  el.prompt.classList.add('hidden');
  S.pegs = { left: [], center: [], right: [] };
  el.disks.innerHTML = '';
  S.diskEls = {};

  const W = el.stage.clientWidth || 600, maxW = W / 3 * 0.86, minW = 44;
  for (let i = S.n; i >= 1; i--) {
    S.pegs.left.push(i);
    const w = minW + (i - 1) / Math.max(1, S.n - 1) * (maxW - minW);
    const d = document.createElement('div');
    d.className = `disk c${(i - 1) % 7 + 1}`;
    d.style.width = w + 'px'; d.style.height = DISK_H + 'px';
    d.textContent = i; d.dataset.id = i; d.dataset.w = w;
    d.addEventListener('pointerdown', onDown);
    d.addEventListener('pointermove', onMove);
    d.addEventListener('pointerup', onUp);
    d.addEventListener('pointercancel', onUp);
    el.disks.appendChild(d);
    S.diskEls[i] = d;
    place(d, 'left', S.pegs.left.length - 1, w);
  }

  const mine = ++token;
  S.queue = [];
  S.ready = fetchMoves(S.n).then(r => {
    if (mine !== token) return;
    S.queue = r.moves;
    setEngine(r.kind);
  });
  counter(); stats(); resetLog();
}

/* ---------- auto solve ---------- */
function animate(m, done) {
  const d = S.diskEls[m.disk], w = +d.dataset.w;
  const idx = S.pegs[m.to].length;
  S.pegs[m.from].pop(); S.pegs[m.to].push(m.disk);
  const t = Math.max(100, Math.floor(S.speed / 3.2));
  d.style.transition = `left ${t}ms ease-in-out, bottom ${t}ms ease-in-out`;
  d.style.bottom = LIFT_Y + 'px';
  sfx.lift(m.disk);
  setTimeout(() => {
    sfx.slide(m.from, m.to, t);
    d.style.left = (getX(m.to) - w / 2) + 'px';
    setTimeout(() => {
      d.style.bottom = (BASE_Y + idx * (DISK_H + GAP)) + 'px';
      setTimeout(() => { sfx.land(m.disk); done(); }, t);
    }, t);
  }, t);
}

async function run() {
  const id = ++S.loopId, mine = token;
  await S.ready;
  if (S.inflight) await S.inflight;
  while (id === S.loopId && mine === token && S.running && !S.paused && S.step < S.queue.length) {
    const m = S.queue[S.step];
    log(`Move disk ${m.disk} from ${m.from} to ${m.to}`, 'mv');
    flash(m.disk);
    S.inflight = new Promise(res => animate(m, res));
    await S.inflight;
    S.inflight = null;
    if (mine !== token) return;
    S.step++; counter();
    if (id !== S.loopId) return;
    await wait(50);
  }
  if (id === S.loopId && mine === token && S.running && !S.paused && S.step >= S.queue.length) finish();
}

function start() {
  audio();
  if (S.manual > 0 || S.step >= total()) {
    if (S.manual > 0) S.lastManual = { moves: S.manual, disks: S.n, solved: S.solved };
    init();
  }
  S.running = true; S.paused = false;
  btnState();
  run();
}

function finish() {
  stop();
  S.autoDone = true;
  log(`true. % Solved in ${S.queue.length} moves!`, 'ok');
  if (S.lastManual && S.lastManual.disks === S.n) log(`% You: ${S.lastManual.moves} moves | Prolog: ${S.queue.length} moves`, 'ok');
  stats();
  setTimeout(sfx.win, 250);
}

/* ---------- manual play (drag and drop) ---------- */
function onDown(e) {
  const d = e.currentTarget, id = +d.dataset.id;
  if (S.running || S.step > 0) { hint('Press Reset to play manually.', true); return; }
  if (S.solved) { hint('Solved! Press Reset to try again.'); return; }
  const from = PEGS.find(p => S.pegs[p][S.pegs[p].length - 1] === id);
  if (!from) { hint('Only the top disk of a peg can be moved.', true); return; }
  audio();
  S.drag = { id, d, from, w: +d.dataset.w };
  d.style.transition = 'none';
  d.classList.add('drag');
  d.setPointerCapture(e.pointerId);
  sfx.lift(id);
  onMove(e);
}
function onMove(e) {
  if (!S.drag) return;
  const r = el.stage.getBoundingClientRect();
  S.drag.d.style.left = (e.clientX - r.left - S.drag.w / 2) + 'px';
  S.drag.d.style.bottom = (r.bottom - e.clientY - DISK_H / 2) + 'px';
}
function onUp(e) {
  if (!S.drag) return;
  const g = S.drag; S.drag = null;
  g.d.classList.remove('drag');
  const r = el.stage.getBoundingClientRect();
  const to = PEGS[Math.max(0, Math.min(2, Math.floor((e.clientX - r.left) / (r.width / 3))))];
  const top = S.pegs[to][S.pegs[to].length - 1];
  const legal = to !== g.from && (top === undefined || top > g.id);
  g.d.style.transition = 'left 150ms ease-out, bottom 150ms ease-out';
  if (legal) {
    S.pegs[g.from].pop(); S.pegs[to].push(g.id);
    S.manual++;
    log(`Move disk ${g.id} from ${g.from} to ${to}`, 'mv');
    place(g.d, to, S.pegs[to].length - 1, g.w);
    sfx.land(g.id);
    if (S.pegs.right.length === S.n || S.pegs.center.length === S.n) {
      S.solved = true;
      log(`true. % You solved it in ${S.manual} moves`, 'ok');
      setTimeout(sfx.win, 250);
    }
    stats();
  } else {
    place(g.d, g.from, S.pegs[g.from].length - 1, g.w);
    if (to !== g.from) { hint('Illegal move: a bigger disk cannot sit on a smaller one.', true); pop(200, 90, 140, 0.35); }
  }
}

/* ---------- wiring ---------- */
el.play.addEventListener('click', () => {
  if (!S.running || S.paused) start();
  else { S.paused = true; btnState(); }
});
el.reset.addEventListener('click', init);
el.count.addEventListener('change', init);
el.speed.addEventListener('change', e => { S.speed = +e.target.value; });
el.clear.addEventListener('click', () => { el.log.innerHTML = ''; });
el.done.addEventListener('click', () => el.prompt.classList.remove('hidden'));
el.yes.addEventListener('click', () => { el.prompt.classList.add('hidden'); start(); });
el.no.addEventListener('click', () => el.prompt.classList.add('hidden'));
el.sound.addEventListener('click', () => {
  soundOn = !soundOn;
  el.sound.textContent = soundOn ? '🔊 Sound on' : '🔇 Sound off';
  if (soundOn) { audio(); pop(700, 300, 100, 0.25); }
});
window.addEventListener('resize', () => {
  if (!S.running && S.step === 0 && S.manual === 0) init();
});

init();
