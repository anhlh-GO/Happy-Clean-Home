// Canvas UI rebuilt from the game's own prefabs: UILoading, UITransition, UIHomeMain (UIDecorationMain + BottomGroup),
// FurniturePointButton bubbles, SelectUI panel (UIItemGroup), UIUnlockRoom.
'use strict';

const FONT = (px) => `bold ${px}px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
const STR = {
  cancel: 'Cancel', doit: 'Do it', unlockTitle: 'New Room Unlocked', unlock: 'Unlock', play: 'Play',
  loading: (p) => `LOADING..${p}%`, swipe: 'Swipe to clean', tapItem: 'Tap a bubble to clean',
};

class HomeUI {
  constructor(app) {
    this.app = app;
    this.buttons = [];
    this.root = new E.Node({ n: 'UI', r: [0, 0, 1, 1, 0, 0, 0, 0, 0.5, 0.5] });
  }
  async load() {
    const [sc, meta] = await Promise.all([fetch('assets/ui/uiscenes.json').then((r) => r.json()), fetch('assets/ui/meta.json').then((r) => r.json())]);
    this.sc = sc;
    E.uiMeta = meta;
    const names = new Set(['ui_home_login_bg_1', 'UI_Home_Login_001', 'ui_home_login_slider_bg', 'ui_home_login_slider_top', 'BG', 'Home3', 'Home4', 'Home9', 'Home10', 'Home12', 'Common_UI_BG_1', 'Common_UI_BG_26', 'Common_UI_Button_green_1', 'CommonBtnGreen', 'CommonBtnRed', 'UIDecorationMain1', 'UIDecorationMain2', 'UIDecorationMain4', 'UIDecorationMain5', 'UIDecorationMain6', 'UIDecorationMain7', 'UIDecorationMain8', 'UIDecorationMain9', 'UIDecorationMain10', 'UIDecorationMain11']);
    await Promise.all([...names].map((n) => E.loadImage(n, 'assets/ui/' + n + '.webp')));
  }
  inst(name, path) {
    let d = this.sc[name];
    if (path) for (const p of path.split('/')) d = (d.c || []).find((c) => c.n === p);
    const n = E.instantiate(d);
    for (const x of [n, ...n.all()]) x.layout = null; // positions are baked in the prefab
    return n;
  }

  // ---------------- loading screen (UILoading) ----------------
  showLoading() {
    const L = this.inst('UILoading');
    const bg = L.find('Image');
    bg.sx = bg.sy = 1; // KeepProportionScaleByRectTransformTarget -> cover
    L.find('Layout').setActive(false); L.find('bgNode').setActive(false);
    const sl = L.find('Slider');
    sl.find('Handle Slide Area').setActive(false);
    sl.find('Background').itype = 1;
    const fill = sl.find('Fill Area/Fill'); fill.itype = 1; this.loadFill = fill;
    const info = sl.find('progressinfo'); info.font = FONT(26); info.stroke = 6; info.strokeCol = '#3a2a6a'; this.loadText = info;
    const tips = sl.find('loadingtips'); tips.txt = '';
    this.loadingNode = L;
    L.update = () => { const s = Math.max(E.W / 1290, E.H / 1920); bg.sx = bg.sy = s; };
    this.setLoading(0);
    return L;
  }
  setLoading(p) {
    if (!this.loadFill) return;
    p = Math.max(0, Math.min(1, p));
    const f = this.loadFill; f.r[0] = 0; f.r[2] = Math.max(0.06, p); f.r[1] = 0; f.r[3] = 1; f.r[4] = 0; f.r[6] = 0;
    this.loadText.txt = STR.loading(Math.floor(p * 100));
  }

  // ---------------- transition (UITransition: BG + spine "loading") ----------------
  async transition(work) {
    // UIPopupMask style: fade to black, swap scenes, fade back
    this.transOn = true;
    this.app.input = false;
    await this.fade(true);
    await work();
    await E.wait(0.15);
    await this.fade(false);
    this.transOn = false;
    this.app.input = true;
  }
  // UIPopupMask: plain fade used before/after the ASMR minigame
  async fade(toBlack) {
    this.fadeA = toBlack ? 0 : 1;
    await new Promise((r) => E.tween({ dur: 0.3, keep: true, update: (k) => { this.fadeA = toBlack ? k : 1 - k; }, done: r }));
  }

  // ---------------- room HUD (UIHomeMain) ----------------
  buildHud() {
    const H = this.inst('UIHomeMain');
    const R = H.find('Root');
    R.find('Views').img = null;
    const V = R.find('Views');
    V.find('UIWorldDecoration').setActive(false);
    const D = V.find('UIDecorationMain');
    for (const k of ['Image', 'FullScreenClose', 'SafeArea', 'PlaceBtnClone']) D.find(k).setActive(false);
    D.img = null;
    const top = D.find('TopGroup');
    top.find('CurrencyBarGroup3').setActive(false);
    top.find('BubbleGroup').setActive(false);
    const sl = top.find('Slider');
    sl.find('Text').setActive(false);
    sl.find('Background').itype = 1; sl.find('Background2').itype = 1;
    const fill = sl.find('Fill Area/Fill'); fill.itype = 1; this.hudFill = fill;
    this.hudCount = sl.find('DecorationIcon/Text'); this.hudCount.font = FONT(24); this.hudCount.stroke = 5; this.hudCount.strokeCol = '#3d2b0e';
    this.hudNodes = sl.find('Nodes/Text'); this.hudNodes.font = FONT(22); this.hudNodes.txtCol = '#2b6cc0';
    this.hudGift = sl.find('Icon/count/Text'); this.hudGift.font = FONT(18); this.hudGift.txtCol = '#fff';
    this.giftBtn = sl.find('Icon');
    // bubble template
    this.bubbleTpl = D.find('ScreenOrigin/FurniturePointButton');
    D.find('ScreenOrigin').setActive(false);
    // SelectUI panel
    this.select = D.find('SelectUI'); this.select.setActive(false);
    // main group: only the settings button
    const mg = V.find('MainGroup');
    for (const c of mg.children) c.setActive(c.name === 'TopGroup');
    const lay = mg.find('TopGroup/Layout');
    for (const c of lay.children) c.setActive(c.name === 'ButtonSet');
    const set = lay.find('ButtonSet'); set.img = null; set.r = [0.5, 0.5, 0.5, 0.5, 330, -40, 75, 75, 0.5, 0.5]; this.setBtn = set;
    mg.find('TopGroup').r[5] = -230;
    // bottom group: map (Decration) + Play
    const mid = R.find('BottomGroup/Middle');
    for (const c of mid.children) c.setActive(c.name === 'Decration' || c.name === 'Play');
    mid.find('Decration/Background').img = null;
    this.mapBtn = mid.find('Decration');
    this.playBtn = mid.find('Play');
    const pt = this.playBtn.find('Text'); pt.txt = STR.play; pt.font = FONT(40); pt.stroke = 7; pt.strokeCol = '#1d7a12';
    for (const k of ['FlyPos', 'Animation']) R.find(k).setActive(false);
    this.hud = H;
    this.bubbleLayer = new E.Node({ n: 'Bubbles', r: [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0.5, 0.5] });
    return H;
  }
  updateHud(rate, done, total) {
    if (!this.hudFill) return;
    const f = this.hudFill; f.r[0] = 0; f.r[1] = 0; f.r[3] = 1; f.r[6] = 0; f.r[7] = 0;
    const from = this.hudRate || 0;
    E.tween({ dur: 1, keep: true, update: (k) => { const v = from + (rate - from) * k; f.r[2] = v; } });
    this.hudRate = rate;
    this.hudCount.txt = `${done}/${total}`;
    this.hudNodes.txt = String(Math.max(0, total - done));
    this.hudGift.txt = Math.floor(rate * 100) + '%';
  }
  bubbleNode(icon) {
    const d = JSON.parse(JSON.stringify(findDef(this.sc.UIHomeMain, 'FurniturePointButton')));
    const n = new E.Node(d);
    n.r[0] = n.r[2] = 0.5; n.r[1] = n.r[3] = 0.5; n.r[4] = 0; n.r[5] = 0;
    const pl = n.find('PlaceBg');
    pl.find('PlaceIcon').img = icon;
    for (const c of pl.children) if (c.name === 'Icon' || c.name === 'Arrow') c.setActive(false);
    return n;
  }

  // ---------------- select panel (UIItemGroup) ----------------
  openSelect(o) {
    const S = this.select;
    S.setActive(true);
    const G = S.find('SelectFurnituresGroup');
    for (const c of G.children) c.setActive(c.name === 'CloseSelectButton' || c.name === 'SureSelectButton');
    const close = G.find('CloseSelectButton'), sure = G.find('SureSelectButton');
    close.r[4] = -177.5; close.r[5] = -116; sure.r[4] = 177.5; sure.r[5] = -116;
    for (const b of [close, sure]) { b.r[0] = b.r[2] = 0.5; b.r[1] = b.r[3] = 0.5; }
    close.find('BG').itype = 0; sure.find('BG').itype = 0;
    const ct = close.find('Text'); ct.txt = STR.cancel; ct.font = FONT(36); ct.stroke = 7; ct.strokeCol = '#a5212a';
    const stx = sure.find('Text'); stx.txt = o.okText || STR.doit; stx.font = FONT(36); stx.stroke = 7; stx.strokeCol = '#1d7a12';
    stx.r[0] = stx.r[2] = 0.5; stx.r[1] = stx.r[3] = 0.5; stx.r[4] = 0; stx.r[5] = 4; stx.r[6] = 280;
    sure.find('Icon').setActive(false); sure.find('StarText').setActive(false);
    const LG = S.find('LayoutGroup');
    LG.find('DecorationGroup').setActive(false);
    LG.find('FurnituresFourLayout').setActive(false);
    const ag = LG.find('AsmrGroup');
    const grid = LG.find('FurnituresLayout');
    LG.r = [0.5, 0.5, 0.5, 0.5, 0, 0, 768, 0, 0.5, 0.5];
    // grid of tiles (GridLayoutGroup cell 163, spacing 20x15, padding 25/20, 3 per row; 4 per row for exactly 4)
    const n = o.tiles.length;
    const cols = n === 4 ? 4 : Math.min(3, Math.max(1, n));
    const rows = Math.ceil(n / cols);
    const tiles = grid.children.filter((c) => c.name.startsWith('FurnitureItem'));
    const bg = grid.find('BG1');
    if (n && !o.asmrImg) {
      grid.setActive(true); ag && ag.setActive(false);
      const gw = cols * 163 + (cols - 1) * 20 + 50, gh = rows * 163 + (rows - 1) * 15 + 40;
      grid.r = [0.5, 0.5, 0.5, 0.5, 0, -46 + gh / 2, gw, gh, 0.5, 0.5];
      bg.r = [0, 0, 1, 1, 0, 0, 0, 0, 0.5, 0.5]; bg.itype = 1;
      this.tileNodes = [];
      tiles.forEach((t, i) => {
        if (i >= n) { t.setActive(false); return; }
        t.setActive(true);
        const cx = -gw / 2 + 25 + 81.5 + (i % cols) * 183, cy = gh / 2 - 20 - 81.5 - Math.floor(i / cols) * 178;
        t.r = [0.5, 0.5, 0.5, 0.5, cx, cy, 163, 163, 0.5, 0.5];
        const ic = t.find('UIIconMask/IconTesture');
        ic.img = o.tiles[i].img; ic.r = [0.5, 0.5, 0.5, 0.5, 0, 0, 150, 150, 0.5, 0.5];
        t.find('UINewTag').setActive(false);
        t.tileId = o.tiles[i].id;
        this.tileNodes.push(t);
      });
    } else {
      grid.setActive(false);
      this.tileNodes = [];
      if (ag) {
        ag.setActive(!!o.asmrImg);
        if (o.asmrImg) {
          ag.r = [0.5, 0.5, 0.5, 0.5, 0, -46 + 184, 634, 368, 0.5, 0.5];
          ag.layout = null;
          for (const c of ag.children) c.setActive(false);
          ag.img = o.asmrImg;
        }
      }
    }
    this.selectSel = o.sel;
    this.markTiles();
    this.selectOpts = o;
    // slide in (AnimControlManager id 3, 0.3 s)
    S.r[5] = 237 - 480;
    E.tween({ dur: 0.3, ease: E.ease.outQuad, keep: true, update: (k) => { S.r[5] = 237 - 480 * (1 - k); } });
    this.closeBtnNode = close; this.sureBtnNode = sure;
  }
  markTiles() {
    for (const t of this.tileNodes || []) {
      const on = t.tileId === this.selectSel;
      t.find('SelectedBase').setActive(on); t.find('NormalBase').setActive(true);
    }
  }
  closeSelect() {
    const S = this.select;
    if (!S.active) return;
    E.tween({ dur: 0.25, ease: E.ease.outQuad, keep: true, update: (k) => { S.r[5] = 237 - 480 * k; }, done: () => S.setActive(false) });
    this.selectOpts = null;
  }

  // ---------------- unlock popup (UIUnlockRoom) ----------------
  showUnlock(o) {
    const U = this.inst('UIUnlockRoom');
    const root = U.find('Root');
    root.find('TextTitle').txt = STR.unlockTitle; root.find('TextTitle').font = FONT(52); root.find('TextTitle').stroke = 9; root.find('TextTitle').strokeCol = '#6a3c12';
    const lg = root.find('MiddleGroup/LockGroup');
    lg.find('UIBg').itype = 1;
    const icon = lg.find('Icon'); icon.img = o.img;
    const ng = lg.find('NameGroup'); ng.find('UIBg').itype = 1; ng.find('LockGroup').setActive(false);
    const nt = ng.find('TextTitle'); nt.txt = o.name; nt.font = FONT(38); nt.txtCol = '#8a4a14';
    const btn = root.find('MiddleGroup/ButtonUnlock');
    btn.r = [0.5, 0.5, 0.5, 0.5, 0, -345, 456, 102, 0.5, 0.5];
    const ub = btn.find('UIBg'); ub.itype = 1; ub.r = [0.5, 0.5, 0.5, 0.5, 0, 0, 570, 102, 0.5, 0.5]; ub.sx = ub.sy = 0.8;
    const bt = btn.find('Text');
    bt.r = [0.5, 0.5, 0.5, 0.5, 0, 4, 360, 60, 0.5, 0.5]; bt.txt = o.button || STR.unlock; bt.font = FONT(40); bt.stroke = 7; bt.strokeCol = '#1d7a12';
    if (o.note) { const nn = new E.Node({ n: 'note', r: [0.5, 0.5, 0.5, 0.5, 0, -450, 680, 80, 0.5, 0.5] }); nn.txt = o.note; nn.font = FONT(22); nn.txtCol = '#fff'; nn.stroke = 4; nn.strokeCol = '#222'; root.add(nn); }
    U.dim = 0.75;
    this.popup = { node: U, btn, onOk: o.onOk };
    U.alpha = 0; root.sx = root.sy = 0.6;
    E.tween({ dur: 0.35, ease: E.ease.outBack, keep: true, update: (k) => { U.alpha = Math.min(1, k * 1.5); root.sx = root.sy = 0.6 + 0.4 * k; } });
  }

  // ---------------- scrub progress (ASMR bar art) + hint hand ----------------
  scrubBar(p) { this.scrubP = p; }
  drawScrubBar(ctx) {
    const v = E.view;
    ctx.setTransform(v[0], 0, 0, v[0], v[4], v[5]);
    const y = -(E.H / 2 - 118);
    const bg = E.img['UIFlushGame_BarBG1'], fg = E.img['UIFlushGame_BarBG2'];
    if (bg) ctx.drawImage(bg, -296, y - 29, 592, 58);
    const p = Math.max(0, Math.min(1, this.scrubP));
    if (fg && p > 0) ctx.drawImage(fg, 0, 0, fg.width * p, fg.height, -289, y - 19, 578 * p, 43);
    ctx.font = FONT(30); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = '#3a2a6a'; ctx.lineJoin = 'round';
    const t = Math.floor(p * 100) + '/100';
    ctx.strokeText(t, 0, y + 2); ctx.fillStyle = '#fff'; ctx.fillText(t, 0, y + 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  drawHintHand(ctx, h) {
    const v = E.view, im = E.img['Hand'];
    ctx.setTransform(v[0], 0, 0, v[0], v[4], v[5]);
    const k = (Math.sin(h.t * 3) + 1) / 2;
    const x = h.x - 110 + 220 * k, y = -h.y + 40 * Math.sin(k * Math.PI);
    if (im) ctx.drawImage(im, x - 15, y - 10, 108, 133);
    ctx.font = FONT(42); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#5a3a12'; ctx.lineJoin = 'round';
    ctx.strokeText(STR.swipe, 0, -h.y - 190); ctx.fillStyle = '#fff'; ctx.fillText(STR.swipe, 0, -h.y - 190);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------- drawing & input ----------------
  draw(ctx) {
    const nodes = [];
    if (this.app.mode === 'room' && this.hud && !this.app.scrubbing) {
      const busy = this.app.panel || (this.app.room && this.app.room.busy);
      this.hud.find('Root/BottomGroup').setActive(!busy);
      this.setBtn.setActive(!busy);
      nodes.push(this.hud);
    }
    for (const n of nodes) { n.layoutTree(); E.drawTree(ctx, n); }
    if (this.app.mode === 'room' && this.bubbleLayer && !this.app.scrubbing) { this.bubbleLayer.layoutTree(); E.drawTree(ctx, this.bubbleLayer); }
    if (this.app.mode === 'room' && this.app.scrubbing && this.scrubP >= 0) this.drawScrubBar(ctx);
    if (this.popup) this.drawDim(ctx, this.popup.node.alpha * 0.75), this.popup.node.layoutTree(), E.drawTree(ctx, this.popup.node);
    if (this.trans && this.transOn) { this.trans.layoutTree(); E.updateSpines(this.trans, E.dt); this.trans.layoutTree(); E.drawTree(ctx, this.trans); }
    if (this.loadingNode && this.loadingNode.active) { this.loadingNode.update(); this.loadingNode.layoutTree(); E.drawTree(ctx, this.loadingNode); }
    if (this.fadeA > 0) this.drawDim(ctx, this.fadeA, '#000');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  }
  drawDim(ctx, a, col) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = a; ctx.fillStyle = col || '#0d0a1c';
    ctx.fillRect(0, 0, E.canvas.width, E.canvas.height);
    ctx.globalAlpha = 1;
  }
  hitBtn(n, x, y) { return n && n.activeInHierarchy && n.activeInHierarchy() && n.hit(x, y); }
  press(n, fn) {
    E.tween({ dur: 0.08, keep: true, update: (k) => { n.sx = n.sy = 1 - 0.08 * k; }, done: () => E.tween({ dur: 0.12, keep: true, ease: E.ease.outBack, update: (k) => { n.sx = n.sy = 0.92 + 0.08 * k; } }) });
    E.audio.play('click');
    fn();
  }
  // returns true if the UI consumed the tap
  tap(x, y) {
    if (this.popup) {
      if (this.hitBtn(this.popup.btn, x, y)) { const p = this.popup; this.press(p.btn, () => { this.popup = null; p.onOk(); }); }
      return true;
    }
    if (this.app.mode !== 'room') return false;
    if (this.selectOpts) {
      const o = this.selectOpts;
      if (this.hitBtn(this.sureBtnNode, x, y)) { this.press(this.sureBtnNode, () => o.onOk()); return true; }
      if (this.hitBtn(this.closeBtnNode, x, y)) { this.press(this.closeBtnNode, () => o.onCancel()); return true; }
      for (const t of this.tileNodes || []) if (this.hitBtn(t, x, y)) { this.selectSel = t.tileId; this.markTiles(); E.audio.play('click'); o.onTile(t.tileId); return true; }
      if (this.select.hit(x, y)) return true;
      o.onCancel(); // FullScreenClose
      return true;
    }
    if (this.app.scrubbing) return false;
    if (this.hitBtn(this.mapBtn, x, y)) { this.press(this.mapBtn, () => this.app.openMapFromRoom()); return true; }
    if (this.hitBtn(this.playBtn, x, y)) { this.press(this.playBtn, () => this.app.room && this.app.room.playNext()); return true; }
    if (this.hitBtn(this.setBtn, x, y)) { this.press(this.setBtn, () => window.UI.openSettings()); return true; }
    return false;
  }
}
function findDef(d, name) {
  if (d.n === name) return d;
  for (const c of d.c || []) { const r = findDef(c, name); if (r) return r; }
  return null;
}
window.HomeUI = HomeUI;
window.findDef = findDef;
