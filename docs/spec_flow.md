# FlushGame (ASMR clean) — flow / UI / progression spec

Sources: UIFlushGameController (C), MakeOverController (M), AsmrDragStepController (D), FlushGameManager (FGM),
StorageFlushGame, SceneFsmFlushGame, out/flushgame.json, pf/*.json. InputCreateTexture (ICT, flush/brush painting) and
ToolHandComponent (tool sprite) are black boxes. "(inferred)" = not directly provable from IL.

## 0. Key facts up front
- The window is `FlushGame/Prefabs/UIFlushGame` (UINameConst.UIWin_FlashGame_Main). UIFlushGameResult / UIFlushEntrance /
  UIFlushGamePopupNotice / FlushGameScreen / Btn_Handoff are NOT referenced anywhere in Hotfix.dll (legacy). There is no
  result popup: a finished level just closes the window (FGM.ExitGame).
- `finishNum` is NOT a tap/hit count. It is the step's **progress weight** (points out of 100). Every level's weights sum to 100:
  L1 25+25+50, L2 20+80, L3 20+80, L4 20+80, L5 20+20+6x10, L6 20+80, L7 5x8+4x7+32, L8 20(drag)+4x20.
- A click step = ONE tap on its bubble. A drag step = ONE hit area that is cleared the moment the held pointer enters it.
- Two UI modes, switched by `level.isNewPlay` (C._isNewPlay = isNewPlay > 0):
  - Classic (levels 1-6, isNewPlay 0): progress bar shows overall %, bottom Middle group (Return/Finish), no step icons.
  - New play (levels 7-8, isNewPlay 1): StepGroup icon bar, per-step SkipBtn, pick-up-the-tool mechanic, guide hand, Success
    stamp between steps, bar shows the current step's %.
- Progression (FinishLevelIds) is effectively never written by the shipped code (see section 5); the standalone game must
  define its own (recommendation given).

## 1. Level flow

### 1.1 Entering
`FGM.InitAsmrGame(levelId, finishAction)`: curLevelId=levelId, isFinished=false, clear lists, `GetFlushGameInfo()`, open window,
BI 602. GetFlushGameInfo finds the level row by id (throws if missing) and builds `_clickSteps`, `_dragSteps`, `_flushSteps`
by looking each id up in its table, **in the config array order** (missing ids silently skipped).

Window: `PrivateAwake` binds FinishBtn->OnCloseSkip, ReturnBtn->OnCloseBtn, SkipBtn->OnSkipStep, hides ReturnBtn and UIRoot,
listens to events `FlushGame_UI_StartNextLevel`->StartNextStep and `FlushGame_UI_Hide_Return`->HideReturn.
`OnOpenWindow`: gameType=1, `InitFlushGame()`, skipPercent = level.skipPercent (ctor default 50),
`ReturnBtn.active = level.id > 4`.
`InitFlushGame` (once): `InitProgress` (all progress = 0; precompute click/flush weight sums; bar update) -> `ShowGameUI`
(FinishBtn hidden, UIRoot shown) -> `CreateGameContent`.

### 1.2 CreateGameContent (dispatch)
1. If isNewPlay: `FitWashMainToScreen` -> UIWashMain.localScale = max(canvasW/1024, canvasH/2048) (cover-fit a 1024x2048 design).
2. `SetupBottomBar(isNewPlay)`: collects `_stepBtns` = grandchildren of `UIRoot/BottomGroup/StepGroup` (StepBtn1..6; rows
   `one`,`two`), adds PointerDown trigger -> `OnStepBtnPickUp(index)`; caches StepState (Success/Fail, pivot moved to (1,0)
   keeping position), NewGuide (Hand, Content_Text). StepGroup.active = isNewPlay; Middle.active = !isNewPlay; SkipBtn hidden.
3. `BuildDragGroups`: sort drag steps by (stepSeq, then id); consecutive equal `groupId` -> one group.
   L7: group 701 = [7101..7105] (seq 1), group 702 = [7201..7204] (seq 2). L8: group 805 = [8501] (seq 5).
4. If isNewPlay: `FillStepGroup` (section 4.2).
5. If drag groups exist -> `CreateDragStepGame`; else if click steps exist -> `CreateClickStepGame`; else `CreateFlushGame`.

### 1.3 Click-step levels (1-6): CreateClickStepGame
- Instantiate `FlushGame/Prefabs/ASMRLeve{curLevelId}` under GameRoot (last child => drawn above Scene/UIWashMain).
  Add MakeOverController; onClickStepStarted=C.OnClickStepStarted, onStepCompleted=C.OnClickStepCompleted.
- If the level has flushStep: add ICT to UIWashMain, `ICT.InitRawImage(flushStep[0])`, `M.Init(onAll = StartFlushGame)`.
- Else (L5): UIWashMain.SetActive(false), `M.Init(onAll = OnFlushGameCompleted)`.
- The click prefab instance is never destroyed between click and flush phase (stays until window cleanup).
- Order: L1 101 -> 102 -> flush 1001; L2 201 -> 2002; L3 301 -> 3001; L4 401 -> 4001; L5 501..508 then end; L6 601 -> 6001.

### 1.4 Flush steps (all modes): StartFlushGame / StartNextFlushStep / DoStartNextStep
- `CreateFlushGame` (only if no click/drag): add ICT to UIWashMain, StartFlushGame.
- `StartFlushGame`: no flush steps -> OnFlushGameCompleted, else StartNextFlushStep.
- `StartNextFlushStep`: if index >= count -> OnFlushGameCompleted. Else step = flushSteps[index]; _curStepSeq = step.stepSeq;
  guide target = FindGuideNode(step.guideTargetNode) else (name empty) UIWashMain/RawImage_Mask position;
  _guideIdleTimer = hasInitGuide>0 ? 5 : 0; SetGuideTextPos(guideTextPos); RefreshStepGroup(stepSeq); `ICT.InitGame(step.id)`;
  if newPlay _waitPickUp=true; `ICT.SetCallBack(onReady, OnRefreshBarPercent)` where onReady dispatches `FlushGame_UI_Start`
  only in classic mode (new play waits for tool pick-up); step progress = 0; bar update (0.5 s).
- ICT progress -> `OnRefreshBarPercent(p)`: curStepPercent=clamp01(p); currentStepProgress = step.finishNum*p; bar tween 0.1 s.
- Step done (ICT.ShowFinishEffect, black box): dispatches `FlushGame_UI_Hide_Return` (-> HideReturn: Return/Finish/Skip hidden,
  _inTransition=true), sound 1902, finish effect, then sound 1901 and `FlushGame_UI_StartNextLevel` (classic mode only after
  UIWashMain `Disappear` anim with RootMask shown).
- `StartNextStep`: newPlay -> ShowStepState(true, DoStartNextStep); classic -> DoStartNextStep.
- `DoStartNextStep`: _inTransition=false; totalProgress += step.finishNum; stepProgress=0; index++; StartNextFlushStep.

### 1.5 Drag levels (7-8): CreateDragStepGame
- Instantiate `ASMRLeve{id}` under **UIWashMain**, sibling index = ToolRoot's index (above RawImage_Bg/Mask/RootMask/
  RawImage_Top, below ToolRoot and Guide).
- If ALL drag steps have stepType==2 (L8): move `SpineGroup` out of the instance into UIWashMain (worldPositionStays) as first
  sibling (behind the wash layers; the curtain sits behind the window glass).
- `_dragBeforeFlush = firstGroup.stepSeq < min(flush.stepSeq)` (min of empty list = int.MaxValue).
  - L7: 1 < 3 -> true: `PrepareWashLayer` (add ICT, ICT.WaitPickUp=isNewPlay, ICT.InitRawImage(flush[0]=7301)) then
    `StartNextDragGroup`.
  - L8: 5 < 1 -> false: `StartFlushPhase` (destroy dragCtrl, PrepareWashLayer, StartFlushGame) — flush 8101,8201,8301,8401 first.
- `StartNextDragGroup`: if all groups done -> `OnAllDragGroupsDone`. Else g = groups[i++]; _curStepIdForBi=g[0].id;
  ICT.DestroyTool + DestroyFinishEffect (if ICT exists); if g[0].resBgId>0: create `RawImage_RoomBg` (RawImage, texture
  = resouse path, native size, no raycast, first sibling of UIWashMain, local pos/scale copied from RawImage_Bg) — L8: id 10805
  `RoomLevelTextures/BG`; BI 606; _curStepSeq=g[0].stepSeq; guide target = FindGuideNode(g[0].guideTargetNode), or if the name is
  empty the average world position of the group's hit areas; _guideIdleTimer = hasInitGuide>0 ? 5 : 0; SetGuideTextPos;
  RefreshStepGroup(stepSeq); groupWeight = sum(finishNum of group); step progress/percent = 0; destroy old dragCtrl, add new
  D on the level instance; toolPath = resouse(g[0].resToolId).path; `D.SetCallBack(OnRefreshDragPercent, OnDragGroupCompleted)`;
  _waitPickUp=true; `D.Init(levelRoot, g, toolPath, UIWashMain/ToolRoot, null)`; RecordToolReturnPos; bar update.
- `OnRefreshDragPercent(p)`: curStepPercent=clamp01(p); stepProgress = groupWeight*p; bar 0.1 s.
- `OnDragGroupCompleted`: BI 607; totalProgress += groupWeight; stepProgress=0; bar; SkipBtn hidden; _inTransition=true;
  ShowStepState(true, -> _inTransition=false; StartNextDragGroup).
- `OnAllDragGroupsDone`: if dragBeforeFlush && flush steps exist -> `StartFlushPhase`; else OnFlushGameCompleted.

### 1.6 Finishing a level: OnFlushGameCompleted
- If !dragBeforeFlush and drag groups remain -> StartNextDragGroup (this is how L8 reaches its curtain step after 4 flushes).
- Else: RefreshStepGroup(stepIcons.Count+1) (every icon -> Finish), BI 603, `FGM.ExitGame(false)`.
- `ExitGame(notFinish)`: _playGameCount=0; OnSaveStorage; AudioManager.StopAllSound; if !notFinish invoke finishAction
  (in the real game: buy the home-decoration node); close window; open home.
- Full sequences: L7 = vines(5) -> leaves(4) -> rinse 7301 -> end. L8 = 8101 -> 8201 -> 8301 -> 8401 -> curtain 8501 -> end.

### 1.7 Next level / after level 8
No next-level logic exists in the minigame: each level is launched from a home-decoration node
(`UIItemGroup.GetEffectiveAsmrLevel`: node.asmrLevelB if >0 and AB test `ABTEST_ASMR_NEW_PLAY`=="1", else node.asmrLevel;
finishAction = OnNodeBuy). Standalone recommendation (inferred design): on ExitGame(false) add id to finishLevelIds and go to
id+1; after 8 show an "all clean" end screen with replay from 1 (or loop). Return (ExitGame(true)) = back to menu, no save.

## 2. Click steps (MakeOverController)
- `Awake`: `_skeletonGraphic` = `SpineGroup/CleanSpine` of the level prefab (startingAnimation "" = setup pose; L5 starts "1_1").
- `Init(onAll)`: buttons = GetComponentsInChildren<Button>() (active ones, hierarchy order), each onClick -> OnButtonClicked(i);
  `HideAllButtons`; `StartNextStep`.
- `StartNextStep`: step = clickSteps[idx]; BI 606; `ShowCurrentStepButton`: hide all, then activate the FIRST button (hierarchy
  order) whose `name.Contains(step.buttonName.Trim())`.
  - Contains + Trim matters: L1 prefab node is literally "RepairBubbleBtn " (trailing space) and config is "RepairBubbleBtn ";
    L2 config "BubbleBtn" matches prefab "CleanBubbleBtn"; L5 501 "BubbleBtn" matches "BubbleBtn" (first in order).
    L4 "CleanBubbleBtn2" is never used.
- `OnButtonClicked(i)`: ignore if _isPlayingAnimation or all done or button doesn't match current step. Else: button hidden,
  `PlaySound(step.soundID)`, onClickStepStarted (C.OnClickStepStarted: totalProgress += finishNum, clickIdx++, bar tween 0.5 s),
  `PlayStepAnimation`.
- `PlayStepAnimation`: busy=true; CleanSpine track0 SetAnimation(AniName, loop=false); on Complete -> remove handler ->
  `PlayFinishAnimation`: if finishAniName empty -> complete immediately; else SetAnimation(finishAniName, loop=false), BI 607,
  on Complete -> onStepCompleted (C: bar update only), idx++, busy=false; idx>=count -> onAll else StartNextStep.
  (BI 607 is only sent when finishAniName exists.)
- Per-step data (AniName / finishAniName / weight / sound):
  L1 101 "1"/"1_idle"/25/1887, 102 "2"/"2_idle"/25/1888; L2 201 "1"/"1_idle"/20/1896; L3 301 "1"/"1_idle"/20/1892;
  L4 401 "1"/"1_idle"/20/1894; L5 501 "1_2"/-/20/1896, 502 "2"/-/20/1897, 503-508 "3_1".."3_6"/-/10/1898; L6 601 "1"/"1_idle"/20/1899.
- Bubble button prefab: Button (transition=Animation) + Animator `BubbleBtnButtonAnimator` (clips not dumped; idle bob/press
  pulse (inferred)), child Root/BG1 icon sprite (UIFlushGame_RepairBtn / _CleanBtn / _PestControlBtn / _SawBtn), Root/vfx_hint
  particle (hint sparkle). Size 102x102. Appear = SetActive(true) (+animator Normal state), disappear = SetActive(false) on tap.
  No tween in code.

## 3. Drag steps (AsmrDragStepController)
- `Init(root, steps, toolPath, toolParent, onReady)`: per step `hitArea = root.Find(hitAreaName)` (RectTransform),
  `target = root.Find(spinePath)` or `root.parent.Find(spinePath)` (L8: SpineGroup was moved into UIWashMain) -> SkeletonGraphic.
  `_isPull = steps[0].stepType==2`; `_useHitAnim = toolHitAnim non-empty`; `_hasTool = toolPath non-empty`;
  `_autoFinishPercent = steps[0].autoFinishPercent`. With tool: AddComponent ToolHandComponent, `Load(toolPath, toolParent)`.
- `StartGame` (after pick-up): _isWork=true, hand.Show. `ShowToolOnly`: hand.MoveTo(mouse), Show.
- `Update` (only while _isWork): ignore if pointer over UI "Image_Skip".
  - Pointer released: if ShouldAutoFinish -> AutoFinishRest; else hand.PlayWork(false), hand.Return (back to step button,
    ReturnWorldPos = current StepBtn world pos).
  - Pointer held: hand.PlayWork(!useHitAnim); hand.Follow(mouse); pull ? UpdatePull : UpdateDragOver.
- stepType 1 (`UpdateDragOver`): for each uncleared area whose rect contains the pointer -> `ClearAt(i, 0)`, progressCb(cleared/N);
  when cleared==N -> `Finish`.
- `ClearAt(i, delay)`: mark cleared, count++, remember last index/delay, hitArea.SetActive(false) (removes its vfx_hint),
  if useHitAnim: hand.PlayHit(toolHitAnim "work"); after `delay` s (DOVirtual) `PlayClearAnim(i)`: target track0
  SetAnimation(aniName, loop=false) + AddAnimation(finishAniName, loop=true, delay 0) if any.
- `ShouldAutoFinish`: !pull && autoFinishPercent>0 && cleared>0 && cleared*100 >= autoFinishPercent*N.
  L7 vines N=5 @40% -> 2 cleared; leaves N=4 @40% -> 2 cleared. Checked on release (D.Update and C->RequirePickUpAgain).
- `AutoFinishRest`: remaining areas k=0,1,2.. -> ClearAt(i, k*AutoFinishStagger) with AutoFinishStagger=0.08 s; progressCb(1); Finish.
- `Finish`: once; _isWork=false; hand.PlayWork(false), hand.FadeOut; after lastClearDelay + duration(target[last].aniName)
  -> finishCb (C.OnDragGroupCompleted).
- stepType 2 (`UpdatePull`, L8 CurtainHand): when held pointer enters hitArea[0] ("CurtainHand", rect p(0,200) 1000x1400)
  -> `FinishPull`: once; isWork=false; hand.Hide; hit area hidden; progressCb(1); target `SpineGroup/CurtainHand` (Curtain
  skeleton) SetAnimation("work", false) (+ finishAniName looped if set, none here); on Complete of the "work" entry -> finishCb.
  No auto-finish for pull.
- `SkipToFinish`: pull ? FinishPull : AutoFinishRest.
- Data: L7 group 701 vines (VineBtn1-5 -> SpineGroup/RoomAsmr_01_01..05, ani "1"->"1_idle", 8 pts each, tool 306 ScissorsTool,
  hit anim "work", guide node GuideNode1, text pos (0,300)); group 702 leaves (LeafBtn1-4 -> RoomAsmr_02_01..04, "2"->"2_idle",
  7 pts each, tool 307 BesomTool, GuideNode2, text (0,-250)). L8 8501 CurtainHand pull, 20 pts, tool 310 CurtainHandTool,
  resBgId 10805, hasInitGuide 0, no guide node (target = hit area centre).
- Unused by code: drag `soundID` (1887/1888 never read -> drag steps are silent unless the tool component plays something),
  `gametype`, `uiShowWait`, level `tipId`/`resName`.

## 4. UI (UIFlushGame / UIWashMain)

### 4.1 Progress bar (`UIRoot/Image_BarBg` top-centre y=-118, 592x58; `Image_Bar` 578x43 pivot left; `Text_BarNum`)
`UpdateProgressBarWithAnimation(dur)` (UpdateProgressBar = 0.5 s; live % refresh = 0.1 s):
overall = clamp(totalProgress + currentStepProgress, 0, 100); target = classic ? overall : clamp01(curStepPercent)*100.
Kill old tweens; tween _displayProgress -> target over dur (linear default): fillAmount = v*0.01, text = `"{(int)v}/100"`.
On complete: if overall >= 100 -> UIRoot Animator.Play("Appear") (bar celebration, FX particles (inferred)).
If overall >= skipPercent and FinishBtn inactive -> FinishBtn.SetActive(true).

### 4.2 StepGroup (new play only)
- `FillStepGroup`: map stepSeq -> iconResName from each drag group's first step and every flush step; `_stepIconSeq =
  level.stepIconSeq` (count must equal map size, else exception); `_stepIcons[i] = map[stepIconSeq[i]]`;
  row `two` active iff icons > 3; StepBtn i active iff i < count, `Icon` sprite from atlas FlushGameAtlas; then
  RefreshStepGroup(min stepSeq).
  L7: [1,2,3] -> Repair, Clean, Rinse (row one). L8: [1,3,4,2,5] -> row one: PestControl, Rinse, Wiper; row two: Polish, Hand.
  (Button position i shows stepSeq stepIconSeq[i]; play order is always by stepSeq.)
- `RefreshStepGroup(cur)`: kill beat tween; for each visible btn i, seq=stepIconSeq[i]: done=seq<cur, isCur=seq==cur:
  Finish.active=done (Finish/Finish = ui_step_duihao checkmark), Lock.active=!done&&!isCur, NormalBase.active=!isCur,
  SelectedBase.active=isCur, Icon color white, scale 1. Current: _curStepBtn=btn, RecordToolReturnPos, beat tween
  scale 1 -> 1.12, 0.55 s, InOutSine, infinite Yoyo. SkipBtn.active = (a current step exists).
- `OnStepBtnPickUp(i)` (PointerDown): if stepIconSeq[i] != curStepSeq -> ShowStepState(false) (Fail stamp) and return.
  If !_waitPickUp -> just slide out. Else _waitPickUp=false; dragCtrl.ShowToolOnly / ICT.ShowToolOnly; SlideStepGroupOut(then:
  dragCtrl.StartGame or dispatch `FlushGame_UI_Start`).
- Slide: Out = anchoredY -> homeY-(height+200) in 0.15 s OutQuad, blocksRaycasts=false (no-op if already out, callback still
  invoked). In = back to homeY in 0.2 s OutQuad, then blocksRaycasts=true, RecordToolReturnPos, restart guide if visible.
- `C.Update` each frame: if _inTransition or dragCtrl.IsFinished -> slide out, hide guide, timer=0, return.
  Pointer held: if !_waitPickUp slide out. Released: slide in; if newPlay && !_waitPickUp -> _waitPickUp=true and
  dragCtrl.RequirePickUpAgain (auto-finish check, else tool returns) / ICT.RequirePickUpAgain. => in new play you must re-grab
  the tool from the glowing step button after every release.
  Guide timer: if !_waitPickUp -> timer=0, hide guide. Else timer += dt; if pressed hide guide; if timer >= 5 -> ShowStepGuide.

### 4.3 Guide hand (`UIRoot/NewGuide`, text term `Guide_ASMR_drag`)
`ShowStepGuide` requires hand + target + NewGuide inactive + current StepBtn active: NewGuide on; Hand placed at current
StepBtn world pos (+GuideHandOffset = 0); loop forever: DOMove to guideTargetPos over 1.0 s InOutSine, wait 0.4 s, restart.
`Content_Text` anchoredPosition = guideTextPos. With hasInitGuide=1 the timer starts at 5 -> shows immediately while waiting
for pick-up; otherwise after 5 s idle. Hidden on press / pick-up / skip / transitions.
FindGuideNode searches the level instance then UIWashMain (L7 GuideNode1 (15,200), GuideNode2 (50,-630)).
Classic levels never show NewGuide (they never wait for pick-up); UIWashMain/Guide (Hand, Content_Text `Guide_ASMR_slide`)
belongs to ICT. Btn_Handoff (Guide/Btn_Handoff, arrows Left/Right) is inactive and unreferenced: skip it.

### 4.4 StepState stamp (`UIRoot/StepState` at (-293,180), scale 0.7; Success=ui_step_1, Fail=ui_step_2)
`ShowStepState(ok, onDone)`: show one image, alpha 1, image scale 0 -> 1 in 0.22 s OutBack, hold 0.6 s, CanvasGroup fade to 0
in 0.3 s, hide, onDone. Success after each drag group / each flush step (new play); Fail on tapping a wrong step icon.

### 4.5 Buttons
- SkipBtn (top-right (-90,-50), icon ui_skip): new play only; shown whenever a current step is set (no % threshold), hidden at
  setup, on group complete, on HideReturn. `OnSkipStep`: if dragCtrl finished just hide; else hide, BI 865 (stepId, pct),
  hide guide, `dragCtrl.SkipToFinish()` or `ICT.SetFlushGameFinished()` (normal completion chain follows).
- FinishBtn (Middle right, classic only): appears once overall >= skipPercent (60, L5 80); hidden at start and by HideReturn
  (re-appears on next bar update over threshold). `OnCloseSkip`: BI 604; if ICT exists: hide, ICT.SetFlushGameFinished();
  else (L5 clicks) `ExitGame(false)` = level completed.
- ReturnBtn (Middle left): visible only if level.id > 4 and classic (i.e. L5, L6); hidden by HideReturn. `OnCloseBtn`: BI 605,
  `OnCloseFlush`: common confirm popup (desc `flush_tips_skip`, Cancel yes, Close no). With ICT: dispatch `FlushGame_WorkStop`
  first; OK -> hide Finish, ExitGame(true); Cancel -> dispatch `FlushGame_Work`. Without ICT: OK -> ExitGame(true).
- UIRoot/Star is inactive/unused.

### 4.6 Result
None in code. Win feedback = ICT finish effect (sounds 1902 then 1901, Effect_star 401) + bar "Appear" at 100 % + Success stamp,
then the window closes. For the standalone build add a simple end card (optional; prefab UIFlushGameResult has
Rainbow_BG_Win title ui_flushgame_title + fireworks if you want to mimic it (inferred, unused)).

## 5. Progression / save
- StorageFlushGame: `finishLevelIds: List<int>`, `androidFinishLevelIds: List<int>` (the latter only cleared by debug).
- `OnCheckCurLevelIsFinish()`: curLevelId in finishLevelIds. `OnSaveStorage()` (from ExitGame): only if isFinished and not
  already contained -> add curLevelId; isFinished=false. `SaveCurrentLevel()` adds level id if absent.
- In shipped code isFinished is only ever set false and SaveCurrentLevel has no caller -> nothing is saved. `_playGameCount`
  is only reset to 0 in ExitGame (never incremented). SceneFsmFlushGame (music 900) is not on the InitAsmrGame path (inferred).
- Recommendation for HTML: localStorage {finishLevelIds:[...], curLevel}; save on ExitGame(false); next = curLevel+1, after 8 -> end
  screen / loop to 1. A level-select (UIFlushEntrance has a ScrollView list) is optional; nothing in code drives it.

## 6. Audio (ids only)
- Click tap: step.soundID (1887, 1888, 1892, 1894, 1896, 1897, 1898, 1899) via PlaySound(id, loop=false).
- Flush step tool loop: FlushGameStep.soundID (1889, 1890, 1891, 1893, 1895, 1896, 1900; 8401 none) — handled in ICT
  (OnWorkingSound / OnIdelSound, StopSoundById).
- Flush step finished: StopAllSound, 1902; then 1901 before advancing.
- Drag steps: none (soundID unused). Optional: play 1887/1888 on each ClearAt (inferred design).
- ExitGame: StopAllSound. Music 900 only in SceneFsmFlushGame.Enter (loop) (inferred: use as BGM).
- BI ids (no gameplay effect): 602 enter, 606 step enter, 607 step complete, 865 skip, 604 finish btn, 605 return, 603 level done.

## 7. Events summary
`FlushGame_UI_Start` (start tool/brush), `FlushGame_Work` / `FlushGame_WorkStop` (pause/resume ICT around confirm popup),
`FlushGame_UI_Hide_Return` (ICT->C step finished), `FlushGame_UI_StartNextLevel` (ICT->C advance to next flush step).
