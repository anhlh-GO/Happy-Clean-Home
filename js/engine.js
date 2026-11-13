// Tiny Unity-UI-like scene graph on a 2D canvas (y axis points up, origin = screen centre).
'use strict';

const E = (window.E = {});

E.W = 768;
E.H = 1664;
E.dt = 0;
E.time = 0;
E.img = {};
E.spineData = {};
E.rendererTri = null;
E.rendererImg = null;

// ---------------- assets ----------------
E.loadImage = (name, url) =>
  new Promise((res) => {
    if (E.img[name]) return res(E.img[name]);
    const im = new Image();
    im.onload = () => { E.img[name] = im; res(im); };
    im.onerror = () => { console.warn('img fail', url); res(null); };
    im.src = url;
  });

const SPINE_ATLAS = { Water_gun_2: 'Water_gun_1', Water_gun_3: 'Water_gun_1' };
E.spineFile = (d) => d.replace('Vacuum__sweeper', 'Vacuum_sweeper');

E.loadSpine = async (name, dir, atlasName) => {
  name = E.spineFile(name);
  const key = (dir || '') + name;
  if (E.spineData[key]) return E.spineData[key];
  if (E._spineLoading && E._spineLoading[key]) return E._spineLoading[key];
  E._spineLoading = E._spineLoading || {};
  const p = E._loadSpine(name, dir || 'assets/spine/', atlasName || SPINE_ATLAS[name] || name, key);
  E._spineLoading[key] = p;
  return p;
};
E._loadSpine = async (name, dir, an, key) => {
  const [atlasText, skel] = await Promise.all([
    fetch(dir + an + '.atlas').then((r) => r.text()).then((t) => t.split(String.fromCharCode(13)).join('')),
    fetch(dir + name + '.skel').then((r) => r.arrayBuffer()),
  ]);
  const pages = atlasText.split('\n').map((s) => s.trim()).filter((s) => /\.(webp|png)$/.test(s));
  const imgs = {};
  await Promise.all(pages.map(async (p) => { imgs[p] = await E.loadImage(dir + p, dir + p); }));
  const atlas = new spine.TextureAtlas(atlasText, (p) => new spine.canvas.CanvasTexture(imgs[p]));
  const bin = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas));
  bin.scale = 1;
  const data = bin.readSkeletonData(new Uint8Array(skel));
  let hasMesh = false;
  for (const sk of data.skins) for (const ent of sk.attachments) if (ent) for (const k in ent) if (ent[k] instanceof spine.MeshAttachment) hasMesh = true;
  data._hasMesh = hasMesh;
  E.spineData[key] = data;
  return data;
};

// ---------------- audio ----------------
E.audio = {
  ctx: null, buf: {}, playing: [], muted: false,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },
  async load(id, url) {
    try {
      const ab = await fetch(url).then((r) => r.arrayBuffer());
      this.raw = this.raw || {};
      this.raw[id] = ab;
    } catch (e) {}
  },
  async decodeAll() {
    if (!this.ctx || !this.raw) return;
    for (const id in this.raw) {
      if (this.buf[id]) continue;
      try { this.buf[id] = await this.ctx.decodeAudioData(this.raw[id].slice(0)); } catch (e) {}
    }
  },
  play(id, loop) {
    if (!this.ctx || this.muted) return;
    const b = this.buf[id];
    if (!b) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const s = this.ctx.createBufferSource();
    s.buffer = b; s.loop = !!loop;
    s.connect(this.ctx.destination);
    s.start();
    const rec = { id, s };
    this.playing.push(rec);
    s.onended = () => { const i = this.playing.indexOf(rec); if (i >= 0) this.playing.splice(i, 1); };
  },
  stopById(id) {
    for (const r of this.playing.slice()) if (r.id == id) { try { r.s.stop(); } catch (e) {} }
  },
  stopAll() {
    for (const r of this.playing.slice()) { try { r.s.stop(); } catch (e) {} }
    this.playing.length = 0;
  },
};

// ---------------- tweens / timers ----------------
const tweens = [];
E.ease = {
  linear: (t) => t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
// E.tween({dur, delay, ease, update(k), done(), owner})
E.tween = (o) => {
  const t = Object.assign({ t: 0, delay: 0, ease: E.ease.linear, yoyo: false, loop: false }, o);
  tweens.push(t);
  return t;
};
E.after = (sec, fn, owner) => E.tween({ dur: 0.0001, delay: sec, done: fn, owner });
E.wait = (sec) => new Promise((r) => E.after(sec, r, 'wait'));
E.kill = (t) => { if (!t) return; const i = tweens.indexOf(t); if (i >= 0) tweens.splice(i, 1); t.killed = true; };
E.killOwner = (owner) => { for (const t of tweens.slice()) if (t.owner === owner) E.kill(t); };
E.killAll = () => { for (const t of tweens.slice()) if (t.owner !== 'wait' && !t.keep) E.kill(t); };
function updateTweens(dt) {
  for (const t of tweens.slice()) {
    if (t.killed) continue;
    if (t.delay > 0) { t.delay -= dt; if (t.delay > 0) continue; }
    t.t += dt;
    let k = Math.min(1, t.t / t.dur);
    let v = t.ease(k);
    if (t.yoyo && t._rev) v = 1 - v;
    if (t.update) t.update(v);
    if (k >= 1) {
      if (t.loop) { t.t = 0; if (t.yoyo) t._rev = !t._rev; if (t.onLoop) t.onLoop(); continue; }
      E.kill(t);
      if (t.done) t.done();
    }
  }
}

// ---------------- matrices ----------------
// [a,b,c,d,e,f] : x' = a*x + c*y + e ; y' = b*x + d*y + f
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const inv = (m) => {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
E.mul = mul; E.inv = inv; E.apply = apply;

// ---------------- nodes ----------------
class Node {
  constructor(def, parent) {
    def = def || {};
    this.name = def.n || '';
    this.active = !def.off;
    this.parent = null;
    this.children = [];
    this.r = def.r ? def.r.slice() : null; // ax0,ay0,ax1,ay1,px,py,w,h,pvx,pvy
    this.t = def.t ? def.t.slice() : null;
    this.sx = def.s ? def.s[0] : 1;
    this.sy = def.s ? def.s[1] : 1;
    this.rot = def.rot || 0;
    this.alpha = def.cg !== undefined ? def.cg : 1;
    this.img = def.img && !def.imgOff ? def.img : null;
    this.imgDisabled = !!def.imgOff;
    this.imgName0 = def.img || null;
    this.raw = def.raw && !def.imgOff ? def.raw : null;
    this.col = def.col || null;
    this.itype = def.itype || 0;
    this.fill = def.fill ? def.fill[2] : 1;
    this.btn = !!def.btn;
    this.ps = !!def.ps;
    this.txt = null;
    this.spineDef = def.spine || null;
    this.bone = def.bone || null;
    this.layout = def.layout || null;
    this.world = [1, 0, 0, 1, 0, 0];
    this.w = 0; this.h = 0; this.pvx = 0.5; this.pvy = 0.5;
    this.lx = 0; this.ly = 0; // local position (pivot in parent space)
    this.posOverride = null; // {x,y} local position override
    if (def.c) for (const c of def.c) this.add(new Node(c));
    if (parent) parent.add(this);
  }
  add(n, index) {
    if (n.parent) n.remove();
    n.parent = this;
    if (index === undefined || index >= this.children.length) this.children.push(n);
    else this.children.splice(Math.max(0, index), 0, n);
    return n;
  }
  remove() {
    if (!this.parent) return;
    const a = this.parent.children; const i = a.indexOf(this);
    if (i >= 0) a.splice(i, 1);
    this.parent = null;
  }
  siblingIndex() { return this.parent ? this.parent.children.indexOf(this) : 0; }
  find(path) {
    let cur = this;
    for (const p of path.split('/')) {
      if (!cur) return null;
      cur = cur.children.find((c) => c.name === p) || null;
    }
    return cur;
  }
  findDeep(pred) {
    for (const c of this.children) {
      if (pred(c)) return c;
      const r = c.findDeep(pred);
      if (r) return r;
    }
    return null;
  }
  all(pred, out = []) {
    for (const c of this.children) { if (!pred || pred(c)) out.push(c); c.all(pred, out); }
    return out;
  }
  activeInHierarchy() { let n = this; while (n) { if (!n.active) return false; n = n.parent; } return true; }
  setActive(v) { this.active = !!v; return this; }
  // local position accessors (pivot position in parent's space, computed by layout)
  layoutSelf() {
    const p = this.parent;
    const pw = p ? p.w : E.W, ph = p ? p.h : E.H;
    const ppx = p ? p.pvx : 0.5, ppy = p ? p.pvy : 0.5;
    if (this.r) {
      const r = this.r;
      const minx = -ppx * pw, miny = -ppy * ph;
      const ax0 = minx + r[0] * pw, ax1 = minx + r[2] * pw;
      const ay0 = miny + r[1] * ph, ay1 = miny + r[3] * ph;
      this.w = ax1 - ax0 + r[6];
      this.h = ay1 - ay0 + r[7];
      this.pvx = r[8]; this.pvy = r[9];
      this.lx = ax0 + (ax1 - ax0) * r[8] + r[4];
      this.ly = ay0 + (ay1 - ay0) * r[9] + r[5];
    } else {
      this.w = 0; this.h = 0; this.pvx = 0.5; this.pvy = 0.5;
      this.lx = this.t ? this.t[0] : 0; this.ly = this.t ? this.t[1] : 0;
    }
    if (this.posOverride) { this.lx = this.posOverride.x; this.ly = this.posOverride.y; }
    const c = Math.cos((this.rot * Math.PI) / 180), s = Math.sin((this.rot * Math.PI) / 180);
    const local = [c * this.sx, s * this.sx, -s * this.sy, c * this.sy, this.lx, this.ly];
    this.world = p ? mul(p.world, local) : local;
  }
  layoutTree() {
    this.layoutSelf();
    if (this.layout) this.doLayoutGroup();
    for (const c of this.children) c.layoutTree();
  }
  doLayoutGroup() {
    // only what this UI needs: horizontal rows (centre aligned) and the vertical StepGroup (bottom centre, fit)
    const kids = this.children.filter((c) => c.active && c.name !== 'BG1');
    const sp = this.layout.sp || 0;
    if (this.layout.t === 'H') {
      const tot = kids.reduce((a, c) => a + c.r[6], 0) + sp * Math.max(0, kids.length - 1);
      let x = -tot / 2;
      for (const c of kids) { c.r[0] = c.r[2] = 0.5; c.r[1] = c.r[3] = 0.5; c.r[4] = x + c.r[6] / 2 - (0.5 - 0.5) * this.w; c.r[5] = 0; x += c.r[6] + sp; }
    } else {
      const tot = kids.reduce((a, c) => a + c.r[7], 0) + sp * Math.max(0, kids.length - 1);
      this.r[7] = tot; // content size fitter (pivot y=0 → grows upward)
      this.layoutSelf();
      let y = tot / 2;
      for (const c of kids) { c.r[0] = c.r[2] = 0.5; c.r[1] = c.r[3] = 0.5; c.r[4] = 0; c.r[5] = y - c.r[7] / 2; y -= c.r[7] + sp; }
    }
  }
  worldPos() { return [this.world[4], this.world[5]]; }
  toLocal(x, y) { return apply(inv(this.world), x, y); } // root-space point -> this node's local space
  parentLocal(x, y) { return this.parent ? this.parent.toLocal(x, y) : [x, y]; }
  setWorldPos(x, y) { const p = this.parentLocal(x, y); this.posOverride = { x: p[0], y: p[1] }; }
  hit(x, y) {
    const p = this.toLocal(x, y);
    const x0 = -this.pvx * this.w, y0 = -this.pvy * this.h;
    return p[0] >= x0 && p[0] <= x0 + this.w && p[1] >= y0 && p[1] <= y0 + this.h;
  }
  rectWorldCenter() {
    const x0 = -this.pvx * this.w, y0 = -this.pvy * this.h;
    return apply(this.world, x0 + this.w / 2, y0 + this.h / 2);
  }
  worldCorners() {
    const x0 = -this.pvx * this.w, y0 = -this.pvy * this.h;
    return [apply(this.world, x0, y0), apply(this.world, x0 + this.w, y0 + this.h)];
  }
}
E.Node = Node;

E.instantiate = (def) => new Node(JSON.parse(JSON.stringify(def)));

// ---------------- spine on nodes ----------------
E.attachSpine = async (node, name, anim, loop) => {
  const data = await E.loadSpine(name);
  const sk = new spine.Skeleton(data);
  const sd = new spine.AnimationStateData(data);
  sd.defaultMix = 0.2;
  const st = new spine.AnimationState(sd);
  try { sk.setSkinByName((node.spineDef && node.spineDef.skin) || 'default'); } catch (e) {}
  sk.setToSetupPose();
  if (anim && data.findAnimation(anim)) st.setAnimation(0, anim, !!loop);
  sk.updateWorldTransform();
  node.sk = sk; node.st = st; node.ts = (node.spineDef && node.spineDef.ts) || 1;
  return node;
};
E.hasAnim = (node, a) => node.sk && !!node.sk.data.findAnimation(a);
E.animDur = (node, a) => { const an = node.sk && node.sk.data.findAnimation(a); return an ? an.duration : 0; };
E.setAnim = (node, a, loop, onComplete) => {
  if (!node.st || !E.hasAnim(node, a)) { if (onComplete) E.after(0, onComplete); return null; }
  const te = node.st.setAnimation(0, a, !!loop);
  if (onComplete) te.listener = { complete: () => { te.listener = null; onComplete(); } };
  return te;
};
E.addAnim = (node, a, loop, delay) => { if (node.st && E.hasAnim(node, a)) return node.st.addAnimation(0, a, !!loop, delay || 0); return null; };
E.preloadSpines = async (scene) => {
  const ps = [];
  const walk = (n) => { if (n.spine && n.spine.d) ps.push(E.loadSpine(n.spine.d)); (n.c || []).forEach(walk); };
  walk(scene);
  await Promise.all(ps);
};
E.initSpines = async (root) => {
  const nodes = root.all((n) => n.spineDef && n.spineDef.d && !n.sk);
  await Promise.all(nodes.map((n) => E.attachSpine(n, n.spineDef.d, n.spineDef.a, n.spineDef.l)));
};
E.preloadImages = (scene) => {
  const ps = [];
  const walk = (n) => {
    if (n.img) ps.push(E.loadImage(n.img, 'assets/img/' + n.img + '.webp'));
    if (n.raw) ps.push(E.loadImage(n.raw, 'assets/img/' + n.raw + '.webp'));
    (n.c || []).forEach(walk);
  };
  walk(scene);
  return Promise.all(ps);
};
E.getImg = (name) => E.img[name];
E.ensureImg = (name) => E.loadImage(name, 'assets/img/' + name + '.webp');

// ---------------- drawing ----------------
E.canvas = null;
E.ctx = null;
E.scale = 1;
E.root = null;
E.overlays = []; // functions(ctx) drawn after the tree in root space

function drawNodeImage(ctx, n, im, alpha) {
  const x0 = -n.pvx * n.w, y0 = -n.pvy * n.h;
  ctx.save();
  ctx.globalAlpha = alpha * (n.col ? n.col[3] : 1);
  ctx.translate(x0, y0 + n.h);
  ctx.scale(1, -1);
  if (n.itype === 3 && n.fill < 1) {
    const fw = Math.max(0, n.w * n.fill);
    if (fw > 0.5) ctx.drawImage(im, 0, 0, im.width * n.fill, im.height, 0, 0, fw, n.h);
  } else if (n.itype === 1 && E.uiMeta && E.uiMeta[n.img] && E.uiMeta[n.img].b.some((v) => v > 0)) {
    // Unity sliced sprite with real borders [left, bottom, right, top]
    const bd = E.uiMeta[n.img].b;
    const sw = im.width, sh = im.height, W = n.w, H = n.h;
    let L = bd[0], R = bd[2], T = bd[3], B = bd[1];
    const kx = Math.min(1, W / Math.max(1, L + R)), ky = Math.min(1, H / Math.max(1, T + B));
    const xs = [[0, L, 0, L * kx], [L, sw - L - R, L * kx, W - (L + R) * kx], [sw - R, R, W - R * kx, R * kx]];
    const ys = [[0, T, 0, T * ky], [T, sh - T - B, T * ky, H - (T + B) * ky], [sh - B, B, H - B * ky, B * ky]];
    let fw = W;
    if (n.itype === 1 && n.fill3 !== undefined) fw = n.fill3;
    for (const [sx, sW, dx, dW] of xs) for (const [sy, sH, dy, dH] of ys) if (sW > 0 && sH > 0 && dW > 0.1 && dH > 0.1) ctx.drawImage(im, sx, sy, sW, sH, dx, dy, dW + 0.6, dH + 0.6);
  } else if (n.itype === 1 && im.width < n.w / 2) {
    // sliced sprite: corners keep their size, edges/centre stretch
    const b = Math.floor(Math.min(im.width, im.height) / 2) - 1, B = b * 2.5;
    const sw = im.width, sh = im.height, W = n.w, H = n.h;
    const xs = [[0, b, 0, B], [b, sw - 2 * b, B, W - 2 * B], [sw - b, b, W - B, B]];
    const ys = [[0, b, 0, B], [b, sh - 2 * b, B, H - 2 * B], [sh - b, b, H - B, B]];
    for (const [sx, sW, dx, dW] of xs) for (const [sy, sH, dy, dH] of ys) if (dW > 0 && dH > 0) ctx.drawImage(im, sx, sy, sW, sH, dx, dy, dW, dH);
  } else if (n.tint) {
    ctx.drawImage(tinted(im, n.tint), 0, 0, n.w, n.h);
  } else {
    ctx.drawImage(im, 0, 0, n.w, n.h);
  }
  ctx.restore();
}
const tintCache = new Map();
function tinted(im, col) {
  const key = im.src + col;
  if (tintCache.has(key)) return tintCache.get(key);
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  tintCache.set(key, c);
  return c;
}

function drawTree(ctx, n, alpha) {
  if (!n.active) return;
  alpha *= n.alpha;
  if (alpha <= 0.002) return;
  const v = mul(E.view, n.world);
  ctx.setTransform(v[0], v[1], v[2], v[3], v[4], v[5]);
  if (n.customDraw) n.customDraw(ctx, alpha);
  else if (n.sk) {
    ctx.globalAlpha = alpha * (n.col ? n.col[3] : 1);
    n.sk.color.a = 1;
    const r = n.sk.data._hasMesh || n.forceTri ? E.rendererTri : E.rendererImg;
    r.draw(n.sk);
    ctx.globalAlpha = 1;
  } else if (n.img || n.raw) {
    const im = n.rawCanvas || E.img[n.img || n.raw];
    if (im) drawNodeImage(ctx, n, im, alpha);
  }
  if (n.txt) {
    ctx.save();
    ctx.translate((0.5 - n.pvx) * n.w, (0.5 - n.pvy) * n.h);
    ctx.scale(1, -1);
    ctx.globalAlpha = alpha;
    ctx.font = n.font || 'bold 34px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (n.stroke) { ctx.lineWidth = n.stroke; ctx.strokeStyle = n.strokeCol || '#5a3a12'; ctx.lineJoin = 'round'; ctx.strokeText(n.txt, 0, 0); }
    ctx.fillStyle = n.txtCol || '#fff';
    const lines = String(n.txt).split('\n');
    const lh = parseInt(ctx.font.match(/(\d+)px/)[1], 10) * 1.2;
    lines.forEach((l, i) => {
      const yy = (i - (lines.length - 1) / 2) * lh;
      if (n.stroke) ctx.strokeText(l, 0, yy);
      ctx.fillText(l, 0, yy);
    });
    ctx.restore();
  }
  for (const c of n.children) if (!c.ps) drawTree(ctx, c, alpha);
}

E.drawTree = (ctx, n, a) => drawTree(ctx, n, a === undefined ? 1 : a);
function updateSpines(n, dt) {
  if (!n.active) return;
  if (n.sk) {
    n.st.update(dt * (n.ts || 1));
    n.st.apply(n.sk);
    n.sk.updateWorldTransform();
    if (n.boneDrive) n.boneDrive();
  }
  for (const c of n.children) updateSpines(c, dt);
}

E.resize = () => {
  const cv = E.canvas;
  const vw = window.innerWidth, vh = window.innerHeight;
  // logical width 768; height follows the device aspect (portrait), clamped
  let H = (E.W * vh) / vw;
  H = Math.max(1280, Math.min(1720, H));
  E.H = Math.round(H);
  let cssW = vw, cssH = (vw * E.H) / E.W;
  if (cssH > vh) { cssH = vh; cssW = (vh * E.W) / E.H; }
  cv.style.width = cssW + 'px';
  cv.style.height = cssH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let px = cssW * dpr;
  px = Math.min(px, 1080);
  cv.width = Math.round(px);
  cv.height = Math.round((px * E.H) / E.W);
  E.scale = cv.width / E.W;
  E.view = [E.scale, 0, 0, -E.scale, cv.width / 2, cv.height / 2];
  E.cssScale = cssW / E.W;
  if (E.onResize) E.onResize();
};

E.toRoot = (clientX, clientY) => {
  const r = E.canvas.getBoundingClientRect();
  const x = ((clientX - r.left) / r.width) * E.W - E.W / 2;
  const y = E.H / 2 - ((clientY - r.top) / r.height) * E.H;
  return [x, y];
};

// pointer state (single touch)
E.ptr = { down: false, x: 0, y: 0, justDown: false, justUp: false, id: null };
E.onPointerDown = null;

E.init = (canvas) => {
  E.canvas = canvas;
  E.ctx = canvas.getContext('2d');
  E.rendererTri = new spine.canvas.SkeletonRenderer(E.ctx);
  E.rendererTri.triangleRendering = true;
  E.rendererImg = new spine.canvas.SkeletonRenderer(E.ctx);
  E.rendererImg.triangleRendering = false;
  E.resize();
  window.addEventListener('resize', E.resize);
  const down = (e) => {
    if (E.ptr.down && E.ptr.id !== e.pointerId) return;
    E.audio.init();
    const p = E.toRoot(e.clientX, e.clientY);
    E.ptr.down = true; E.ptr.id = e.pointerId; E.ptr.x = p[0]; E.ptr.y = p[1]; E.ptr.justDown = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (E.onPointerDown) E.onPointerDown(p[0], p[1]);
    e.preventDefault();
  };
  const move = (e) => {
    if (E.ptr.id !== null && e.pointerId !== E.ptr.id) return;
    const p = E.toRoot(e.clientX, e.clientY);
    E.ptr.x = p[0]; E.ptr.y = p[1];
    if (E.onPointerMove && E.ptr.down) E.onPointerMove(p[0], p[1]);
  };
  const up = (e) => {
    if (e.pointerId !== E.ptr.id) return;
    const p = E.toRoot(e.clientX, e.clientY);
    E.ptr.x = p[0]; E.ptr.y = p[1];
    E.ptr.down = false; E.ptr.id = null; E.ptr.justUp = true;
    if (E.onPointerUp) E.onPointerUp(p[0], p[1]);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  let last = performance.now();
  const frame = (now, fallback) => {
    let dt = (now - last) / 1000; last = now;
    const cap = fallback ? 0.3 : 0.1;
    if (dt > cap) dt = cap;
    E.dt = dt; E.time += dt;
    E.step(dt);
    if (!fallback) requestAnimationFrame((t) => frame(t));
  };
  requestAnimationFrame((t) => frame(t));
  // hidden panes throttle rAF – keep logic alive
  setInterval(() => { const now = performance.now(); if (now - last > 120) frame(now, true); }, 100);
};

E.update = null; // game hook (dt)
E.updateSpines = (n, dt) => updateSpines(n, dt);
E.step = (dt) => {
  updateTweens(dt);
  if (E.root) E.root.layoutTree();
  if (E.update) E.update(dt);
  if (E.root) { updateSpines(E.root, dt); E.root.layoutTree(); }
  E.ptr.justDown = false; E.ptr.justUp = false;
  const ctx = E.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, E.canvas.width, E.canvas.height);
  if (E.root) drawTree(ctx, E.root, 1);
  for (const f of E.overlays) { const v = E.view; ctx.setTransform(v[0], v[1], v[2], v[3], v[4], v[5]); ctx.globalAlpha = 1; f(ctx); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
};
