// Renders a room2d scene: world-space SpriteRenderers + SkeletonAnimations (with SkeletonRenderSeparator parts),
// sorted by sortingOrder like Unity. Coordinates are Unity world units * 100 (= pixels), y up.
'use strict';

class RoomView {
  constructor(id, data) {
    this.id = id;
    this.data = data;
    this.dir = 'assets/rooms/' + id + '/';
    this.root = new E.Node({ n: 'RoomRoot', t: [0, 0] });
    this.nodeItems = {}; // nodeId -> {name, node}
    this.camX = 0; this.camY = 0; this.zoom = 1;
  }
  sprite(name) { return this.data.sprites[name]; }
  async loadSprite(name) { const m = this.sprite(name); if (!m) return null; return E.loadImage(this.dir + 'img/' + m.f, this.dir + 'img/' + m.f + '.webp'); }
  spineAtlas(sk) { return (this.data.skel && this.data.skel[sk]) || sk; }

  // instantiate an item prefab (by item id) and attach spines
  async makeItem(itemId) {
    const def = this.data.items[itemId];
    if (!def) return null;
    const n = new E.Node(JSON.parse(JSON.stringify(def)));
    const jobs = [];
    const walk = (node, d) => {
      node.def = d;
      if (d.sr && d.sr.sp) jobs.push(this.loadSprite(d.sr.sp));
      if (d.sk && d.sk.d) jobs.push(this.attachSkel(node, d.sk));
      node.children.forEach((c, i) => walk(c, d.c[i]));
    };
    walk(n, def);
    await Promise.all(jobs);
    return n;
  }
  async attachSkel(node, sk) {
    let data;
    try { data = await E.loadSpine(sk.d, this.dir + 'spine/', this.spineAtlas(sk.d)); } catch (e) { console.warn('spine', sk.d, e); return; }
    const s = new spine.Skeleton(data);
    const sd = new spine.AnimationStateData(data); sd.defaultMix = 0.2;
    const st = new spine.AnimationState(sd);
    try { if (sk.skin) s.setSkinByName(sk.skin); else if (data.defaultSkin) s.setSkin(data.defaultSkin); } catch (e) {}
    s.setToSetupPose();
    if (sk.a && data.findAnimation(sk.a)) st.setAnimation(0, sk.a, !!sk.l);
    st.apply(s); s.updateWorldTransform();
    node.sk = s; node.st = st; node.ts = sk.ts || 1; node.skDef = sk;
  }

  // ---------- drawing ----------
  collect(n, out, alpha) {
    if (!n.active) return;
    alpha *= n.alpha;
    if (alpha <= 0.002) return;
    const d = n.def || {};
    if (d.sr && d.sr.en !== 0 && d.sr.sp) out.push({ ord: d.sr.ord, lay: d.sr.lay || 0, kind: 'sr', n, alpha, seq: out.length });
    if (n.sk) {
      const parts = n.children.filter((c) => c.def && c.def.part && c.def.mr);
      if (parts.length && n.skDef.sep && n.skDef.sep.length) {
        parts.forEach((p, i) => { if (p.def.mr.en !== 0) out.push({ ord: p.def.mr.ord, lay: p.def.mr.lay || 0, kind: 'part', n, part: i, alpha, seq: out.length }); });
      } else {
        const mr = d.mr || { ord: 0, lay: 0 };
        out.push({ ord: mr.ord, lay: mr.lay || 0, kind: 'sk', n, alpha, seq: out.length });
      }
    }
    for (const c of n.children) if (!(c.def && c.def.ps)) this.collect(c, out, alpha);
  }
  draw(ctx, renderers) {
    this._r = renderers || null;
    const out = [];
    this.collect(this.root, out, 1);
    out.sort((a, b) => a.lay - b.lay || a.ord - b.ord || a.seq - b.seq);
    for (const it of out) {
      const v = E.mul(E.view, it.n.world);
      ctx.setTransform(v[0], v[1], v[2], v[3], v[4], v[5]);
      ctx.globalAlpha = it.alpha;
      if (it.kind === 'sr') this.drawSprite(ctx, it.n);
      else this.drawSkel(ctx, it.n, it.kind === 'part' ? it.part : -1, it.alpha);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  drawSprite(ctx, n) {
    const sr = n.def.sr;
    const m = this.sprite(sr.sp);
    const im = m && E.img[this.dir + 'img/' + m.f];
    if (!im) return;
    ctx.save();
    if (sr.col) ctx.globalAlpha *= sr.col[3];
    ctx.scale(sr.fx ? -1 : 1, sr.fy ? 1 : -1);
    const w = m.w * (100 / m.ppu), h = m.h * (100 / m.ppu);
    ctx.drawImage(im, -m.px * w, -(1 - m.py) * h, w, h);
    ctx.restore();
  }
  drawSkel(ctx, n, part, alpha) {
    const sk = n.sk;
    const all = sk.drawOrder;
    let from = 0, to = all.length;
    if (part >= 0) {
      const seps = n.skDef.sep;
      const idx = seps.map((nm) => all.findIndex((s) => s.data.name === nm));
      const bounds = [0, ...idx.map((i) => (i < 0 ? all.length : i + 1)), all.length];
      from = bounds[part]; to = bounds[part + 1] !== undefined ? bounds[part + 1] : all.length;
    }
    if (to <= from) return;
    const mul = n.parent && n.parent.def && n.def.mul ? n.def.mul : n.def.mul || null;
    const r = this._r ? (sk.data._hasMesh ? this._r.tri : this._r.img) : (sk.data._hasMesh ? E.rendererTri : E.rendererImg);
    const slice = all.slice(from, to);
    // split into runs by blend (multiply slots from custom materials, additive from spine data)
    let run = [], runBlend = null;
    const flush = () => {
      if (!run.length) return;
      sk.drawOrder = run;
      ctx.globalCompositeOperation = runBlend;
      r.draw(sk);
      run = [];
    };
    for (const s of slice) {
      let b = 'source-over';
      if (mul && mul.includes(s.data.name)) b = 'multiply';
      else if (s.data.blendMode === spine.BlendMode.Additive) b = 'lighter';
      else if (s.data.blendMode === spine.BlendMode.Multiply) b = 'multiply';
      else if (s.data.blendMode === spine.BlendMode.Screen) b = 'screen';
      if (b !== runBlend) { flush(); runBlend = b; }
      run.push(s);
    }
    flush();
    sk.drawOrder = all;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
  }
  update(dt) {
    const walk = (n) => {
      if (!n.active) return;
      if (n.sk) { n.st.update(dt * (n.ts || 1)); n.st.apply(n.sk); n.sk.updateWorldTransform(); }
      for (const c of n.children) walk(c);
    };
    walk(this.root);
  }
}
window.RoomView = RoomView;
