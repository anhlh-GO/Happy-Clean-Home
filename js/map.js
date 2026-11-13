// Home map (port of UIRoomMapController / RoomMapItem / UIRoomMapBubble / UIRoomMapProgress), chapter 1006.
'use strict';

const MAP_W = 768, MAP_H = 4714;
// map px (top-left origin): background layers then houses in prefab order (draw order)
const MAP_BG = [
  ['UIMergeMap_BG1', 384, 2042, 768, 1024], ['UIMergeMap_BG6', 385, 1447, 768, 807], ['UIMergeMap_BG7', 385, 684, 768, 1368],
  ['UIMergeMap_BG2', 384, 3065, 768, 1024], ['UIMergeMap_BG3', 385, 3706, 768, 258], ['UIMergeMap_BG5', 385, 4276, 768, 883],
  ['UIMergeMap_DecorateBG1', 432, 3079, 141, 146],
];
// node, cx, cy, rect w,h, img dx,dy(y-up), img w,h
const MAP_HOUSES = [
  ['PinkBigRoom1', 550, 311, 508, 391, 0, 0, 437, 361], ['BlueBigRoom2', 205, 662, 508, 391, 0, 0, 408, 340],
  ['PurpleBigRoom3', 596, 609, 508, 391, 0, 0, 347, 419], ['OrangeBigRoom2', 357, 1045, 508, 391, 0, 0, 712, 507],
  ['GreenBigRoom2', 255, 1397, 508, 391, 0, 0, 508, 391], ['OrangeBigRoom1', 564, 1278, 410, 364, 0, 0, 410, 364],
  ['RedSmallRoom1', 168, 1634, 335, 298, 0, 0, 335, 298], ['PurpleSmallRoom1', 590, 1518, 359, 255, 0, 0, 359, 255],
  ['#LampBG1', 372, 1579, 184, 204, 0, 0, 184, 204],
  ['BlueSmallRoom1', 541, 1749, 298, 250, 0, 0, 322, 283], ['PurpleBigRoom1', 218, 1898, 433, 337, 29, 0, 492, 398],
  ['GreenSmallRoom1', 602, 2006, 286, 310, 0, 0, 339, 312], ['YellowSmallRoom1', 309, 2154, 229, 219, 0, 0, 229, 219],
  ['RedBigRoom1', 583, 2295, 368, 269, -33, 0, 435, 269], ['OrangeSmallRoom1', 142, 2344, 255, 253, 0, 0, 277, 349],
  ['GreenBigRoom1', 528, 2595, 442, 330, 0, 0, 481, 381], ['BrownSmallRoom1', 163, 2628, 326, 205, 0, -42, 326, 302],
  ['BlueBigRoom1', 219, 2887, 418, 293, 0, 0, 418, 293], ['BrownSmallRoom2', 631, 2888, 275, 289, 0, 0, 275, 289],
  ['BlueSmallRoom2', 643, 3120, 250, 180, 0, 0, 250, 180], ['RedBigRoom2', 362, 3266, 348, 298, 0, 0, 470, 362],
  ['PinkSmallRoom1', 52, 3241, 105, 209, 0, 0, 105, 209], ['PurpleBigRoom2', 668, 3395, 203, 224, -16, 14, 235, 258],
  ['BrownSmallRoom3', 146, 3478, 291, 230, 0, 0, 291, 230], ['BrownBigRoom1', 527, 3612, 480, 219, -20, 32, 523, 289],
  ['#DecorateBG2', 282, 3675, 540, 203, 0, 0, 540, 203], ['#DecorateBG3', 700, 1631, 139, 71, 0, 0, 139, 71],
  ['#DecorateBG4', 126, 4308, 25, 33, 0, 0, 25, 33],
  ['RedsmailRoom1', 144, 3990, 289, 290, 2, 0, 289, 290], ['ChristmasRoom', 550, 4161, 434, 416, -34, 26, 505, 498],
];
const HEAD = (id) => 'Head_' + (id <= 15 ? id + 1 : id);
const PLAYER_HEAD = 'Head_19';

class HomeMap {
  constructor(app) {
    this.app = app;
    this.scroll = 0; this.vel = 0;
    this.drag = null;
    this.fxT = 0;
  }
  async load() {
    const names = new Set(['UIRoomMap_MapPubbleBG1', 'UIRoomMap_MapPubbleBG2', 'UIRoomMap_MapPubbleBG3', 'UIRoomMap_MapPubbleBG4_1', 'UIRoomMap_MapPubbleBG5',
      'UIRoomMapNode_BG1', 'UIRoomMapNode_BG2', 'UIRoomMapNode_BG3', 'Lock', 'Right', 'Home12', 'UIMergeMap_BG4', 'UIMergeMap_LampBG1', PLAYER_HEAD]);
    for (const b of MAP_BG) names.add(b[0]);
    for (const h of MAP_HOUSES) names.add(h[0][0] === '#' ? 'UIMergeMap_' + h[0].slice(1) : 'UIMergeMap_' + h[0]);
    for (const r of this.app.mapRows) if (r.newHeadIcon !== undefined) names.add(HEAD(r.newHeadIcon));
    await Promise.all([...names].map((n) => E.loadImage('map/' + n, 'assets/map/' + n + '.webp')));
  }
  im(n) { return E.img['map/' + n]; }

  // ---------- state ----------
  houseOf(row) { return MAP_HOUSES.find((h) => h[0] === row.node); }
  bubbleState(row) {
    const P = this.app.prog;
    if (!row.roomIds || !row.roomIds.length) return 0;
    if (this.app.roomCfg(row.roomIds[0]) && this.app.roomCfg(row.roomIds[0]).isComingSoon) return 6;
    if (!row.roomIds.some((id) => P.unlocked.includes(id))) return 8;
    if (this.unlockAnim && row.roomIds.includes(this.unlockAnim.room) && this.unlockAnim.phase < 2) return 7;
    if (row.roomIds.includes(this.app.lastUnlockRoom())) return 5;
    if (row.roomIds.every((id) => this.app.roomRate(id) >= 1)) return 4;
    return 1;
  }
  progress(row) { return row.roomIds.reduce((a, id) => a + this.app.roomRate(id), 0) / row.roomIds.length; }

  // ---------- open ----------
  open(unlockRoom, finishRoom) {
    this.active = true;
    this.unlockAnim = null;
    this.showNodesFor = null;
    const last = this.app.lastUnlockRoom();
    const rows = this.app.mapRows;
    const idx = Math.max(0, rows.findIndex((r) => r.roomIds && r.roomIds.includes(last)));
    const s = E.W / MAP_W, V = E.H / s;
    let top;
    if (idx <= 3) top = 3809 - V;
    else { const h = this.houseOf(rows[idx]); top = h[2] - h[4] / 2 - 0.28571 * V; }
    this.scroll = Math.max(0, Math.min(MAP_H - V, top));
    this.vel = 0;
    if (unlockRoom) {
      this.unlockAnim = { room: unlockRoom, finish: finishRoom, phase: 0, t: 0 };
      this.app.input = false;
      const fr = finishRoom && rows.find((r) => r.roomIds && r.roomIds.includes(finishRoom));
      if (fr) { this.finishFx = { row: fr, t: 0 }; E.audio.play('map_complete'); }
      E.after(fr ? 2.2 : 0.5, () => {
        this.unlockAnim.phase = 1; E.audio.play('map_unlock');
        const nr = rows.find((r) => r.roomIds && r.roomIds.includes(unlockRoom));
        if (nr) { const h = this.houseOf(nr); const want = h[2] - h[4] / 2 - 0.3 * V; this.scrollTo(Math.max(0, Math.min(MAP_H - V, want))); }
        this.popT = 0;
        E.after(0.9, () => { this.unlockAnim.phase = 2; this.popT = 0; this.app.input = true; });
      });
    }
  }
  scrollTo(y) { const y0 = this.scroll; E.tween({ dur: 0.8, ease: E.ease.inOutSine, update: (k) => { this.scroll = y0 + (y - y0) * k; } }); }

  // ---------- input ----------
  toMap(x, y) { const s = E.W / MAP_W; return [(x + E.W / 2) / s, (E.H / 2 - y) / s + this.scroll]; }
  pointerDown(x, y) { this.drag = { y, y0: y, s0: this.scroll, t: performance.now(), moved: false, lastY: y, lastT: performance.now() }; this.vel = 0; }
  pointerMove(x, y) {
    if (!this.drag) return;
    const s = E.W / MAP_W;
    const dy = (y - this.drag.y0) / s;
    if (Math.abs(y - this.drag.y0) > 12) this.drag.moved = true;
    const V = E.H / s;
    this.scroll = Math.max(0, Math.min(MAP_H - V, this.drag.s0 + dy));
    const now = performance.now();
    const dt = Math.max(1, now - this.drag.lastT);
    this.vel = ((y - this.drag.lastY) / s / dt) * 1000;
    this.drag.lastY = y; this.drag.lastT = now;
  }
  pointerUp(x, y) {
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (d.moved) return;
    this.vel = 0;
    this.tap(x, y);
  }
  tap(x, y) {
    const [mx, my] = this.toMap(x, y);
    // back button (bottom-left)
    if (this.backHit(x, y)) { this.app.closeMap(); return; }
    // node buttons
    for (const nb of this.nodeButtons || []) {
      if (Math.hypot(mx - nb.x, my - nb.y) < 48) { if (nb.unlocked) this.app.enterRoom(nb.room); return; }
    }
    // bubbles then houses (top-most first)
    const rows = this.app.mapRows;
    const hits = [];
    for (const r of rows) {
      const h = this.houseOf(r); if (!h) continue;
      const bx = h[1] + (r.bubbleOffset ? r.bubbleOffset[0] : 0), by = h[2] - (r.bubbleOffset ? r.bubbleOffset[1] : 0);
      if (Math.hypot(mx - bx, my - (by - 10)) < 70) hits.push([r, 2]);
      else if (Math.abs(mx - h[1]) < h[3] / 2 && Math.abs(my - h[2]) < h[4] / 2) hits.push([r, 1, MAP_HOUSES.indexOf(h)]);
    }
    hits.sort((a, b) => b[1] - a[1] || (b[2] || 0) - (a[2] || 0));
    if (hits.length) this.handleClick(hits[0][0]);
  }
  handleClick(row) {
    const st = this.bubbleState(row);
    if (st === 6 || st === 0) { if (st === 6) this.app.toast('Coming Soon...'); return; }
    if (st === 8) { this.app.toast('Complete the previous house to unlock'); return; }
    if (row.roomIds.length > 1) {
      if (st === 4) { this.showNodesFor = row; return; }
      if (st === 5) { this.app.enterRoom(this.app.lastUnlockRoom()); return; }
      return;
    }
    if (st === 5) this.app.enterRoom(this.app.lastUnlockRoom());
    else this.app.enterRoom(row.roomIds[0]);
  }
  backHit(x, y) { const bx = -E.W / 2 + 70, by = -E.H / 2 + 90; return Math.hypot(x - bx, y - by) < 60 && this.app.room; }

  update(dt) {
    if (!this.drag && Math.abs(this.vel) > 5) {
      const s = E.W / MAP_W, V = E.H / s;
      this.scroll = Math.max(0, Math.min(MAP_H - V, this.scroll - this.vel * dt));
      this.vel *= Math.pow(0.135, dt);
    }
    this.fxT += dt;
    if (this.popT !== undefined) this.popT += dt;
    if (this.finishFx) this.finishFx.t += dt;
  }

  draw(ctx) {
    const s = E.W / MAP_W;
    const v = E.view;
    ctx.setTransform(v[0] * s, 0, 0, v[0] * s, 0, -this.scroll * v[0] * s);
    ctx.fillStyle = '#7ccf5a'; ctx.fillRect(0, this.scroll, MAP_W, E.H / s + 2);
    const di = (n, cx, cy, w, h, filter) => { const im = this.im(n); if (!im) return; if (filter) ctx.filter = filter; ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h); if (filter) ctx.filter = 'none'; };
    for (const b of MAP_BG) di(b[0], b[1], b[2], b[3], b[4]);
    const rows = this.app.mapRows;
    for (const h of MAP_HOUSES) {
      if (h[0][0] === '#') { di('UIMergeMap_' + h[0].slice(1), h[1], h[2], h[7], h[8]); continue; }
      const row = rows.find((r) => r.node === h[0]);
      const st = row ? this.bubbleState(row) : -1;
      const im = this.im('UIMergeMap_' + h[0]);
      if (!im) continue;
      // preserve aspect inside img box
      let w = h[7], hh = h[8];
      const ar = im.width / im.height;
      if (w / hh > ar) w = hh * ar; else hh = w / ar;
      di('UIMergeMap_' + h[0], h[1] + h[5], h[2] - h[6], w, hh, st === 0 || st === 6 ? 'grayscale(1)' : null);
    }
    // bubbles
    this.nodeButtons = [];
    for (const row of rows) {
      const h = this.houseOf(row); if (!h) continue;
      const st = this.bubbleState(row);
      const bx = h[1] + (row.bubbleOffset ? row.bubbleOffset[0] : 0), by = h[2] - (row.bubbleOffset ? row.bubbleOffset[1] : 0);
      const bob = Math.sin(this.fxT * 2 + h[1]) * 4;
      if (st === 8 || st === 7 || st === 4) this.drawPin(ctx, bx, by + bob, HEAD(row.newHeadIcon), st === 4 ? 'Right' : 'Lock', st === 7 && this.unlockAnim ? this.popScale() : 1);
      else if (st === 5) this.drawProgress(ctx, bx, by + bob, this.progress(row), this.unlockAnim && this.unlockAnim.room && row.roomIds.includes(this.unlockAnim.room) ? this.popScale() : 1);
      else if (st === 6) { const im = this.im('UIMergeMap_BG4'); if (im) { ctx.drawImage(im, bx - 90, by - 25, 180, 50); } ctx.fillStyle = '#676573'; ctx.font = 'bold 20px "Arial Rounded MT Bold", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Coming Soon...', bx, by); }
      if (row.roomIds && row.roomIds.length > 1 && row.nodeXOffset && (st === 5 || this.showNodesFor === row)) {
        row.roomIds.forEach((id, i) => {
          const nx = h[1] + row.nodeXOffset[i], ny = h[2] - (row.nodeYOffset ? row.nodeYOffset[i] : 0);
          const un = this.app.prog.unlocked.includes(id) && this.app.roomAvailable(id);
          di(un ? (i === 0 ? 'UIRoomMapNode_BG1' : 'UIRoomMapNode_BG2') : 'UIRoomMapNode_BG3', nx, ny, 97, 96);
          this.nodeButtons.push({ x: nx, y: ny, room: id, unlocked: un });
        });
      }
    }
    if (this.finishFx && this.finishFx.t < 3) {
      const h = this.houseOf(this.finishFx.row); const k = this.finishFx.t;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + k; const r = 60 + k * 120;
        ctx.globalAlpha = Math.max(0, 1 - k / 3); ctx.fillStyle = ['#ffd84a', '#ff7aa8', '#7ad3ff'][i % 3];
        ctx.beginPath(); ctx.arc(h[1] + Math.cos(a) * r, h[2] + Math.sin(a) * r * 0.6, 9, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // back button (only when a room is loaded)
    if (this.app.room) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const k = E.scale, im = this.im('Home12');
      const cx = 70 * k, cy = E.canvas.height - 90 * k;
      if (im) ctx.drawImage(im, cx - 62 * k, cy - 62 * k, 124 * k, 124 * k);
    }
  }
  popScale() { const t = Math.min(1, (this.popT || 0) / 0.35); return E.ease.outBack(t); }
  drawPin(ctx, x, y, head, icon, sc) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    const bg = this.im('UIRoomMap_MapPubbleBG1'), fr = this.im('UIRoomMap_MapPubbleBG4_1'), hd = this.im(head);
    if (bg) ctx.drawImage(bg, -62, -70, 124, 140);
    if (hd) { ctx.save(); ctx.beginPath(); ctx.arc(-1, -12, 52, 0, 7); ctx.clip(); ctx.drawImage(hd, -57, -68, 112, 112); ctx.restore(); }
    if (fr) ctx.drawImage(fr, -62, -70, 124, 139);
    const ic = this.im(icon);
    if (ic) { if (icon === 'Lock') ctx.drawImage(ic, -16, 9, 33, 42); else ctx.drawImage(ic, -31, -2, 70, 70); }
    ctx.restore();
  }
  drawProgress(ctx, x, y, p, sc) {
    ctx.save(); ctx.translate(x, y - 30); ctx.scale(sc * 0.82, sc * 0.82);
    const g = this.im('UIRoomMap_MapPubbleBG5'), w = this.im('UIRoomMap_MapPubbleBG2'), b = this.im('UIRoomMap_MapPubbleBG3'), hd = this.im(PLAYER_HEAD);
    if (g) ctx.drawImage(g, -100, -120, 201, 240);
    if (w) ctx.drawImage(w, -79, -100, 159, 201);
    if (b && p > 0) { const fh = 201 * Math.min(1, p); ctx.drawImage(b, 0, 201 - fh, 159, fh, -79, -100 + 201 - fh, 159, fh); }
    if (hd) { ctx.save(); ctx.beginPath(); ctx.arc(0, -25, 58, 0, 7); ctx.clip(); ctx.drawImage(hd, -64, -89, 128, 129); ctx.restore(); }
    ctx.font = 'bold 30px "Arial Rounded MT Bold", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = '#2468c8'; ctx.strokeText(Math.floor(Math.min(1, p) * 100) + '%', 0, 52);
    ctx.fillStyle = '#fff'; ctx.fillText(Math.floor(Math.min(1, p) * 100) + '%', 0, 52);
    ctx.restore();
  }
}
window.HomeMap = HomeMap;
