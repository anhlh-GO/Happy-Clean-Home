// Port of UIFlushGameController + MakeOverController + AsmrDragStepController + ToolHandComponent + FlushGameManager.
'use strict';

const TEXT = {
  Guide_ASMR_slide: 'Swipe to clean',
  Guide_ASMR_drag: 'Hold and drag here, then try sliding',
  flush_tips_skip: "Are you sure you want to exit? You'll have to start over!",
};
const SAVE_KEY = 'happyclean.progress.v1';
const SOUND_FILES = {
  1887: 'sfx_asmr_1_1_vine', 1888: 'sfx_asmr_1_2_rubbish', 1889: 'sfx_asmr_1_3_rinse', 1890: 'sfx_asmr_2_1_spraying',
  1891: 'sfx_asmr_2_2_polishing', 1892: 'sfx_asmr_3_1_box', 1893: 'sfx_asmr_3_2_shovel', 1894: 'sfx_asmr_4_1_rubbish',
  1895: 'sfx_asmr_4_2_cleaner', 1896: 'sfx_asmr_5_1_insecticides', 1897: 'sfx_asmr_5_2_vine', 1898: 'sfx_asmr_5_3_fence',
  1899: 'sfx_asmr_6_1_saw', 1900: 'sfx_asmr_6_2_rinse', 1901: 'sfx_asmr_review', 1902: 'sfx_asmr_complete',
};
const UI_IMAGES = ['UIFlushGame_BarBG1', 'UIFlushGame_BarBG2', 'UIFlushGame_BarBG3', 'ui_skip', 'UIFlushGame_ReturnBtn', 'UIFlushGame_FinishBtn',
  'contact1', 'ui_step_di2', 'ui_step_di4', 'ui_step_duihao', 'ui_step_1', 'ui_step_2', 'Hand', 'UI_Icon_Clean', 'UI_Icon_Hand', 'UI_Icon_PestControl',
  'UI_Icon_Polish', 'UI_Icon_Repair', 'UI_Icon_Rinse', 'UI_Icon_Wiper', 'T_Star_019', '25_spark_01', 'T_Glow_021', 'Flare_005', 'Eff_UI_water_010',
  'Eff_UI_water_033', 'Eff_UI_smoke_001', 'Eff_UI_Object_003', 'Eff_UI_Object_004', '25_Trail_04', 'ui_flushgame_title'];

// ---------------- ToolHandComponent ----------------
class ToolHand {
  constructor(game) { this.g = game; this.ReturnWorldPos = null; this._isReturned = true; this._isWorking = null; }
  async load(path, parent) {
    const tool = E.instantiate(this.g.scenes[path]);
    parent.add(tool);
    this.tool = tool;
    await E.initSpines(tool);
    this.graphic = tool.findDeep((n) => !!n.sk);
    const tp = this.graphic && this.graphic.find('touch_points');
    this.hitPoint = tp || tool;
    this.g.layout();
    this._returnPos = { x: this.hitPoint.lx, y: this.hitPoint.ly };
    this._workAnim = this.graphic && E.hasAnim(this.graphic, 'work2') ? 'work2' : 'work';
    tool.setActive(false);
  }
  show() {
    E.killOwner(this);
    this._isReturned = false;
    if (!this.tool.active) {
      this.tool.setActive(true); this.tool.alpha = 1;
      if (this.graphic) {
        if (E.hasAnim(this.graphic, 'appear')) E.setAnim(this.graphic, 'appear', false, () => { E.setAnim(this.graphic, 'idle', true); this._isWorking = false; });
        else { E.setAnim(this.graphic, 'idle', true); this._isWorking = false; }
      }
    }
  }
  moveTo(x, y) { this.g.layout(); this.hitPoint.setWorldPos(x, y); }
  follow(x, y) { E.killOwner(this); this.show(); this.moveTo(x, y); this._isReturned = false; }
  playWork(v) {
    if (this._isWorking === v || !this.graphic) return;
    this._isWorking = v;
    E.setAnim(this.graphic, v ? this._workAnim : 'idle', true);
  }
  playHit(a) {
    if (!this.graphic || !E.hasAnim(this.graphic, a)) return;
    E.setAnim(this.graphic, a, false);
    E.addAnim(this.graphic, 'idle', true, 0);
    this._isWorking = false;
  }
  return() {
    if (this._isReturned) return;
    E.killOwner(this);
    if (this.ReturnWorldPos) {
      const p0 = this.hitPoint.worldPos(), to = this.ReturnWorldPos;
      E.tween({ dur: 0.2, ease: E.ease.outQuad, owner: this,
        update: (k) => this.hitPoint.setWorldPos(p0[0] + (to[0] - p0[0]) * k, p0[1] + (to[1] - p0[1]) * k),
        done: () => { this.tool.setActive(false); } });
    } else this.hitPoint.posOverride = { x: this._returnPos.x, y: this._returnPos.y };
    this._isReturned = true;
  }
  fadeOut() {
    E.killOwner(this);
    E.tween({ dur: 0.2, owner: this, update: (k) => { this.tool.alpha = 1 - k; }, done: () => { this.tool.setActive(false); this.tool.alpha = 1; } });
    this._isReturned = true;
  }
  hide() { E.killOwner(this); this.tool.setActive(false); this._isReturned = true; }
  destroy() { E.killOwner(this); if (this.tool) this.tool.remove(); }
}

// ---------------- AsmrDragStepController ----------------
class DragCtrl {
  constructor(game) { this.g = game; this._finished = false; this._isWork = false; this.AutoFinishStagger = 0.08; }
  get IsFinished() { return this._finished; }
  async init(root, steps, toolPath, toolParent) {
    this._steps = steps;
    this._hitAreas = steps.map((s) => root.find(s.hitAreaName));
    this._targets = steps.map((s) => root.find(s.spinePath) || (root.parent && root.parent.find(s.spinePath)));
    this._cleared = steps.map(() => false);
    this._clearedCount = 0;
    this._isPull = steps[0].stepType === 2;
    this._useHitAnim = !!steps[0].toolHitAnim;
    this._hasTool = !!toolPath;
    this._autoFinishPercent = steps[0].autoFinishPercent || 0;
    this._lastClearIndex = -1; this._lastClearDelay = 0;
    if (this._hasTool) { this._hand = new ToolHand(this.g); await this._hand.load(toolPath, toolParent); }
  }
  setCallBack(progressCb, finishCb) { this._progressCb = progressCb; this._finishCb = finishCb; }
  setToolReturnPos(p) { if (this._hand) this._hand.ReturnWorldPos = p; }
  startGame() { this._isWork = true; if (this._hand) this._hand.show(); }
  showToolOnly(x, y) { if (this._hand) { this._hand.moveTo(x, y); this._hand.show(); } }
  shouldAutoFinish() { return !this._isPull && this._autoFinishPercent > 0 && this._clearedCount > 0 && this._clearedCount * 100 >= this._autoFinishPercent * this._steps.length; }
  requirePickUpAgain() {
    if (this._finished) return;
    if (this.shouldAutoFinish()) { this.autoFinishRest(); return; }
    this._isWork = false;
    if (this._hand) { this._hand.playWork(false); this._hand.return(); }
  }
  update() {
    // idle hint sparkles on areas still to clear
    if (!this._finished) for (let i = 0; i < this._hitAreas.length; i++) if (!this._cleared[i] && this._hitAreas[i] && this._hitAreas[i].active && !this._isPull) this.g.fx.hint(this._hitAreas[i]);
    if (!this._isWork) return;
    const P = E.ptr;
    if (this.g.overSkip(P.x, P.y)) return;
    if (!P.down) {
      if (this.shouldAutoFinish()) { this.autoFinishRest(); return; }
      if (this._hand) { this._hand.playWork(false); this._hand.return(); }
      return;
    }
    if (this._hand) { this._hand.playWork(!this._useHitAnim); this._hand.follow(P.x, P.y); }
    if (this._isPull) this.updatePull(P.x, P.y); else this.updateDragOver(P.x, P.y);
  }
  updateDragOver(x, y) {
    for (let i = 0; i < this._hitAreas.length; i++) {
      if (this._cleared[i]) continue;
      const a = this._hitAreas[i];
      if (a && a.hit(x, y)) {
        this.clearAt(i, 0);
        if (this._progressCb) this._progressCb(this._clearedCount / this._steps.length);
        if (this._clearedCount >= this._steps.length) { this.finish(); return; }
      }
    }
  }
  updatePull(x, y) { const a = this._hitAreas[0]; if (a && a.hit(x, y)) this.finishPull(); }
  finishPull() {
    if (this._finished) return;
    this._finished = true; this._isWork = false;
    if (this._hand) this._hand.hide();
    if (this._hitAreas[0]) this._hitAreas[0].setActive(false);
    if (this._progressCb) this._progressCb(1);
    const s = this._steps[0], t = this._targets[0];
    if (t) {
      E.setAnim(t, s.aniName || 'work', false, () => { if (this._finishCb) this._finishCb(); });
      if (s.finishAniName) E.addAnim(t, s.finishAniName, true, 0);
    } else if (this._finishCb) this._finishCb();
  }
  clearAt(i, delay) {
    if (this._cleared[i]) return;
    this._cleared[i] = true;
    this._clearedCount++;
    this._lastClearIndex = i; this._lastClearDelay = delay;
    if (this._hitAreas[i]) this._hitAreas[i].setActive(false);
    if (this._useHitAnim && this._hand) this._hand.playHit(this._steps[i].toolHitAnim);
    const play = () => {
      const s = this._steps[i], t = this._targets[i];
      if (s.soundID) E.audio.play(s.soundID);
      if (t) { E.setAnim(t, s.aniName, false); if (s.finishAniName) E.addAnim(t, s.finishAniName, true, 0); }
    };
    if (delay > 0) E.after(delay, play, this); else play();
  }
  autoFinishRest() {
    let k = 0;
    for (let i = 0; i < this._steps.length; i++) if (!this._cleared[i]) this.clearAt(i, k++ * this.AutoFinishStagger);
    if (this._progressCb) this._progressCb(1);
    this.finish();
  }
  finish() {
    if (this._finished) return;
    this._finished = true; this._isWork = false;
    if (this._hand) { this._hand.playWork(false); this._hand.fadeOut(); }
    const li = this._lastClearIndex;
    const t = this._targets[li];
    const dur = t ? E.animDur(t, this._steps[li].aniName) : 0;
    E.after(this._lastClearDelay + dur, () => { if (this._finishCb) this._finishCb(); }, this);
  }
  skipToFinish() { if (this._isPull) this.finishPull(); else this.autoFinishRest(); }
  destroy() { E.killOwner(this); if (this._hand) this._hand.destroy(); }
}

// ---------------- MakeOverController (click steps) ----------------
class MakeOver {
  constructor(game, inst) {
    this.g = game; this.inst = inst;
    this.spineNode = inst.find('SpineGroup/CleanSpine');
    this.idx = 0; this.busy = false;
  }
  init(onAll) {
    this.onAll = onAll;
    this.buttons = this.inst.children.filter((c) => c.btn && c.active);
    this.steps = this.g.clickSteps;
    this.hideAll();
    this.startNextStep();
  }
  hideAll() { for (const b of this.buttons) b.setActive(false); }
  startNextStep() {
    const step = this.steps[this.idx];
    this.hideAll();
    const key = step.buttonName.trim();
    this.cur = this.buttons.find((b) => b.name.includes(key)) || null;
    if (this.cur) { this.cur.setActive(true); this.cur.sx = this.cur.sy = 0.2; E.tween({ dur: 0.3, ease: E.ease.outBack, owner: this, update: (k) => { this.cur.sx = this.cur.sy = 0.2 + 0.8 * k; } }); }
  }
  tap(x, y) {
    if (this.busy || this.idx >= this.steps.length || !this.cur || !this.cur.active) return false;
    if (!this.cur.hit(x, y)) return false;
    const step = this.steps[this.idx];
    this.cur.setActive(false);
    E.audio.play(step.soundID);
    this.g.onClickStepStarted(step);
    this.busy = true;
    E.setAnim(this.spineNode, step.AniName, false, () => this.playFinish(step));
    return true;
  }
  playFinish(step) {
    const next = () => {
      this.g.updateProgressBar();
      this.idx++; this.busy = false;
      if (this.idx >= this.steps.length) this.onAll(); else this.startNextStep();
    };
    if (!step.finishAniName) { next(); return; }
    E.setAnim(this.spineNode, step.finishAniName, false, next);
  }
  update() {
    if (this.cur && this.cur.active) {
      const k = 1 + 0.06 * Math.sin(E.time * 5);
      const root = this.cur.find('Root');
      if (root) root.sx = root.sy = k;
      this.g.fx.hint(this.cur);
    }
  }
}

// ---------------- the game ----------------
class Game {
  constructor() {
    this.fx = null;
    this.save = this.loadSave();
  }
  text(k) { return TEXT[k] || k; }
  layout() { if (E.root) E.root.layoutTree(); }
  res(id) { const p = this.resMap[id]; return p ? p.split('/').pop() : null; }
  loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { done: [] }; } catch (e) { return { done: [] }; } }
  writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) {} }
  nextLevelId() { for (const l of this.cfg.flushgamelevel) if (!this.save.done.includes(l.id)) return l.id; return null; }

  async boot() {
    const [cfg, scenes] = await Promise.all([fetch('assets/flushgame.json').then((r) => r.json()), fetch('assets/scenes.json').then((r) => r.json())]);
    this.cfg = cfg; this.scenes = scenes;
    this.resMap = {}; for (const r of cfg.flushgameresouse) this.resMap[r.id] = r.path;
    this.byId = (tab, id) => cfg[tab].find((r) => r.id === id);
    await Promise.all(UI_IMAGES.map((n) => E.ensureImg(n)));
    await Promise.all(Object.entries(SOUND_FILES).map(([id, f]) => E.audio.load(id, 'assets/snd/' + f + '.wav')));
    E.update = (dt) => this.update(dt);
    E.onPointerDown = (x, y) => this.pointerDown(x, y);
  }

  // ---------- FlushGameManager.InitAsmrGame ----------
  async startLevel(id) {
    E.audio.init();
    await E.audio.decodeAll();
    E.killAll();
    E.audio.stopAll();
    const lv = this.byId('flushgamelevel', id);
    this.level = lv;
    this.curLevelId = id;
    this.clickSteps = (lv.clickStep || []).map((x) => this.byId('flushgameclickstep', x)).filter(Boolean);
    this.dragSteps = (lv.dragStep || []).map((x) => this.byId('flushgamedragstep', x)).filter(Boolean);
    this.flushSteps = (lv.flushStep || []).map((x) => this.byId('flushgamestep', x)).filter(Boolean);
    this.isNewPlay = lv.isNewPlay > 0;
    this.skipPercent = lv.skipPercent || 50;
    // preload everything this level touches
    const lvScene = this.scenes['ASMRLeve' + id];
    const imgs = new Set();
    for (const s of this.flushSteps) { imgs.add(this.res(s.resBgId)); imgs.add(this.res(s.resMaskId)); }
    for (const s of this.dragSteps) if (s.resBgId) imgs.add(this.res(s.resBgId));
    const tools = new Set([...this.flushSteps, ...this.dragSteps].map((s) => this.res(s.resToolId)).filter(Boolean));
    await Promise.all([E.preloadImages(lvScene), ...[...imgs].map((n) => E.ensureImg(n)), E.preloadSpines(lvScene),
      ...[...tools].map((t) => Promise.all([E.preloadImages(this.scenes[t]), E.preloadSpines(this.scenes[t])]))]);
    this.buildWindow();
    await this.createGameContent();
  }

  buildWindow() {
    const root = E.instantiate(this.scenes.UIFlushGame);
    E.root = root;
    this.root = root;
    this.gameRoot = root.find('GameRoot');
    this.wm = root.find('GameRoot/Scene/UIWashMain');
    this.uiRoot = root.find('UIRoot');
    this.fx = new FX();
    this.wm.add(this.fx.node, this.wm.find('Guide').siblingIndex());
    this.bar = this.uiRoot.find('Image_BarBg/Image_Bar');
    this.barText = this.uiRoot.find('Image_BarBg/Text_BarNum');
    this.barText.stroke = 6; this.barText.font = 'bold 30px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
    this.finishBtn = this.uiRoot.find('BottomGroup/Middle/FinishBtn');
    this.returnBtn = this.uiRoot.find('BottomGroup/Middle/ReturnBtn');
    this.skipBtn = this.uiRoot.find('SkipBtn');
    this.stepGroup = this.uiRoot.find('BottomGroup/StepGroup');
    this.newGuide = this.uiRoot.find('NewGuide');
    this.stepState = this.uiRoot.find('StepState');
    // OnOpenWindow / PrivateAwake
    this.returnBtn.setActive(false);
    this.uiRoot.setActive(false);
    this.totalProgress = 0; this.currentStepProgress = 0; this.curStepPercent = 0; this._displayProgress = 0;
    this.clickIdx = 0; this.flushIdx = 0; this.dragGroupIdx = 0;
    this.inTransition = false; this._waitPickUp = false; this.guideIdleTimer = 0;
    this.wash = null; this.dragCtrl = null; this.makeOver = null; this.levelInst = null; this.levelDone = false;
    this.returnBtn.setActive(this.level.id > 4);
    this.updateProgressBar(0);
    // ShowGameUI
    this.finishBtn.setActive(false);
    this.uiRoot.setActive(true);
  }

  async createGameContent() {
    if (this.isNewPlay) { const s = Math.max(E.W / 1024, E.H / 2048); this.wm.sx = this.wm.sy = s; }
    // SetupBottomBar
    this.stepBtns = [...this.stepGroup.find('one').children, ...this.stepGroup.find('two').children];
    this.stepGroup.setActive(this.isNewPlay);
    this.uiRoot.find('BottomGroup/Middle').setActive(!this.isNewPlay);
    this.skipBtn.setActive(false);
    this.stepGroupHomeY = this.stepGroup.r[5];
    this.stepGroupOut = false;
    // BuildDragGroups
    const ds = this.dragSteps.slice().sort((a, b) => a.stepSeq - b.stepSeq || a.id - b.id);
    this.dragGroups = [];
    for (const s of ds) {
      const g = this.dragGroups[this.dragGroups.length - 1];
      if (g && g[0].groupId === s.groupId) g.push(s); else this.dragGroups.push([s]);
    }
    if (this.isNewPlay) this.fillStepGroup();
    if (this.dragGroups.length) await this.createDragStepGame();
    else if (this.clickSteps.length) await this.createClickStepGame();
    else await this.createFlushGame();
  }

  // ---------- click steps ----------
  async createClickStepGame() {
    const inst = E.instantiate(this.scenes['ASMRLeve' + this.curLevelId]);
    this.gameRoot.add(inst);
    this.levelInst = inst;
    await E.initSpines(inst);
    this.makeOver = new MakeOver(this, inst);
    if (this.flushSteps.length) {
      this.wash = new Wash(this, this.wm);
      this.wash.WaitPickUp = this.isNewPlay;
      this.wash.initRawImage(this.flushSteps[0]);
      this.makeOver.init(() => this.startFlushGame());
    } else {
      this.wm.setActive(false);
      this.makeOver.init(() => this.onFlushGameCompleted());
    }
  }
  onClickStepStarted(step) {
    this.totalProgress += step.finishNum;
    this.clickIdx++;
    this.updateProgressBar(0.5);
  }

  // ---------- flush steps ----------
  async createFlushGame() {
    this.wash = new Wash(this, this.wm);
    this.wash.WaitPickUp = this.isNewPlay;
    this.startFlushGame();
  }
  prepareWashLayer() {
    if (!this.wash) this.wash = new Wash(this, this.wm);
    this.wash.WaitPickUp = this.isNewPlay;
    this.wash.initRawImage(this.flushSteps[0]);
  }
  startFlushGame() {
    if (!this.flushSteps.length) { this.onFlushGameCompleted(); return; }
    this.startNextFlushStep();
  }
  async startNextFlushStep() {
    if (this.flushIdx >= this.flushSteps.length) { this.onFlushGameCompleted(); return; }
    const step = this.flushSteps[this.flushIdx];
    this.curFlushStep = step;
    this.curStepSeq = step.stepSeq;
    this.layout();
    const gn = this.findGuideNode(step.guideTargetNode);
    this.guideTarget = gn ? gn.worldPos() : this.wm.find('RawImage_Mask').worldPos();
    this.guideIdleTimer = step.hasInitGuide > 0 ? 5 : 0;
    this.setGuideTextPos(step.guideTextPos);
    this.refreshStepGroup(step.stepSeq);
    this.wash.WaitPickUp = this.isNewPlay;
    if (this.isNewPlay) this._waitPickUp = true;
    this.currentStepProgress = 0; this.curStepPercent = 0;
    this.updateProgressBar(0.5);
    await this.wash.initGame(step, () => { if (!this.isNewPlay) this.wash.startGame(); }, (p) => this.onRefreshBarPercent(p));
    this.recordToolReturnPos();
  }
  onRefreshBarPercent(p) {
    this.curStepPercent = Math.max(0, Math.min(1, p));
    this.currentStepProgress = this.curFlushStep.finishNum * this.curStepPercent;
    this.updateProgressBar(0.1);
  }
  onHideReturn() {
    this.returnBtn.setActive(false); this.finishBtn.setActive(false); this.skipBtn.setActive(false);
    this.inTransition = true;
  }
  startNextStepEvent() {
    if (this.isNewPlay) this.showStepState(true, () => this.doStartNextStep());
    else this.doStartNextStep();
  }
  doStartNextStep() {
    this.inTransition = false;
    this.totalProgress += this.curFlushStep.finishNum;
    this.currentStepProgress = 0;
    this.flushIdx++;
    this.startNextFlushStep();
  }

  // ---------- drag steps ----------
  async createDragStepGame() {
    const inst = E.instantiate(this.scenes['ASMRLeve' + this.curLevelId]);
    this.wm.add(inst, this.wm.find('ToolRoot').siblingIndex());
    this.levelInst = inst;
    await E.initSpines(inst);
    if (this.dragSteps.every((s) => s.stepType === 2)) {
      const sg = inst.find('SpineGroup');
      if (sg) this.wm.add(sg, 0);
    }
    const minFlush = this.flushSteps.length ? Math.min(...this.flushSteps.map((s) => s.stepSeq)) : Infinity;
    this.dragBeforeFlush = this.dragGroups[0][0].stepSeq < minFlush;
    if (this.dragBeforeFlush) {
      if (this.flushSteps.length) this.prepareWashLayer();
      this.startNextDragGroup();
    } else this.startFlushPhase();
  }
  startFlushPhase() {
    if (this.dragCtrl) { this.dragCtrl.destroy(); this.dragCtrl = null; }
    this.prepareWashLayer();
    this.startFlushGame();
  }
  async startNextDragGroup() {
    if (this.dragGroupIdx >= this.dragGroups.length) { this.onAllDragGroupsDone(); return; }
    const g = this.dragGroups[this.dragGroupIdx++];
    if (this.wash) this.wash.destroyTool();
    if (g[0].resBgId > 0) {
      const name = this.res(g[0].resBgId); const im = E.img[name];
      const rb = this.wm.find('RawImage_Bg');
      const n = new E.Node({ n: 'RawImage_RoomBg', r: [0.5, 0.5, 0.5, 0.5, rb.r[4], rb.r[5], im.width, im.height, 0.5, 0.5], raw: name });
      n.sx = rb.sx; n.sy = rb.sy;
      this.wm.add(n, 0);
    }
    this.curStepSeq = g[0].stepSeq;
    this.layout();
    const gn = this.findGuideNode(g[0].guideTargetNode);
    if (gn) this.guideTarget = gn.worldPos();
    else {
      const pts = g.map((s) => this.levelInst.find(s.hitAreaName)).filter(Boolean).map((n) => n.rectWorldCenter());
      this.guideTarget = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    }
    this.guideIdleTimer = g[0].hasInitGuide > 0 ? 5 : 0;
    this.setGuideTextPos(g[0].guideTextPos);
    this.refreshStepGroup(g[0].stepSeq);
    this.groupWeight = g.reduce((a, s) => a + s.finishNum, 0);
    this.currentStepProgress = 0; this.curStepPercent = 0;
    if (this.dragCtrl) this.dragCtrl.destroy();
    const dc = new DragCtrl(this);
    this.dragCtrl = dc;
    dc.setCallBack((p) => this.onRefreshDragPercent(p), () => this.onDragGroupCompleted());
    this._waitPickUp = true;
    await dc.init(this.levelInst, g, this.res(g[0].resToolId), this.wm.find('ToolRoot'));
    this.recordToolReturnPos();
    this.updateProgressBar(0.5);
  }
  onRefreshDragPercent(p) {
    this.curStepPercent = Math.max(0, Math.min(1, p));
    this.currentStepProgress = this.groupWeight * this.curStepPercent;
    this.updateProgressBar(0.1);
  }
  onDragGroupCompleted() {
    this.totalProgress += this.groupWeight;
    this.currentStepProgress = 0;
    this.updateProgressBar(0.5);
    this.skipBtn.setActive(false);
    this.inTransition = true;
    this.showStepState(true, () => { this.inTransition = false; this.startNextDragGroup(); });
  }
  onAllDragGroupsDone() {
    if (this.dragBeforeFlush && this.flushSteps.length) this.startFlushPhase();
    else this.onFlushGameCompleted();
  }

  onFlushGameCompleted() {
    if (!this.dragBeforeFlush && this.dragGroups && this.dragGroupIdx < this.dragGroups.length) {
      if (this.wash) this.wash.destroyTool();
      this.startNextDragGroup();
      return;
    }
    if (this.isNewPlay) this.refreshStepGroup(1e9);
    this.exitGame(false);
  }

  exitGame(notFinish) {
    E.audio.stopAll();
    if (notFinish) { this.inTransition = true; if (this.onQuit) { const f = this.onQuit; this.onQuit = this.onFinish = null; f(); } else window.UI.showMenu(); return; }
    if (!this.save.done.includes(this.curLevelId)) { this.save.done.push(this.curLevelId); this.writeSave(); }
    this.levelDone = true;
    if (this.onFinish) { const f = this.onFinish; this.onQuit = this.onFinish = null; E.after(1.0, f); return; }
    E.after(0.8, () => window.UI.showComplete(this.curLevelId, this.nextLevelId()));
  }

  // ---------- step group (new play) ----------
  fillStepGroup() {
    const map = {};
    for (const g of this.dragGroups) map[g[0].stepSeq] = g[0].iconResName;
    for (const s of this.flushSteps) map[s.stepSeq] = s.iconResName;
    this.stepIconSeq = this.level.stepIconSeq || Object.keys(map).map(Number).sort((a, b) => a - b);
    this.stepIcons = this.stepIconSeq.map((q) => map[q]);
    this.stepGroup.find('two').setActive(this.stepIcons.length > 3);
    this.stepBtns.forEach((b, i) => {
      b.setActive(i < this.stepIcons.length);
      if (i < this.stepIcons.length) b.find('Icon').img = this.stepIcons[i];
    });
    this.refreshStepGroup(Math.min(...Object.keys(map).map(Number)));
  }
  refreshStepGroup(cur) {
    if (!this.isNewPlay || !this.stepIcons) return;
    if (this.beatTween) { E.kill(this.beatTween); this.beatTween = null; }
    this.curStepBtn = null;
    this.stepBtns.forEach((b, i) => {
      if (!b.active) return;
      const seq = this.stepIconSeq[i];
      const done = seq < cur, isCur = seq === cur;
      const fin = b.find('Finish');
      fin.setActive(done);
      if (done) { fin.img = fin.imgName0; fin.find('Finish').img = 'ui_step_duihao'; }
      b.find('Lock').setActive(!done && !isCur);
      b.find('NormalBase').setActive(!isCur);
      const sel = b.find('SelectedBase'); sel.setActive(isCur); sel.tint = '#ffe27a';
      b.sx = b.sy = 1;
      if (isCur) this.curStepBtn = b;
    });
    if (this.curStepBtn) {
      const b = this.curStepBtn;
      this.recordToolReturnPos();
      this.beatTween = E.tween({ dur: 0.55, ease: E.ease.inOutSine, loop: true, yoyo: true, update: (k) => { b.sx = b.sy = 1 + 0.12 * k; } });
    }
    this.skipBtn.setActive(!!this.curStepBtn);
  }
  recordToolReturnPos() {
    if (!this.isNewPlay) return;
    this.layout();
    const p = this.curStepBtn ? this.curStepBtn.worldPos() : null;
    if (this.wash) this.wash.ToolReturnWorldPos = p;
    if (this.dragCtrl) this.dragCtrl.setToolReturnPos(p);
  }
  onStepBtnPickUp(i) {
    if (this.stepIconSeq[i] !== this.curStepSeq) { this.showStepState(false); return; }
    if (!this._waitPickUp) { this.slideStepGroup(false); return; }
    this._waitPickUp = false;
    this.hideStepGuide();
    const P = E.ptr;
    if (this.dragCtrl && !this.dragCtrl.IsFinished && this.curStepSeq === this.dragCtrl._steps[0].stepSeq) {
      this.dragCtrl.showToolOnly(P.x, P.y);
      this.slideStepGroup(false, () => this.dragCtrl.startGame());
    } else if (this.wash) {
      this.wash.showToolOnly(P.x, P.y);
      this.slideStepGroup(false, () => this.wash.startGame());
    }
  }
  slideStepGroup(inn, cb) {
    const out = !inn;
    if (out === this.stepGroupOut) { if (cb) cb(); return; }
    this.stepGroupOut = out;
    if (this.slideTween) E.kill(this.slideTween);
    const y0 = this.stepGroup.r[5];
    const y1 = out ? this.stepGroupHomeY - (this.stepGroup.h + 200) : this.stepGroupHomeY;
    this.slideTween = E.tween({ dur: out ? 0.15 : 0.2, ease: E.ease.outQuad, update: (k) => { this.stepGroup.r[5] = y0 + (y1 - y0) * k; },
      done: () => { if (inn) this.recordToolReturnPos(); if (cb) cb(); } });
  }
  setGuideTextPos(p) { const t = this.newGuide.find('Content_Text'); if (p) { t.r[4] = p[0]; t.r[5] = p[1]; } }
  findGuideNode(name) {
    if (!name) return null;
    const f = (root) => root && (root.find(name) || root.findDeep((n) => n.name === name));
    return f(this.levelInst) || f(this.wm);
  }
  showStepGuide() {
    if (!this.curStepBtn || !this.guideTarget || this.newGuide.active) return;
    const hand = this.newGuide.find('Hand');
    const txt = this.newGuide.find('Content_Text');
    txt.txt = this.text('Guide_ASMR_drag'); txt.stroke = 8; txt.font = 'bold 40px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
    this.newGuide.setActive(true);
    this.layout();
    const from = this.curStepBtn.worldPos(), to = this.guideTarget;
    const run = () => {
      hand.setWorldPos(from[0], from[1]);
      this.guideMove = E.tween({ dur: 1.0, ease: E.ease.inOutSine, owner: this.newGuide,
        update: (k) => hand.setWorldPos(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k),
        done: () => E.after(0.4, run, this.newGuide) });
    };
    run();
  }
  hideStepGuide() { if (!this.newGuide.active) return; E.killOwner(this.newGuide); this.newGuide.setActive(false); }
  showStepState(ok, onDone) {
    const st = this.stepState;
    const s = st.find('Success'), f = st.find('Fail');
    s.setActive(ok); f.setActive(!ok);
    const im = ok ? s : f;
    E.killOwner(st);
    st.setActive(true); st.alpha = 1; im.sx = im.sy = 0;
    E.tween({ dur: 0.22, ease: E.ease.outBack, owner: st, update: (k) => { im.sx = im.sy = k; },
      done: () => E.tween({ dur: 0.3, delay: 0.6, owner: st, update: (k) => { st.alpha = 1 - k; }, done: () => { st.setActive(false); st.alpha = 1; if (onDone) onDone(); } }) });
  }

  // ---------- progress bar ----------
  updateProgressBar(dur = 0.5) {
    const overall = Math.max(0, Math.min(100, this.totalProgress + this.currentStepProgress));
    const target = this.isNewPlay ? Math.max(0, Math.min(1, this.curStepPercent)) * 100 : overall;
    if (this.barTween) E.kill(this.barTween);
    const from = this._displayProgress;
    const apply = (v) => { this._displayProgress = v; this.bar.fill = v * 0.01; this.barText.txt = `${Math.floor(v)}/100`; };
    if (dur <= 0) apply(target);
    else this.barTween = E.tween({ dur, update: (k) => apply(from + (target - from) * k) });
    if (!this.isNewPlay && overall >= this.skipPercent && !this.finishBtn.active && !this.inTransition && !this.levelDone) this.finishBtn.setActive(true);
  }

  // ---------- input ----------
  overSkip(x, y) { return this.skipBtn && this.skipBtn.activeInHierarchy() && this.skipBtn.hit(x, y); }
  pointerDown(x, y) {
    if (!E.root || window.UI.modal) return;
    this.layout();
    if (this.skipBtn.activeInHierarchy() && this.skipBtn.hit(x, y)) { this.onSkipStep(); return; }
    if (this.finishBtn.activeInHierarchy() && this.finishBtn.hit(x, y)) { this.onCloseSkip(); return; }
    if (this.returnBtn.activeInHierarchy() && this.returnBtn.hit(x, y)) { this.onCloseBtn(); return; }
    if (this.isNewPlay && this.stepGroup.active && !this.stepGroupOut && !this.inTransition) {
      for (let i = 0; i < this.stepBtns.length; i++) {
        const b = this.stepBtns[i];
        if (b.activeInHierarchy() && b.hit(x, y)) { this.onStepBtnPickUp(i); return; }
      }
    }
    if (this.makeOver) this.makeOver.tap(x, y);
  }
  onSkipStep() {
    if (this.dragCtrl && this.dragCtrl.IsFinished && !(this.wash && this.curStepSeq === (this.curFlushStep && this.curFlushStep.stepSeq))) { this.skipBtn.setActive(false); return; }
    this.skipBtn.setActive(false);
    this.hideStepGuide();
    this._waitPickUp = false;
    if (this.dragCtrl && !this.dragCtrl.IsFinished && this.curStepSeq === this.dragCtrl._steps[0].stepSeq) this.dragCtrl.skipToFinish();
    else if (this.wash) this.wash.setFlushGameFinished();
  }
  onCloseSkip() {
    if (this.wash && this.wash.step && !this.wash.finished) { this.finishBtn.setActive(false); this.wash.setFlushGameFinished(); }
    else if (!this.wash || this.wash.finished) { this.finishBtn.setActive(false); if (!this.wash) this.exitGame(false); }
  }
  onCloseBtn() {
    if (this.wash) this.wash.setWorkStopState();
    window.UI.confirm(this.text('flush_tips_skip'), () => { this.finishBtn.setActive(false); this.exitGame(true); }, () => { if (this.wash && this.wash.step && !this.wash.finished) this.wash.setWorkState(); });
  }

  update(dt) {
    if (!E.root || !this.level) return;
    this.fx && this.fx.update(dt);
    if (this.makeOver) this.makeOver.update();
    if (this.isNewPlay) this.updateNewPlay(dt);
    if (this.dragCtrl) this.dragCtrl.update();
    if (this.wash) this.wash.update(dt);
  }
  updateNewPlay(dt) {
    const P = E.ptr;
    if (this.inTransition || (this.dragCtrl && this.dragCtrl.IsFinished)) {
      this.slideStepGroup(false); this.hideStepGuide(); this.guideIdleTimer = 0; return;
    }
    if (P.down) { if (!this._waitPickUp) this.slideStepGroup(false); }
    else {
      this.slideStepGroup(true);
      if (!this._waitPickUp) {
        this._waitPickUp = true;
        const dragActive = this.dragCtrl && !this.dragCtrl.IsFinished && this.curStepSeq === this.dragCtrl._steps[0].stepSeq;
        if (dragActive) this.dragCtrl.requirePickUpAgain(); else if (this.wash) this.wash.requirePickUpAgain();
      }
    }
    if (!this._waitPickUp) { this.guideIdleTimer = 0; this.hideStepGuide(); }
    else {
      this.guideIdleTimer += dt;
      if (P.down) this.hideStepGuide();
      if (this.guideIdleTimer >= 5) this.showStepGuide();
    }
  }
}

window.Game = Game;
