// Port of Home.Games.FlushGame.InputCreateTexture (brush / erase step) + FlushMaskBrush kernels.
'use strict';

const OFFECT_CENTER = 0.74;
const OFFECT_EDGE = 0.016;
const HAND_SHOW_MAX = 5.0;
const FRAME_INTERVAL = 2;

function safeByteAdd(a, b) { return 225 - a < b ? 255 : a + b; }

class Wash {
  constructor(game, wm) {
    this.g = game;
    this.wm = wm; // UIWashMain node
    this.rawBg = wm.find('RawImage_Bg');
    this.rawMask = wm.find('RawImage_Mask');
    this.rawTop = wm.find('RawImage_Top');
    this.rootMask = wm.find('RootMask');
    this.toolRoot = wm.find('ToolRoot');
    this.guide = wm.find('Guide');
    this.guideHand = this.guide && this.guide.find('Hand');
    this.guideText = this.guide && this.guide.find('Content_Text');
    if (this.guide) this.guide.setActive(false);
    this.isWork = false;
    this.WaitPickUp = false;
    this.ToolReturnWorldPos = null;
    this.tool = null;
    this.lastFinishPercent = 0;
    this.isReturnTool = false;
    this.workSoundPlaying = false;
    this.idleSoundPlaying = true;
    this._toolsSoundID = -1;
    this.currentFrame = 0;
    this.lastMouse = null;
    this.handShowTime = 0;
    this.isCheckHandShow = false;
    this.changedWaterState = null;
    this.finished = false;
  }

  res(id) { return this.g.res(id); }

  // ---------- InitRawImage ----------
  initRawImage(step) {
    this.gameType = step.gametype;
    const bgName = this.res(step.resBgId), mkName = this.res(step.resMaskId);
    this._new = bgName; this._old = mkName;
    const bi = E.img[bgName], mi = E.img[mkName];
    const sc = (step.uiBgScale || 100) * 0.01;
    this.rawBg.raw = bgName; this.rawBg.rawCanvas = null; this.rawBg.setActive(true);
    this.rawBg.r[6] = bi.width; this.rawBg.r[7] = bi.height;
    this.rawBg.r[4] = (step.uiBgPos ? step.uiBgPos[0] : 0) * 0.01; this.rawBg.r[5] = (step.uiBgPos ? step.uiBgPos[1] : 0) * 0.01;
    this.rawBg.sx = this.rawBg.sy = sc;
    this.rawMask.raw = mkName;
    this.rawMask.r[6] = mi.width; this.rawMask.r[7] = mi.height;
    this.rawMask.r[4] = (step.maskPos ? step.maskPos[0] : 0) * 0.01; this.rawMask.r[5] = (step.maskPos ? step.maskPos[1] : 0) * 0.01;
    this.rawMask.sx = this.rawMask.sy = sc;
    this.rawMask.setActive(true);
    if (this.rawTop) this.rawTop.setActive(false);
    this.createMaskTex(mi);
  }

  createMaskTex(img) {
    const W = img.width, H = img.height;
    this.W = W; this.H = H;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const id = g.getImageData(0, 0, W, H);
    const d = id.data;
    const m = new Uint8Array(W * H);
    let all = 0;
    for (let i = 0, p = 3; i < W * H; i++, p += 4) {
      if (d[p] > 128) { all++; m[i] = 0; } else { m[i] = 255; d[p] = 0; }
    }
    this.allPx = Math.max(1, all);
    this.count180 = W * H - all;
    this.m = m;
    this.dirtySrc = img;
    g.putImageData(id, 0, 0);
    this.dirtyCanvas = c; // dirt with already-"clean" pixels removed
    this.dirtyCtx = g;
    // mask canvas used with destination-out
    const mc = document.createElement('canvas');
    mc.width = W; mc.height = H;
    this.maskCtx = mc.getContext('2d', { willReadFrequently: true });
    this.maskCanvas = mc;
    this.maskData = this.maskCtx.createImageData(W, H);
    const md = this.maskData.data;
    for (let i = 0; i < W * H; i++) md[i * 4 + 3] = m[i];
    this.rawMask.rawCanvas = c;
    this.rawMask.raw = this._old;
  }

  flushRegion(x0, y0, x1, y1) {
    // x/y are top-down texture pixels (inclusive-exclusive)
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(this.W, Math.ceil(x1)); y1 = Math.min(this.H, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return;
    const W = this.W, m = this.m, md = this.maskData.data;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) md[(y * W + x) * 4 + 3] = m[y * W + x];
    this.maskCtx.putImageData(this.maskData, 0, 0, x0, y0, x1 - x0, y1 - y0);
    const g = this.dirtyCtx;
    g.save();
    g.clearRect(x0, y0, x1 - x0, y1 - y0);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.dirtySrc, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(this.maskCanvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    g.restore();
  }

  // ---------- InitGame ----------
  async initGame(step, initFinishCb, progressCb) {
    this.step = step;
    this.finished = false;
    this.initRawImage(step);
    this.FinishPersent = (step.finishPercent || 85) / 100;
    this.brushW = step.brushSize ? step.brushSize[0] : 48;
    this.brushH = step.brushSize ? step.brushSize[1] : 48;
    this.brushFeather = step.brushFeather > 0 ? step.brushFeather * 0.01 : 1.0;
    this.autoFinishPercent = step.autoFinishPercent || 0;
    this.initFinishCb = initFinishCb;
    this.callBack = progressCb;
    this.lastFinishPercent = 0;
    this.currentFrame = 0;
    this.lastMouse = null;
    this.isReturnTool = false;
    await this.initTools(step);
  }

  async initTools(step) {
    this.destroyTool();
    const tname = this.res(step.resToolId);
    const def = this.g.scenes[tname];
    const tool = E.instantiate(def);
    this.toolRoot.add(tool);
    this.tool = tool;
    await E.initSpines(tool);
    const t = this.gameType;
    this.sg = null; this.paintNode = null; this.effects = [];
    if (t === 1) {
      this.sg = tool.find('Water_Gun');
      this.paintNode = tool.find('Water_Gun/touch_points');
      const sg = this.sg, tp = this.paintNode;
      sg.boneDrive = () => {
        const bone = sg.sk.findBone('touch_points');
        if (!bone) return;
        const lx = tp.lx, ly = tp.ly;
        const v = new spine.Vector2(lx, ly);
        if (bone.parent) bone.parent.worldToLocal(v);
        bone.x = v.x; bone.y = v.y;
        sg.sk.updateWorldTransform();
      };
      this.origin = null;
    } else if (t === 2) {
      this.sg = tool.find('Shovel_Tool'); this.paintNode = tool;
    } else if (t === 3) {
      this.sg = tool.find('Aspirator_Tool'); this.paintNode = tool;
    } else {
      this.sg = tool.findDeep((n) => !!n.sk) || null;
      this.paintNode = tool.find('touch_point') || tool;
    }
    if (t >= 2 && t <= 6 && step.toolPos) tool.r[4] = step.toolPos[0], tool.r[5] = step.toolPos[1];
    this.g.layout();
    this.toolReturnPos = { x: this.paintNode.lx, y: this.paintNode.ly };
    this.toolHome = { x: tool.r[4], y: tool.r[5] };
    this.g.layout();
    this.originWorld = tool.worldPos();
    // appear -> idle -> (uiShowWait) -> initFinish
    const onAppear = () => {
      if (this.sg) E.setAnim(this.sg, 'idle', true);
      this.changedWaterState = false;
      const go = () => { if (this.initFinishCb) this.initFinishCb(); };
      if (step.uiShowWait > 0) E.after(step.uiShowWait * 0.001, go, this); else go();
    };
    if (this.sg && E.hasAnim(this.sg, 'appear')) E.setAnim(this.sg, 'appear', false, onAppear);
    else onAppear();
    this.onReturnTool(false, true);
    tool.setActive(!this.WaitPickUp);
  }

  destroyTool() {
    E.killOwner(this);
    if (this.tool) { this.tool.remove(); this.tool = null; }
    this.g.fx.stopEmitters();
  }

  startGame() {
    if (this.retTween) { E.kill(this.retTween); this.retTween = null; }
    this.isReturnTool = false;
    if (this.WaitPickUp && this.tool) this.tool.setActive(true);
    this.isWork = true;
    this.isCheckHandShow = true;
    this.handShowTime = this.step && this.step.hasInitGuide > 0 ? HAND_SHOW_MAX : 0;
  }

  showToolOnly(x, y) {
    if (this.retTween) { E.kill(this.retTween); this.retTween = null; }
    this.isReturnTool = false;
    if (this.tool) { this.tool.setActive(true); this.tool.alpha = 1; }
    this.refreshToolPos(x, y);
  }

  // ---------- per frame ----------
  update(dt) {
    if (!this.isWork || this.finished) return;
    const P = E.ptr;
    if (this.g.overSkip(P.x, P.y)) return;
    if (P.down) {
      this.onWorkingSound();
      this.playSpines(true);
      this.draw(P.x, P.y);
      if (this.currentFrame % FRAME_INTERVAL === 0) this.checkFinish();
      this.currentFrame++;
      if (this.guide && this.guide.active) { this.hideGuide(); this.isCheckHandShow = false; this.handShowTime = 0; return; }
    } else {
      if (!this.isCheckHandShow) { this.isCheckHandShow = true; this.handShowTime = 0; }
      this.onIdleSound();
      this.playSpines(false);
      if (this.autoFinishPercent > 0 && this.lastFinishPercent > 0 && this.lastFinishPercent >= (this.FinishPersent * this.autoFinishPercent) / 100) {
        this.setFlushGameFinished();
        return;
      }
      this.onReturnTool(false);
      this.checkShowHand(dt);
    }
  }

  paintWorld() { return this.paintNode ? this.paintNode.worldPos() : [E.ptr.x, E.ptr.y]; }

  draw(mx, my) {
    if (this.gameType >= 7) return;
    if (!this.lastMouse) {
      this.lastMouse = [mx, my];
      this.refreshToolPos(mx, my);
      return;
    }
    this.lastMouse = [mx, my];
    this.g.layout();
    const before = this.paintWorld();
    if (this.gameType === 1) this.lowerGun(my);
    this.refreshToolPos(mx, my);
    this.g.layout();
    const after = this.paintWorld();
    const a = this.toTex(before[0], before[1]);
    const b = this.toTex(after[0], after[1]);
    if (this.step.brushShape === 1) this.drawRect(a[0], a[1], b[0], b[1], this.brushW, this.brushH);
    else this.drawEllipse(a[0], a[1], b[0], b[1], this.brushW, this.brushH);
  }

  toTex(x, y) {
    const p = this.rawMask.toLocal(x, y);
    // rect is native texture size, pivot centre; y up -> top-down row
    const tx = Math.trunc(p[0] + this.rawMask.w * this.rawMask.pvx);
    const tyUp = Math.trunc(p[1] + this.rawMask.h * this.rawMask.pvy);
    return [tx, this.H - 1 - tyUp];
  }

  stampPixel(i, v) {
    const m = this.m;
    const o = m[i];
    if (o === 255) return;
    const n = safeByteAdd(o, v);
    if (o < 180 && n >= 180) this.count180++;
    m[i] = n > 255 ? 255 : n;
  }

  drawEllipse(x0, y0, x1, y1, rx, ry) {
    const W = this.W, H = this.H;
    const k = rx / ry;
    const c = 0.5 * Math.sqrt((x0 - x1) * (x0 - x1) + k * (y0 - y1) * (k * (y0 - y1)));
    const a = Math.sqrt(rx * rx + c * c);
    const feather = this.brushFeather;
    const bx0 = Math.max(0, Math.min(x0, x1) - rx), bx1 = Math.min(W, Math.max(x0, x1) + rx);
    const by0 = Math.max(0, Math.min(y0, y1) - ry), by1 = Math.min(H, Math.max(y0, y1) + ry);
    const den = a - c || 1e-6;
    for (let y = by0; y < by1; y++) {
      const dy0 = k * (y0 - y), dy1 = k * (y - y1);
      for (let x = bx0; x < bx1; x++) {
        const s = Math.sqrt((x0 - x) * (x0 - x) + dy0 * dy0) + Math.sqrt((x - x1) * (x - x1) + dy1 * dy1);
        if (s >= 2 * a) continue;
        const depth = (a - s / 2) / den;
        const t = 1 - depth;
        let w;
        if (feather < 1) w = t > 1 - feather ? (t - (1 - feather)) / feather : 0;
        else w = t;
        const value = OFFECT_CENTER - (OFFECT_CENTER - OFFECT_EDGE) * w;
        this.stampPixel(y * W + x, (value * 255) | 0);
      }
    }
    this.flushRegion(bx0, by0, bx1, by1);
  }

  drawRect(x0, y0, x1, y1, rx, ry) {
    const W = this.W, H = this.H;
    const xs = Math.min(x0, x1) - rx, xe = Math.max(x0, x1) + rx;
    const ys = Math.min(y0, y1) - ry, ye = Math.max(y0, y1) + ry;
    const fdx = Math.max(1, rx * this.brushFeather), fdy = Math.max(1, ry * this.brushFeather);
    const bx0 = Math.max(0, xs), bx1 = Math.min(W, xe), by0 = Math.max(0, ys), by1 = Math.min(H, ye);
    for (let y = by0; y < by1; y++) {
      let fy = Math.min(y - ys, ye - y) / fdy; fy = fy < 0 ? 0 : fy > 1 ? 1 : fy;
      for (let x = bx0; x < bx1; x++) {
        let fx = Math.min(x - xs, xe - x) / fdx; fx = fx < 0 ? 0 : fx > 1 ? 1 : fx;
        const w = Math.min(fx, fy);
        const value = OFFECT_EDGE + (OFFECT_CENTER - OFFECT_EDGE) * w;
        this.stampPixel(y * W + x, (value * 255) | 0);
      }
    }
    this.flushRegion(bx0, by0, bx1, by1);
  }

  checkFinish() {
    const p = (this.count180 + this.allPx - this.W * this.H) / this.allPx;
    this.lastFinishPercent = p;
    if (this.callBack) this.callBack(p / this.FinishPersent);
    if (p >= this.FinishPersent) this.setFlushGameFinished();
  }

  // ---------- tool movement ----------
  lowerGun(my) {
    const p1 = this.step.param1;
    if (!p1 || !this.tool) return;
    const thrY = (p1[0] * 0.01) * E.H - E.H / 2; // screen fraction from the bottom -> root y
    if (my >= thrY) this.tool.setWorldPos(this.originWorld[0], this.originWorld[1]);
    else this.tool.setWorldPos(this.originWorld[0], this.originWorld[1] - (thrY - my) * p1[1] * 0.01);
  }

  refreshToolPos(mx, my) {
    if (!this.tool) return;
    if (this.retTween) { E.kill(this.retTween); this.retTween = null; }
    if (this.WaitPickUp && !this.tool.active) this.tool.setActive(true);
    this.tool.alpha = 1;
    if (this.gameType === 1) {
      this.g.layout();
      const p = this.paintNode.parentLocal(mx, my);
      this.paintNode.posOverride = { x: p[0], y: p[1] };
      this.g.fx.emit('water', this.paintNode);
    } else {
      this.tool.setWorldPos(mx, my);
      if (this.gameType === 2 || this.gameType === 3 || this.gameType === 5) this.g.fx.emit(this.gameType === 5 ? 'dust' : 'grass', this.paintNode);
      else if (this.gameType === 4) this.g.fx.emit('spray', this.paintNode);
    }
    this.isReturnTool = false;
  }

  onReturnTool(isFade, force) {
    if (this.isReturnTool && !force) return;
    if (!this.tool) return;
    this.g.fx.stopEmitters();
    const hasRet = !!this.ToolReturnWorldPos;
    const from = this.tool.worldPos();
    if (this._toolsSoundID !== -1) { E.audio.stopById(this._toolsSoundID); }
    // snap back to rest
    if (this.gameType === 1) {
      this.paintNode.posOverride = { x: this.toolReturnPos.x, y: this.toolReturnPos.y };
      this.tool.posOverride = null;
    } else {
      this.tool.posOverride = null;
    }
    this.lastMouse = null;
    if (this.retTween) { E.kill(this.retTween); this.retTween = null; }
    if (isFade && hasRet) {
      const tool = this.tool;
      this.retTween = E.tween({ dur: 0.2, owner: this, update: (k) => { tool.alpha = 1 - k; }, done: () => { tool.setActive(false); tool.alpha = 1; } });
    } else if (hasRet && !force) {
      // fly back into the step button (OutQuad 0.2 s) then hide
      const tool = this.tool, to = this.ToolReturnWorldPos;
      if (this.gameType !== 1) tool.setWorldPos(from[0], from[1]);
      const p0 = this.gameType === 1 ? this.paintNode.worldPos() : from;
      this.retTween = E.tween({
        dur: 0.2, ease: E.ease.outQuad, owner: this,
        update: (k) => {
          const x = p0[0] + (to[0] - p0[0]) * k, y = p0[1] + (to[1] - p0[1]) * k;
          if (this.gameType === 1) { this.g.layout(); const q = this.paintNode.parentLocal(x, y); this.paintNode.posOverride = { x: q[0], y: q[1] }; }
          else tool.setWorldPos(x, y);
          tool.alpha = 1 - k * 0.3;
        },
        done: () => { tool.setActive(false); tool.alpha = 1; tool.posOverride = null; if (this.gameType === 1) this.paintNode.posOverride = { x: this.toolReturnPos.x, y: this.toolReturnPos.y }; },
      });
    } else if (hasRet && force) {
      // initial placement in new-play: stays hidden until picked up
    }
    this.isReturnTool = true;
  }

  requirePickUpAgain() {
    if (this.finished) return;
    if (this.autoFinishPercent > 0 && this.lastFinishPercent > 0 && this.lastFinishPercent >= (this.FinishPersent * this.autoFinishPercent) / 100) {
      this.setFlushGameFinished();
      return;
    }
    this.isWork = false;
    this.onIdleSound();
    this.playSpines(false);
    this.onReturnTool(false);
  }

  playSpines(working) {
    if (this.changedWaterState === working || !this.sg) return;
    this.changedWaterState = working;
    if (working) E.setAnim(this.sg, this.gameType === 4 ? 'work2' : 'work', true);
    else E.setAnim(this.sg, 'idle', true);
  }

  onWorkingSound() {
    if (this.workSoundPlaying) return;
    this.workSoundPlaying = true; this.idleSoundPlaying = false;
    if (this.step.soundID) { this._toolsSoundID = this.step.soundID; E.audio.stopAll(); E.audio.play(this.step.soundID, true); }
  }
  onIdleSound() {
    if (this.idleSoundPlaying) return;
    this.idleSoundPlaying = true; this.workSoundPlaying = false;
    E.audio.stopAll();
    if (this._toolsSoundID !== -1) E.audio.stopById(this._toolsSoundID);
    this._toolsSoundID = -1;
  }

  // ---------- guide (classic levels) ----------
  checkShowHand(dt) {
    if (!this.isCheckHandShow) return;
    this.handShowTime += dt;
    if (this.handShowTime >= HAND_SHOW_MAX) {
      if (!this.g.isNewPlay) this.showGuide();
      this.handShowTime = 0;
      this.isCheckHandShow = false;
    }
  }
  showGuide() {
    if (!this.guide || this.guide.active) return;
    this.guide.setActive(true);
    this.guideText.txt = this.g.text('Guide_ASMR_slide');
    this.guideText.stroke = 8;
    this.guideText.font = 'bold 44px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
    const hand = this.guideHand;
    const bx = hand.r[4], by = hand.r[5];
    this.guideTween = E.tween({ dur: 1.1, ease: E.ease.inOutSine, loop: true, yoyo: true, owner: this.guide,
      update: (k) => { hand.r[4] = bx - 170 + 340 * k; hand.r[5] = by + 40 * Math.sin(k * Math.PI); } });
    hand.r[4] = bx; hand.r[5] = by;
    this.guideBase = [bx, by];
  }
  hideGuide() {
    if (!this.guide || !this.guide.active) return;
    E.killOwner(this.guide);
    if (this.guideBase) { this.guideHand.r[4] = this.guideBase[0]; this.guideHand.r[5] = this.guideBase[1]; }
    this.guide.setActive(false);
  }

  // events from the controller (confirm popup)
  setWorkStopState() {
    this.isWork = false;
    E.audio.stopAll();
    this.onReturnTool(false);
    this.playSpines(false);
    this.hideGuide();
  }
  setWorkState() { this.isWork = true; }

  // ---------- finish ----------
  setFlushGameFinished() {
    if (this.finished) return;
    this.finished = true;
    this.isWork = false;
    this.lastFinishPercent = 0;
    if (this.callBack) this.callBack(1.0);
    this.rawMask.setActive(false);
    this.hideGuide();
    this.onReturnTool(true);
    this.onIdleSound();
    this.playSpines(false);
    if (this.tool) this.tool.setActive(false);
    this.g.fx.stopEmitters();
    this.showFinishEffect();
  }

  showFinishEffect() {
    this.g.onHideReturn();
    E.audio.stopAll();
    E.audio.play(1902);
    const c = this.rawBg.rectWorldCenter();
    this.g.fx.starBurst(0, 0);
    const stepId = this.step.id;
    E.after(3.0, () => {
      if (this.g.isNewPlay) {
        E.audio.play(1901);
        this.g.startNextStepEvent();
      } else {
        this.playDisappear(() => this.g.startNextStepEvent());
      }
    }, this);
  }

  // RootMask "Disappear": review wipe from the dirty picture (Old) to the clean one (New)
  playDisappear(done) {
    const rm = this.rootMask;
    if (!rm) { done(); return; }
    E.audio.play(1901);
    const nw = rm.find('New'), od = rm.find('Old');
    nw.img = this._new; od.img = this._old;
    for (const n of [nw, od]) { const im = E.img[n.img]; n.r[6] = im.width; n.r[7] = im.height; n.sx = this.rawMask.sx; n.sy = this.rawMask.sy; n.r[4] = this.rawMask.r[4]; n.r[5] = this.rawMask.r[5]; }
    rm.setActive(true);
    const hh = E.img[this._old].height * this.rawMask.sy;
    let k = 0;
    // Old is clipped to the part above the sweeping line; a glowing trail rides the line
    od.customDraw = (ctx, alpha) => {
      const im = E.img[od.img];
      const x0 = -od.pvx * od.w, y0 = -od.pvy * od.h;
      const cutY = y0 + od.h * (1 - k); // everything below cutY (in y-up local) is revealed
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, cutY, od.w, od.h); ctx.clip();
      ctx.translate(x0, y0 + od.h); ctx.scale(1, -1);
      ctx.globalAlpha = alpha;
      ctx.drawImage(im, 0, 0, od.w, od.h);
      ctx.restore();
      const tr = E.img['25_Trail_04'];
      if (tr && k > 0 && k < 1) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(x0, cutY + 60); ctx.scale(1, -1);
        ctx.drawImage(tr, 0, 0, od.w, 120);
        ctx.restore();
      }
    };
    // the old dirt shows first, then wipes from top to bottom
    E.tween({ dur: 1.6, delay: 0.25, ease: E.ease.inOutSine, owner: this, update: (v) => { k = v; if (Math.random() < 0.5) { const p = od.rectWorldCenter(); this.g.fx.sparkleAt(p[0] + (Math.random() - 0.5) * 700, p[1] + hh / 2 - hh * v * 0.5); } },
      done: () => { E.after(0.3, () => { rm.setActive(false); od.customDraw = null; done(); }, this); } });
  }
}

window.Wash = Wash;
