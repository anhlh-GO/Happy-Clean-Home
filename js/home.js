// Home meta-game: map -> rooms -> nodes. Ports RoomManager / Room / RoomNode / UIItemGroup / UIBubble /
// RoomTimeLineManager / RoomRewardBoxLogic (chapter 1006). Cleaning a node is hands-on: the player holds a tool and
// scrubs the item until the old version is gone (ASMR nodes open the ASMR minigame instead).
'use strict';

const CHAPTER = 1006;
const AVAILABLE = new Set([10227, 10002, 70006, 78903]);
const SAVE_HOME = 'happyclean.home.v1';
const DESIGN_W = 864, DESIGN_H = 1720;
const SCRUB_DONE = 0.85; // fraction of the changed area that must be scrubbed
const BRUSH_R = 62; // brush radius in design px (logical canvas units)

// ---------------- room scene ----------------
class RoomScene {
  constructor(app, id) {
    this.app = app; this.id = id;
    this.cam = { x: 0, y: 0, z: 1 };
    this.busy = false;
    this.bubbleT = 0;
    this.bubbleNodes = {};
  }
  st() { return this.app.roomState(this.id); }
  ns(nid) { return this.st().nodes[nid]; }

  async load(onProgress) {
    const data = await fetch('assets/rooms/' + this.id + '/room.json').then((r) => r.json());
    this.data = data;
    const rv = (this.rv = new RoomView(this.id, data));
    const off = {}, isOld = {};
    for (const n of data.cfg.Offset.nodes) for (const it of n.items) off[it.id] = it.pos;
    for (const n of data.cfg.OldFur.nodes) for (const it of n.items) isOld[it.id] = it.isOld;
    const view = {};
    for (const n of data.cfg.Base.nodes) view[n.id] = n;
    this.nodes = [];
    for (const row of this.app.nodesOf(this.id)) {
      const v = view[row.id];
      const items = v ? v.items.map((i) => i.id) : [];
      this.nodes.push({
        id: row.id, row, items,
        old: items.find((i) => isOld[i]) || null,
        news: items.filter((i) => !isOld[i]),
        rq: v ? v.renderQueue : 0,
        off, container: new E.Node({ n: 'Node_' + row.id, t: [0, 0] }), cache: {}, cur: null,
      });
    }
    const S = this.st();
    for (const n of this.nodes) if (!S.nodes[n.id]) S.nodes[n.id] = { s: n.row.isOpen ? 1 : 0, sel: '', once: false };
    for (const n of this.nodes) if (S.nodes[n.id].s >= 2) this.openChildren(n.row);
    this.app.save();
    const bg = await rv.makeItem('room2d_Room' + this.id);
    if (bg) rv.root.add(bg);
    for (const n of this.nodes) rv.root.add(n.container);
    let done = 0;
    await Promise.all(this.nodes.map(async (n) => { await this.showState(n); done++; onProgress && onProgress(done / this.nodes.length); }));
    // tile icons for the select panel
    const icons = new Set();
    for (const n of this.nodes) for (const id of n.news) icons.add(id.split('###').pop());
    await Promise.all([...icons].map((s) => E.loadImage(this.iconKey(s), this.iconKey(s))));
    this.layout();
  }
  iconKey(suffix) { return 'assets/rooms/' + this.id + '/icons/' + suffix + '_2d_256.webp'; }
  nodeById(id) { return this.nodes.find((n) => n.id === id); }
  openChildren(row) {
    const S = this.st();
    if (!row.nextNode || !(row.nextNode[0] > 0)) return;
    for (const c of row.nextNode) { if (!S.nodes[c]) S.nodes[c] = { s: 0, sel: '', once: false }; if (S.nodes[c].s < 2) S.nodes[c].s = 1; }
  }
  async ensureItem(n, itemId) {
    let it = n.cache[itemId];
    if (!it) {
      it = await this.rv.makeItem(itemId);
      if (!it) return null;
      n.cache[itemId] = it;
      n.container.add(it);
      it.setActive(false);
    }
    return it;
  }
  async setItem(n, itemId) {
    if (n.cur === itemId) return n.cache[itemId] || null;
    if (n.cur && n.cache[n.cur]) n.cache[n.cur].setActive(false);
    n.cur = itemId;
    if (!itemId) return null;
    const it = await this.ensureItem(n, itemId);
    if (!it) return null;
    if (n.cur !== itemId) { it.setActive(false); return it; }
    it.setActive(true); it.alpha = 1;
    this.playAll(it, 'Normal', false);
    return it;
  }
  async showState(n) {
    const s = this.ns(n.id);
    if (s.s >= 2) {
      if (n.row.isClear) return this.setItem(n, null);
      const it = await this.setItem(n, s.sel || n.news[0] || null);
      if (it && n.row.isLoop) this.playAll(it, 'Normal', true);
      return it;
    }
    return this.setItem(n, n.old);
  }
  skels(it) { return it ? it.all((x) => !!x.sk).concat(it.sk ? [it] : []) : []; }
  playAll(it, anim, loop) {
    let dur = 0;
    for (const s of this.skels(it)) {
      const a = s.sk.data.findAnimation(anim);
      if (!a) continue;
      s.st.data.defaultMix = 0;
      s.st.setAnimation(0, anim, !!loop);
      dur = Math.max(dur, a.duration);
    }
    return dur;
  }
  anchor(n) {
    const id = n.cur || n.old || n.news[0];
    const p = (id && n.off[id]) || (n.news[0] && n.off[n.news[0]]) || (n.old && n.off[n.old]);
    if (!p) return [0, 0];
    const v = (p.find((q) => q.key === '') || p[0]).value;
    return [v.x, v.y];
  }

  // ---------- camera ----------
  baseScale() { return Math.max(E.W / DESIGN_W, E.H / DESIGN_H); }
  layout() {
    const s = this.baseScale() * this.cam.z;
    const r = this.rv.root;
    r.sx = r.sy = s;
    r.t = [-this.cam.x * s, -this.cam.y * s];
    r.layoutTree();
  }
  toScreen(x, y) { const s = this.baseScale() * this.cam.z; return [(x - this.cam.x) * s, (y - this.cam.y) * s]; }
  focusOn(n, zoomMore) {
    const r = n.row;
    let tx, ty, tz;
    if (r.focusScale > 0.1) {
      tx = r.focusX * 100; ty = r.focusY * 100;
      const base = DESIGN_H / 200;
      const size = Math.min(r.focusScale, base - 2 * Math.max(Math.abs(r.focusX), Math.abs(r.focusY)));
      tz = base / Math.max(0.5, size);
    } else {
      const a = this.anchor(n);
      tx = a[0] / 3; ty = a[1] / 3;
      const dw = (432 - Math.abs(tx)) * 2, dh = (860 - Math.abs(ty)) * 2;
      tz = Math.max(E.W / dw, E.H / dh) / this.baseScale();
    }
    if (zoomMore) ty -= 120 / (this.baseScale() * tz); // keep the item above the panel
    return this.camTo(tx, ty, tz);
  }
  focusOff() { return this.camTo(0, 0, 1); }
  camTo(x, y, z) {
    const c0 = { ...this.cam };
    E.killOwner(this.cam);
    return new Promise((res) => E.tween({ dur: 0.5, ease: E.ease.inOutSine, owner: this.cam, keep: true, update: (k) => { this.cam.x = c0.x + (x - c0.x) * k; this.cam.y = c0.y + (y - c0.y) * k; this.cam.z = c0.z + (z - c0.z) * k; }, done: res }));
  }

  // ---------- bubbles (UIBubble / FurniturePointButton) ----------
  openNodes() { return this.nodes.filter((n) => this.ns(n.id).s === 1); }
  updateBubbles() {
    const ui = this.app.ui;
    const layer = ui.bubbleLayer;
    const show = !(this.busy || this.app.panel || this.hideBubbles || this.app.scrubbing);
    const list = this.openNodes();
    const keep = new Set(list.map((n) => n.id));
    for (const id of Object.keys(this.bubbleNodes)) if (!keep.has(+id)) { this.bubbleNodes[id].remove(); delete this.bubbleNodes[id]; }
    if (!show) { layer.setActive(false); return; }
    layer.setActive(true);
    this.bubbleT += E.dt;
    const pos = list.map((n) => { const p = this.toScreen(...this.anchor(n)); return { n, x: p[0], y: p[1] }; });
    for (let it = 0; it < 12; it++) for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      const a = pos[i], b = pos[j]; const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1;
      if (d < 120) { const k = (120 - d) / 2; a.x -= (dx / d) * k; a.y -= (dy / d) * k; b.x += (dx / d) * k; b.y += (dy / d) * k; }
    }
    const sc = E.ease.outBack(Math.min(1, Math.max(0, (this.bubbleT - 0.15) / 0.5)));
    for (const p of pos) {
      p.x = Math.max(-E.W / 2 + 70, Math.min(E.W / 2 - 70, p.x)); p.y = Math.max(-E.H / 2 + 300, Math.min(E.H / 2 - 260, p.y));
      let b = this.bubbleNodes[p.n.id];
      if (!b) { b = ui.bubbleNode(p.n.row.iconResName); layer.add(b); this.bubbleNodes[p.n.id] = b; b.nodeRef = p.n; }
      b.r[4] = p.x; b.r[5] = p.y + Math.sin(E.time * 3 + p.n.id) * 5;
      b.sx = b.sy = sc;
    }
  }
  tapBubble(x, y) {
    for (const id in this.bubbleNodes) { const b = this.bubbleNodes[id]; if (b.find('PlaceBg').hit(x, y)) return b.nodeRef; }
    return null;
  }
  playNext() { const n = this.openNodes()[0]; if (n && !this.busy) { E.audio.play('click'); this.openPanel(n); } }

  // ---------- input ----------
  tap(x, y) {
    if (this.busy || this.app.panel || this.app.scrubbing) return;
    const bn = this.tapBubble(x, y);
    if (bn) { this.openPanel(bn); return; }
    const hits = [];
    for (const n of this.nodes) {
      const s = this.ns(n.id);
      if (s.s < 2 || !n.cur || n.cur === n.old || n.news.length < 2) continue;
      const it = n.cache[n.cur];
      if (it && this.hitPoly(it, x, y)) hits.push(n);
    }
    hits.sort((a, b) => b.rq - a.rq);
    if (hits.length) this.openPanel(hits[0]);
  }
  hitPoly(it, x, y) {
    for (const p of it.all((c) => c.def && c.def.poly)) {
      const l = p.toLocal(x, y);
      for (const path of p.def.poly) {
        let inside = false;
        for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
          const [xi, yi] = path[i], [xj, yj] = path[j];
          if ((yi > l[1]) !== (yj > l[1]) && l[0] < ((xj - xi) * (l[1] - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return true;
      }
    }
    return false;
  }

  // ---------- select panel (UIItemGroup) ----------
  async openPanel(n) {
    const s = this.ns(n.id);
    this.panelNode = n;
    this.app.panel = true;
    E.audio.play('bubble');
    const asmr = this.app.asmrLevelOf(n.row);
    const choices = n.row.isClear || asmr ? [] : n.news;
    this.panelSel = s.s >= 2 ? s.sel || n.news[0] : n.news[0] || null;
    // style preview only for already-bought nodes (unbought ones are revealed by scrubbing)
    if (s.s >= 2 && choices.length && this.panelSel) await this.setItem(n, this.panelSel);
    this.focusOn(n, true);
    this.app.ui.openSelect({
      tiles: choices.map((id) => ({ id, img: this.iconKey(id.split('###').pop()) })),
      asmrImg: asmr ? 'map/UIDecorationMain_RoomBG' + Math.min(6, asmr) : null,
      sel: this.panelSel,
      okText: 'Do it',
      onTile: (id) => { this.panelSel = id; if (s.s >= 2) this.setItem(n, id); },
      onOk: () => this.confirm(n),
      onCancel: () => this.cancel(n),
    });
  }
  closePanel() { this.app.ui.closeSelect(); this.app.panel = false; this.bubbleT = 0; }
  cancel(n) { this.closePanel(); this.focusOff(); this.showState(n); }
  confirm(n) {
    const s = this.ns(n.id);
    const asmr = this.app.asmrLevelOf(n.row);
    this.closePanel();
    if (asmr > 0 && s.s < 2) {
      this.focusOff();
      this.app.playAsmr(asmr, () => this.commit(n, true), () => {});
      return;
    }
    if (s.s >= 2) { // restyle: free, replay the build-in animation
      s.sel = this.panelSel; this.app.save();
      this.busy = true;
      E.after(0.5, () => this.replace(n), this);
      return;
    }
    this.startScrub(n);
  }
  commit(n, afterAsmr) {
    const s = this.ns(n.id);
    s.s = 2;
    s.sel = n.row.isClear ? '' : this.panelSel || n.news[0] || '';
    this.openChildren(n.row);
    this.app.save();
    this.app.updateHud();
    if (afterAsmr) {
      this.busy = true;
      E.after(0.5, () => { if (n.row.isClear) this.playClean(n); else this.replace(n); }, this);
    }
  }
  playSound(n, first) {
    const id = first && n.row.oneTimeSound ? n.row.oneTimeSound : n.row.sound;
    this.app.playRoomSound(this.id, id);
  }
  async playClean(n) {
    this.playSound(n, false);
    const it = n.cache[n.old] || (await this.setItem(n, n.old));
    const dur = it ? this.playAll(it, 'clean', false) : 0;
    if (it && dur <= 0) E.tween({ dur: 0.6, update: (k) => { it.alpha = 1 - k; } });
    await E.wait(Math.max(dur, 0.6));
    this.sparkle(n);
    await E.wait(1.5);
    await this.setItem(n, null);
    this.endNode(n, true);
  }
  async replace(n) {
    const s = this.ns(n.id);
    this.playSound(n, n.row.oneTimeClean && !s.once);
    const it = await this.setItem(n, s.sel || n.news[0]);
    let anim = 'first_confirm';
    if (n.row.oneTimeClean && !s.once) { anim = n.row.oneTimeClean; s.once = true; this.app.save(); }
    const dur = it ? this.playAll(it, anim, false) : 0;
    await E.wait(dur);
    if (dur > 0) { this.sparkle(n); await E.wait(1.5); }
    if (it && n.row.isLoop) this.playAll(it, 'Normal', true);
    this.endNode(n, true);
  }
  sparkle(n) { const a = this.anchor(n); const p = this.toScreen(a[0], a[1]); this.app.fx.starBurst(p[0], p[1]); }
  async endNode(n, isBuy) {
    this.busy = false;
    this.bubbleT = 0;
    this.app.updateHud();
    await this.focusOff();
    if (isBuy) E.after(0.35, () => this.checkComplete(), this);
  }

  // ---------- hands-on cleaning (scrub) ----------
  pickTool(n) {
    if (n.row.isClear) return { scene: 'BesomTool', snd: 1888, hit: true };
    return { scene: 'CleanBrushTool', snd: 1891, loop: true };
  }
  async startScrub(n) {
    try { await this._startScrub(n); } catch (e) {
      console.error('scrub', e);
      this.scrub = null; this.app.scrubbing = false;
      this.commit(n, false);
      await this.showState(n);
      this.endNode(n, true);
    }
  }
  async _startScrub(n) {
    this.busy = true;
    this.app.scrubbing = true;
    const beforeId = n.old || null;
    const afterId = n.row.isClear ? null : this.panelSel || n.news[0] || null;
    const before = beforeId ? await this.ensureItem(n, beforeId) : null;
    const after = afterId ? await this.ensureItem(n, afterId) : null;
    if (after) { after.alpha = 1; this.playAll(after, 'Normal', !!n.row.isLoop); }
    await this.focusOn(n, false);
    const W = E.canvas.width, H = E.canvas.height;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const cA = mk(W, H), cB = mk(W, H), mask = mk(W, H);
    const gA = cA.getContext('2d'), gB = cB.getContext('2d');
    const sc = (this.scrub = {
      n, before, after, cA, gA, mask, gM: mask.getContext('2d'),
      rA: { tri: Object.assign(new spine.canvas.SkeletonRenderer(gA), { triangleRendering: true }), img: Object.assign(new spine.canvas.SkeletonRenderer(gA), { triangleRendering: false }) },
      cell: 8, p: 0, done: 0, total: 0, last: null, started: false, finishing: false, sndT: 0,
    });
    // where does the picture change? (low-res diff of before vs after)
    const rB = { tri: Object.assign(new spine.canvas.SkeletonRenderer(gB), { triangleRendering: true }), img: Object.assign(new spine.canvas.SkeletonRenderer(gB), { triangleRendering: false }) };
    this.layout(); this.rv.update(0); this.layout();
    this.renderState(gA, sc.rA, 'before');
    this.renderState(gB, rB, 'after');
    const lw = Math.ceil(W / sc.cell), lh = Math.ceil(H / sc.cell);
    const sa = mk(lw, lh), sb = mk(lw, lh);
    const xa = sa.getContext('2d', { willReadFrequently: true }), xb = sb.getContext('2d', { willReadFrequently: true });
    xa.drawImage(cA, 0, 0, lw, lh); xb.drawImage(cB, 0, 0, lw, lh);
    const da = xa.getImageData(0, 0, lw, lh).data, db = xb.getImageData(0, 0, lw, lh).data;
    const diff = new Uint8Array(lw * lh);
    let total = 0;
    for (let i = 0; i < lw * lh; i++) {
      const o = i * 4;
      const d = Math.abs(da[o] - db[o]) + Math.abs(da[o + 1] - db[o + 1]) + Math.abs(da[o + 2] - db[o + 2]);
      if (d > 36) { diff[i] = 1; total++; }
    }
    Object.assign(sc, { lw, lh, diff, paint: new Float32Array(lw * lh), total: Math.max(1, total) });
    if (total < 40) {
      // nothing visible to scrub (item hidden behind others / off screen): fall back to the build-in animation
      this.scrub = null; this.app.scrubbing = false;
      this.commit(n, false);
      if (n.row.isClear) await this.playClean(n); else await this.replace(n);
      return;
    }
    // the tool
    const tdef = this.pickTool(n);
    sc.tool = tdef;
    const tool = E.instantiate(this.app.game.scenes[tdef.scene]);
    await E.initSpines(tool);
    const holder = new E.Node({ n: 'ToolLayer', r: [0, 0, 1, 1, 0, 0, 0, 0, 0.5, 0.5] });
    holder.add(tool);
    sc.toolLayer = holder; sc.toolNode = tool;
    sc.toolSk = tool.findDeep((x) => !!x.sk);
    sc.tp = tool.find('touch_point') || tool;
    const a = this.anchor(n), p0 = this.toScreen(a[0], a[1]);
    tool.r[4] = Math.max(-E.W / 2 + 80, Math.min(E.W / 2 - 300, p0[0] - 60)); tool.r[5] = Math.max(-E.H / 2 + 300, p0[1] - 200);
    holder.layoutTree();
    if (sc.toolSk) { if (E.hasAnim(sc.toolSk, 'appear')) E.setAnim(sc.toolSk, 'appear', false, () => E.setAnim(sc.toolSk, 'idle', true)); else E.setAnim(sc.toolSk, 'idle', true); }
    sc.hint = { x: p0[0], y: p0[1], t: 0 };
    this.app.ui.scrubBar(0);
  }
  renderState(g, rr, which) {
    const sc = this.scrub;
    const ba = sc.before ? sc.before.active : false, aa = sc.after ? sc.after.active : false;
    const hidden = sc.n.cur && sc.n.cache[sc.n.cur] && sc.n.cache[sc.n.cur] !== sc.before && sc.n.cache[sc.n.cur] !== sc.after ? sc.n.cache[sc.n.cur] : null;
    const hA = hidden ? hidden.active : false;
    if (hidden) hidden.active = false;
    if (sc.before) sc.before.active = which === 'before';
    if (sc.after) sc.after.active = which === 'after';
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    this.rv.root.layoutTree();
    this.rv.draw(g, rr);
    if (sc.before) sc.before.active = ba;
    if (sc.after) sc.after.active = aa;
    if (hidden) hidden.active = hA;
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  updateScrub(dt) {
    const sc = this.scrub; if (!sc) return;
    sc.toolLayer.layoutTree();
    E.updateSpines(sc.toolLayer, dt);
    if (sc.finishing) return;
    const P = E.ptr;
    const tool = sc.toolNode;
    if (P.down) {
      const gx = P.x, gy = P.y;
      if (!sc.started) { sc.started = true; sc.hint = null; }
      tool.posOverride = { x: gx, y: gy };
      sc.toolLayer.layoutTree();
      const tp = sc.tp.worldPos();
      if (sc.last) this.stroke(sc.last[0], sc.last[1], tp[0], tp[1]); else this.stroke(tp[0], tp[1], tp[0], tp[1]);
      sc.last = tp;
      if (sc.toolSk && !sc.tool.hit && sc.working !== true) { E.setAnim(sc.toolSk, 'work', true); sc.working = true; }
      if (sc.tool.loop) { if (!sc.sndOn) { E.audio.play(sc.tool.snd, true); sc.sndOn = true; } }
      else { sc.sndT -= dt; if (sc.sndT <= 0 && sc.moved) { E.audio.play(sc.tool.snd); sc.sndT = 0.7; if (sc.toolSk && E.hasAnim(sc.toolSk, 'work')) { E.setAnim(sc.toolSk, 'work', false); E.addAnim(sc.toolSk, 'idle', true, 0); } } }
      this.app.fx.emit(sc.tool.scene === 'SprayTool' ? 'spray' : 'dust', sc.tp);
    } else {
      sc.last = null;
      if (sc.working) { if (sc.toolSk) E.setAnim(sc.toolSk, 'idle', true); sc.working = false; }
      if (sc.sndOn) { E.audio.stopById(sc.tool.snd); sc.sndOn = false; }
    }
    if (sc.hint) sc.hint.t += dt;
  }
  stroke(x0, y0, x1, y1) {
    const sc = this.scrub;
    const cl = (v, m) => Math.max(-m, Math.min(m, v));
    x0 = cl(x0, E.W); x1 = cl(x1, E.W); y0 = cl(y0, E.H); y1 = cl(y1, E.H);
    const k = E.scale; // logical -> canvas px
    const W = E.canvas.width, H = E.canvas.height;
    const cx = (x) => W / 2 + x * k, cy = (y) => H / 2 - y * k;
    const R = BRUSH_R * k;
    const dist = Math.hypot(x1 - x0, y1 - y0) * k;
    sc.moved = dist > 2;
    const steps = Math.max(1, Math.ceil(dist / (R * 0.35)));
    const g = sc.gM;
    for (let i = 0; i <= steps; i++) {
      const X = cx(x0 + ((x1 - x0) * i) / steps), Y = cy(y0 + ((y1 - y0) * i) / steps);
      const gr = g.createRadialGradient(X, Y, 0, X, Y, R);
      gr.addColorStop(0, 'rgba(0,0,0,0.30)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(X, Y, R, 0, 7); g.fill();
      // progress bookkeeping on the low-res grid
      const c = sc.cell, rc = R / c;
      const gx = X / c, gy = Y / c;
      const x0c = Math.max(0, Math.floor(gx - rc)), x1c = Math.min(sc.lw - 1, Math.ceil(gx + rc));
      const y0c = Math.max(0, Math.floor(gy - rc)), y1c = Math.min(sc.lh - 1, Math.ceil(gy + rc));
      for (let yy = y0c; yy <= y1c; yy++) for (let xx = x0c; xx <= x1c; xx++) {
        const d = Math.hypot(xx + 0.5 - gx, yy + 0.5 - gy) / rc;
        if (d >= 1) continue;
        const idx = yy * sc.lw + xx;
        const before = sc.paint[idx];
        if (before >= 1) continue;
        const add = d < 0.6 ? 0.3 : 0.3 - (d - 0.6) * 0.6;
        sc.paint[idx] = before + add;
        if (sc.paint[idx] >= 0.95 && sc.diff[idx]) sc.done++;
      }
    }
    sc.p = sc.done / sc.total;
    this.app.ui.scrubBar(Math.min(1, sc.p / SCRUB_DONE));
    if (sc.p >= SCRUB_DONE) this.finishScrub();
  }
  async finishScrub() {
    const sc = this.scrub; if (!sc || sc.finishing) return;
    sc.finishing = true;
    if (sc.sndOn) { E.audio.stopById(sc.tool.snd); sc.sndOn = false; }
    // wipe the rest away
    const g = sc.gM;
    await new Promise((r) => E.tween({ dur: 0.45, keep: true, update: (k) => { g.globalAlpha = 0.25; g.fillStyle = '#000'; g.fillRect(0, 0, g.canvas.width, g.canvas.height); }, done: r }));
    g.globalAlpha = 1;
    // tool flies off and fades
    const tn = sc.toolNode;
    E.tween({ dur: 0.3, keep: true, update: (k) => { tn.alpha = 1 - k; } });
    const n = sc.n;
    this.commit(n, false);
    await this.setItem(n, n.row.isClear ? null : this.panelSel || n.news[0]);
    if (sc.after && n.row.isLoop) this.playAll(sc.after, 'Normal', true);
    this.playSound(n, n.row.oneTimeClean && !this.ns(n.id).once);
    this.sparkle(n);
    this.scrub = null;
    this.app.scrubbing = false;
    this.app.ui.scrubBar(-1);
    await E.wait(1.2);
    this.endNode(n, true);
  }
  drawScrub(ctx) {
    const sc = this.scrub;
    // after-state is on screen already; overlay the before-state with the scrubbed holes punched out
    this.renderState(sc.gA, sc.rA, 'before');
    const g = sc.gA;
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(sc.mask, 0, 0);
    g.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sc.cA, 0, 0);
    // tool + hint
    sc.toolLayer.layoutTree();
    E.drawTree(ctx, sc.toolLayer);
    if (sc.hint) this.app.ui.drawHintHand(ctx, sc.hint);
  }

  // ---------- room complete (RoomRewardBoxLogic + RoomTimeLineManager) ----------
  async checkComplete() {
    const st = this.st();
    if (this.app.roomRate(this.id) < 1 || st.gotBox) return;
    st.gotBox = true; this.app.save();
    this.busy = true; this.hideBubbles = true;
    E.audio.play('g39');
    await E.wait(1.2);
    await this.playTimeline();
    this.hideBubbles = false; this.busy = false;
    this.app.onRoomComplete(this.id);
  }
  async playTimeline() {
    const tl = this.app.tables.timeline.find((t) => t.roomId === this.id);
    if (!tl) return;
    this.app.playRoomSound(this.id, tl.sound);
    for (const n of this.nodes) {
      if (n.row.isClear || n.row.notClearGraphic) continue;
      await this.setItem(n, n.row.isHideOld ? null : n.old);
    }
    const t0 = E.time;
    await Promise.all(tl.showRoomNode.map((nid, i) => (async () => {
      await E.wait(tl.showTimeLine[i] || 0);
      const n = this.nodeById(nid); if (!n) return;
      const s = this.ns(nid);
      const it = await this.setItem(n, s.sel || n.news[0]);
      if (it) { const d = this.playAll(it, 'first_confirm', false); if (n.row.isLoop) E.after(Math.max(0.1, d), () => this.playAll(it, 'Normal', true)); }
    })()));
    await E.wait(Math.max(0, tl.showTime - (E.time - t0)));
    for (const n of this.nodes) await this.showState(n);
    for (let i = 0; i < 4; i++) this.app.fx.starBurst((Math.random() - 0.5) * 500, (Math.random() - 0.3) * 700);
    await E.wait(1.5);
  }

  update(dt) {
    this.layout(); this.rv.update(dt); this.layout();
    if (this.scrub) this.updateScrub(dt);
    this.updateBubbles();
  }
  draw(ctx) {
    this.rv.draw(ctx);
    if (this.scrub) this.drawScrub(ctx);
  }
}

// ---------------- app ----------------
class HomeApp {
  constructor() {
    this.mode = 'boot';
    this.input = true;
    this.panel = false;
    this.scrubbing = false;
    this.load();
  }
  load() {
    try { this.prog = JSON.parse(localStorage.getItem(SAVE_HOME)); } catch (e) { this.prog = null; }
    if (!this.prog || this.prog.chapter !== CHAPTER) this.prog = { chapter: CHAPTER, cur: 0, unlocked: [], rooms: {}, asmr: 'A' };
  }
  save() { try { localStorage.setItem(SAVE_HOME, JSON.stringify(this.prog)); } catch (e) {} }
  str(k) { return (this.strings && this.strings[k]) || ''; }
  toast(m) { window.UI.toast(m); }
  async boot(game, onProgress) {
    this.game = game;
    const j = (f) => fetch('assets/' + f).then((r) => r.json());
    const [room, node, chapter, map, timeline, strings, snd] = await Promise.all([j('room.json'), j('roomnode.json'), j('roomchapter.json'), j('roommap.json'), j('roomanimtimeline.json'), j('strings.json'), j('sounds_room.json')]);
    onProgress(0.55);
    this.tables = { room, node, chapter, map, timeline };
    this.strings = strings.en || {};
    this.sndNames = snd;
    this.chapter = chapter.find((c) => c.id === CHAPTER);
    this.mapRows = map.filter((r) => r.group === CHAPTER || r.id === 601);
    if (!this.prog.cur) this.prog.cur = this.chapter.roomIds[0];
    for (const id of [this.chapter.roomIds[0], ...(this.chapter.activityRoomIds || [])]) if (!this.prog.unlocked.includes(id)) this.prog.unlocked.push(id);
    this.save();
    E.audio.load('map_unlock', 'assets/snd/sfx_map_HouseUnlock.wav');
    E.audio.load('map_complete', 'assets/snd/sfx_map_HouseComplete.wav');
    E.audio.load('g39', 'assets/snd/activity_town_reward.wav');
    const icons = new Set(['ui_icon_main_sweep', 'UIDecorationMain_RoomBG1', 'UIDecorationMain_RoomBG2', 'UIDecorationMain_RoomBG3', 'UIDecorationMain_RoomBG4', 'UIDecorationMain_RoomBG5', 'UIDecorationMain_RoomBG6']);
    for (const n of node) if (AVAILABLE.has(n.roomId)) icons.add(n.iconResName);
    for (const r of room) if (r.mapImgComplete) icons.add(r.mapImgComplete);
    await Promise.all([...icons].map(async (n) => { const im = await E.loadImage('map/' + n, 'assets/map/' + n + '.webp'); if (im) E.img[n] = im; }));
    onProgress(0.75);
    this.fx = new FX();
    this.map = new HomeMap(this);
    await this.map.load();
    this.ui = new HomeUI(this);
    await this.ui.load();
    this.ui.buildHud();
    onProgress(0.95);
    E.onPointerDown = (x, y) => this.pointerDown(x, y);
    E.onPointerMove = (x, y) => this.pointerMove(x, y);
    E.onPointerUp = (x, y) => this.pointerUp(x, y);
  }
  roomCfg(id) { return this.tables.room.find((r) => r.id === id); }
  roomAvailable(id) { return AVAILABLE.has(id); }
  nodesOf(id) { return this.tables.node.filter((n) => n.roomId === id); }
  roomState(id) { if (!this.prog.rooms[id]) this.prog.rooms[id] = { nodes: {}, gotBox: false }; return this.prog.rooms[id]; }
  countable(id) { return this.nodesOf(id).filter((n) => !n.isRvGet && !(n.nodeBehaviour > 0)); }
  roomRate(id) {
    if (!this.prog.unlocked.includes(id) || !this.prog.rooms[id]) return 0;
    const S = this.prog.rooms[id];
    const ns = this.countable(id);
    if (!ns.length) return 0;
    return ns.filter((n) => S.nodes[n.id] && S.nodes[n.id].s >= 2).length / ns.length;
  }
  updateHud() {
    if (!this.room) return;
    const id = this.room.id, tot = this.countable(id).length, r = this.roomRate(id);
    this.ui.updateHud(r, Math.round(r * tot), tot);
  }
  lastUnlockRoom() { let last = this.chapter.roomIds[0]; for (const id of this.chapter.roomIds) if (this.prog.unlocked.includes(id)) last = id; return last; }
  nextRoom(id) {
    const ids = this.chapter.roomIds; const i = ids.indexOf(id);
    for (let k = i + 1; k < ids.length; k++) { const r = this.roomCfg(ids[k]); if (r && !r.isComingSoon) return ids[k]; }
    return 0;
  }
  asmrLevelOf(row) { if (this.prog.asmr === 'B' && row.asmrLevelB > 0) return row.asmrLevelB; return row.asmrLevel || 0; }
  playRoomSound(roomId, id) {
    const name = this.sndNames[id]; if (!name) return;
    const key = 'r' + roomId + '_' + name;
    if (E.audio.buf[key]) { E.audio.play(key); return; }
    const tryLoad = async (nm) => {
      try {
        const r = await fetch('assets/rooms/' + roomId + '/snd/' + nm + '.wav'); if (!r.ok) return false;
        E.audio.buf[key] = await E.audio.ctx.decodeAudioData(await r.arrayBuffer()); return true;
      } catch (e) { return false; }
    };
    (async () => { if (!E.audio.ctx) return; if (!(await tryLoad(name))) await tryLoad(name.replace('70026', '70027')); E.audio.play(key); })();
  }

  // ---------- scenes ----------
  setScene(mode) {
    this.mode = mode;
    E.root = null;
    E.overlays = [(ctx) => this.draw(ctx)];
    E.update = (dt) => this.update(dt);
    window.UI.setMode(mode);
  }
  async showMap(unlockRoom, finishRoom) {
    this.map.open(unlockRoom, finishRoom);
    this.setScene('map');
    this.map.alpha = 0;
    E.tween({ dur: 0.3, keep: true, update: (k) => { this.map.alpha = k; } });
  }
  openMapFromRoom() { this.showMap(); }
  closeMap() {
    if (!this.room) return;
    E.tween({ dur: 0.25, keep: true, update: (k) => { this.map.alpha = 1 - k; }, done: () => this.setScene('room') });
  }
  async enterRoom(id) {
    if (!this.roomAvailable(id)) { this.toast('This house is not included in this build'); return; }
    if (this.room && this.room.id === id) { this.closeMap(); return; }
    await this.ui.transition(async () => {
      try {
        const sc = new RoomScene(this, id);
        await sc.load();
        this.room = sc;
        this.prog.cur = id; this.save();
        this.setScene('room');
        this.updateHud();
      } catch (e) { console.error(e); this.toast('Failed to load house ' + id); }
    });
  }
  onRoomComplete(id) {
    const next = this.nextRoom(id);
    if (!next || this.lastUnlockRoom() !== id) return;
    const cfg = this.roomCfg(next);
    const avail = this.roomAvailable(next);
    this.ui.showUnlock({
      img: cfg && cfg.mapImgComplete, name: this.str(cfg && cfg.roomName) || 'New house',
      note: avail ? '' : 'This house is downloaded from the server in the original game\nand is not inside the APK.',
      button: avail ? 'Unlock' : 'OK',
      onOk: () => {
        if (!avail) { this.showMap(); return; }
        this.prog.unlocked.push(next); this.save();
        const row = this.mapRows.find((r) => r.roomIds && r.roomIds.includes(next));
        if (row && row.roomIds.indexOf(next) > 0) { this.enterRoom(next); return; }
        this.showMap(next, id);
      },
    });
  }
  // ASMR minigame node (UIPopupMask fade -> FlushGameManager.InitAsmrGame)
  async playAsmr(level, onDone, onQuit) {
    this.input = false;
    await this.ui.fade(true);
    this.mode = 'asmr';
    window.UI.setMode('asmr');
    this.game.onFinish = () => this.backFromAsmr(onDone);
    this.game.onQuit = () => this.backFromAsmr(onQuit);
    E.overlays = [(ctx) => this.ui.draw(ctx)];
    await window.UI.play(level);
    this.input = true;
    await this.ui.fade(false);
  }
  async backFromAsmr(cb) {
    await this.ui.fade(true);
    E.audio.stopAll();
    E.killOwner(this.game);
    this.game.level = null;
    E.onPointerDown = (x, y) => this.pointerDown(x, y);
    this.setScene('room');
    await this.ui.fade(false);
    cb && cb();
  }

  // ---------- loop ----------
  update(dt) {
    this.fx.update(dt);
    if (this.mode === 'map') this.map.update(dt);
    else if (this.mode === 'room' && this.room) this.room.update(dt);
  }
  draw(ctx) {
    if (this.mode === 'map') {
      if (this.room) this.room.draw(ctx);
      ctx.save(); ctx.globalAlpha = this.map.alpha === undefined ? 1 : this.map.alpha; this.map.draw(ctx); ctx.restore();
    } else if (this.mode === 'room' && this.room) this.room.draw(ctx);
    const v = E.view; ctx.setTransform(v[0], v[1], v[2], v[3], v[4], v[5]);
    this.fx.draw(ctx, 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ui.draw(ctx);
  }
  pointerDown(x, y) {
    if (this.mode === 'asmr') { if (this.input) this.game.pointerDown(x, y); return; }
    if (!this.input || window.UI.modal || (this.ui && this.ui.transOn)) return;
    this.downAt = [x, y];
    if (this.ui.popup) return;
    if (this.mode === 'map') this.map.pointerDown(x, y);
  }
  pointerMove(x, y) { if (this.mode === 'map' && this.input && !this.ui.popup) this.map.pointerMove(x, y); }
  pointerUp(x, y) {
    if (this.mode === 'asmr' || !this.input || window.UI.modal) return;
    const tap = this.downAt && Math.hypot(x - this.downAt[0], y - this.downAt[1]) < 25;
    this.downAt = null;
    if (this.ui.popup) { if (tap) this.ui.tap(x, y); return; }
    if (this.mode === 'map') { this.map.pointerUp(x, y); return; }
    if (this.mode === 'room' && tap && !this.scrubbing) { if (!this.ui.tap(x, y) && this.room) this.room.tap(x, y); }
  }
}
window.HomeApp = HomeApp;
