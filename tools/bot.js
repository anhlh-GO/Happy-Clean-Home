// Test bot: drives the canvas with synthetic pointer events. Load in the console: fetch('tools/bot.js').then(r=>r.text()).then(eval)
window.T = {
  cl(x, y) { const r = E.canvas.getBoundingClientRect(); return [r.left + ((x + E.W / 2) / E.W) * r.width, r.top + ((E.H / 2 - y) / E.H) * r.height]; },
  ev(t, x, y) { const [cx, cy] = this.cl(x, y); E.canvas.dispatchEvent(new PointerEvent(t, { clientX: cx, clientY: cy, pointerId: 1, bubbles: true, isPrimary: true })); },
  down(x, y) { this.ev('pointerdown', x, y); },
  move(x, y) { this.ev('pointermove', x, y); },
  up(x, y) { this.ev('pointerup', x, y); },
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },
  async waitFor(f, ms = 20000) { const t = performance.now(); while (!f() && performance.now() - t < ms) await this.sleep(100); return !!f(); },
  async tap(n) { game.layout(); const p = n.rectWorldCenter(); this.down(p[0], p[1]); await this.sleep(120); this.up(p[0], p[1]); },
  // zig-zag over the dirty picture until the wash step finishes (or the time budget runs out)
  async scrub(ms = 25000, startNode) {
    const w = game.wash;
    game.layout();
    const [a, b] = w.rawMask.worldCorners();
    const x0 = Math.max(a[0], -E.W / 2 + 30), x1 = Math.min(b[0], E.W / 2 - 30);
    const y0 = Math.max(a[1], -E.H / 2 + 120), y1 = Math.min(b[1], E.H / 2 - 150);
    const t0 = performance.now();
    if (startNode) { const p = startNode.worldPos(); this.down(p[0], p[1]); } else this.down(x0, y1);
    await this.sleep(60);
    for (let y = y1; y > y0 && !w.finished && performance.now() - t0 < ms; y -= 45) {
      for (let x = x0; x <= x1 && !w.finished; x += 22) { this.move(((y1 - y) / 45) % 2 ? x1 - (x - x0) : x, y); await this.sleep(20); }
    }
    this.up(0, 0);
    return w.lastFinishPercent;
  },
  // drag across every remaining hit area of the current drag group
  async sweepDrag(startNode) {
    const d = game.dragCtrl;
    const p0 = startNode.worldPos();
    this.down(p0[0], p0[1]);
    await this.sleep(300);
    for (let i = 0; i < d._hitAreas.length; i++) {
      if (d._cleared[i] || !d._hitAreas[i]) continue;
      const c = d._hitAreas[i].rectWorldCenter();
      for (let k = 1; k <= 8; k++) { this.move(p0[0] + ((c[0] - p0[0]) * k) / 8, p0[1] + ((c[1] - p0[1]) * k) / 8); await this.sleep(25); }
    }
    this.up(0, 0);
  },
  // scrub the current room node until finished (zig-zag over the changed area)
  async scrubNode(ms = 30000) {
    const sc = app.room.scrub; if (!sc) return false;
    if (!sc.diff || !sc.diff.some((v) => v)) return false;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < sc.diff.length; i++) if (sc.diff[i]) { const x = i % sc.lw, y = (i / sc.lw) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const k = E.scale, c = sc.cell, W = E.canvas.width, H = E.canvas.height;
    const L = (x) => (x * c - W / 2) / k, Tt = (y) => (H / 2 - y * c) / k;
    const tp = sc.tp.worldPos(), tr = sc.toolNode.worldPos(), ox = tp[0] - tr[0], oy = tp[1] - tr[1];
    const t0 = performance.now();
    this.down(L(x0) - ox, Tt(y0) - oy);
    for (let row = 0; app.room.scrub && performance.now() - t0 < ms; row++) {
      const yy = y0 + ((row * 7) % Math.max(1, y1 - y0 + 1));
      for (let s = 0; s <= 14 && app.room.scrub; s++) { const xx = row % 2 ? x1 - ((x1 - x0) * s) / 14 : x0 + ((x1 - x0) * s) / 14; this.move(L(xx) - ox, Tt(yy) - oy); await this.sleep(18); }
    }
    this.up(0, 0);
    return !app.room.scrub;
  },
  log: [],
};
