# FlushGame "paint/erase" step: implementation spec

Sources: `il/Home.Games.FlushGame.InputCreateTexture.il` (ICT), `il/Home.Games.FlushGame.ToolHandComponent.il` (THC),
`il/Home.Games.FlushGame.UIFlushGameController.il` (UIC, callers only), `out/flushgame.json`, `pf/*.json`.
The brush kernels `FlushMaskBrush::DrawRect / DrawEllipse / CountAlphaAtLeast / SafeByteAdd` are NOT in the hot-update
DLL. They live in `Main.dll` (AOT, RVA 0). I disassembled them from `xapk/lib/lib/armeabi-v7a/libil2cpp.so` (ARM32):
Main.dll CodeGenModule methodPointers[rid-1] gives DrawRect 0x479ae00, SafeByteAdd 0x479b088, DrawEllipse 0x479b0a4,
CountAlphaAtLeast 0x479b3b0. The disassembly is in `scratchpad/work/*.s` and the decoding is in section 2.
Anything marked (inferred) was not read directly from code.

## 0. Constants (ICT::.ctor)

| field | default | notes |
|---|---|---|
| offectCenter | 0.74 | brush strength at the core (×255 → +188 alpha per stamp) |
| offectEdge | 0.016 | brush strength at the rim (×255 → +4 alpha per stamp) |
| brushFeather | 1.0 | overwritten in InitGame |
| brushW / brushH | 48 / 48 | overwritten from brushSize |
| handShowTimeMax | 5.0 s | idle time before the hand guide shows |
| FinishPersent | 0.85 | overwritten from finishPercent |
| frameInterval | 2 | CheckFinish runs every 2nd pressed frame |
| gameType | 1 | |
| _rateX/_rateY = 1, canvasW = 768, canvasH = 1644, offectX/Y, renderTexture | unused | no reads anywhere in ICT, so ignore them |
| _toolsSoundID | -1 | |
| mouseOutSetStartPos / OverPos | (0,0) | filled from safePosStart/End, but `OnCheckOutSet` is never called, so safePos* has no effect |

`DrawCircle` (GetPixel/SetPixel version, clamps alpha to 0.9) is dead code and is never called.

## 1. Step setup

UIC flow: `PrepareWashLayer` adds ICT to the `UIWashMain` instance and calls `InitRawImage(step0)`. Then
`StartNextFlushStep` → `ICT.InitGame(stepId)` → `SetCallBack(initFinish_cb, OnRefreshBarPercent)`.
`FitWashMainToScreen` scales UIWashMain by `max(rootW/1024, rootH/2048)`, which is a "cover" fit of a 1024×2048 design.

### UIWashMain hierarchy (pf/UIWashMain.json)
- `RawImage_Bg`: RawImage showing the CLEAN picture (`resBgId`, e.g. r_1).
- `RawImage_Mask`: RawImage showing the DIRTY picture (`resMaskId`, e.g. r_1_mask), with material `WashMask` that has
  shader property `_MaskTex`. The dirt layer sits on top of Bg.
- `RootMask` (off): SoftMask (invertMask = 1, invertOutsides = 1, channel = a) with children `New` (Image = resBgId),
  `Old` (Image = resMaskId) and `DraggeableMask` (FX trail and particle). Used only for the finish transition.
- `RawImage_Top` (off): always hidden by InitRawImage.
- `ToolRoot`: full-stretch parent for the tool prefab.
- `Guide` (Animator UIWashMain_Guide) contains `Hand`. This is the old-style hand hint.
- The Animator on UIWashMain (`_win_ani`) holds the "Disappear" clip.

### ICT::InitRawImage(step)
1. `gameType = step.gametype`.
2. rawBg.texture = res(resBgId); `_new` = res(resBgId); `_old` = res(resMaskId).
3. rawBg.SetNativeSize(); `localPosition = (uiBgPos[0]*0.01, uiBgPos[1]*0.01, 0)`; `localScale = uiBgScale*0.01`.
4. rawMask.texture = res(resMaskId); SetNativeSize; `localPosition = maskPos*0.01`; `localScale = uiBgScale*0.01`
   (the mask also uses uiBgScale). rawMask active, rawTop inactive.
5. `CreatRenderTexture()` builds the paint mask (see below).
6. Screen mapping. Take rawMask's world corners [0] (bottom-left) and [2] (top-right) and convert them to screen with the
   UI camera, giving BL and TR.
   `_rate_ST_W = texW / (TR.x-BL.x)`, `_rate_ST_H = texH / (TR.y-BL.y)`, `operOffset = -BL`.
   The result is texture pixels per screen pixel, with the origin at the mask's bottom-left corner.

### ICT::CreatRenderTexture: the paint mask `texture2D`
- `texture2D` = new RGBA32 texture with the mask picture's size (W×H). It is bound with `rawMask.material.SetTexture("_MaskTex", texture2D)`.
- The mask picture is read back with `ConvertToTexture2D` (Blit + ReadPixels). For each pixel i:
  - if `mask.alpha > 128`, the pixel is DIRT: `allPx++` and texture2D[i] = (0,0,0,0).
  - otherwise it is not part of the dirt: texture2D[i] = (0,0,0,255).
- So `_MaskTex.a` means "already cleaned". Cleaning raises alpha from 0 toward 255. Shader (inferred): the dirty layer is
  drawn with `alpha = mainTex.a * (1 - _MaskTex.a)`, so a cleaned spot shows RawImage_Bg underneath.
- Byte layout is Unity raw data: row 0 is the BOTTOM row and index = (y*W + x)*4 + 3 for alpha. In HTML, flip y.

### ICT::InitGame(stepId)
`finishNum = 0`, `levelInfo = step`, `InitRawImage(step)`. Then:
- `mouseOutSet*` = safePos* (unused).
- `FinishPersent = finishPercent/100`.
- `brushW = brushSize[0]`, `brushH = brushSize[1]`. These are RADII (half extents) in mask-texture pixels.
- `brushFeather = brushFeather>0 ? brushFeather*0.01 : 1.0`.
- `toolResPath = res(resToolId)`, then `InitTools()`, then `finishEffPath = res(finishEffect)` (401 = Effect_star) and `SendStageEnter`.
- `toolPos`: applied as `tool.localPosition = (toolPos[0], toolPos[1])` (raw units, no ×0.01) for gametypes 2–6 only. WaterFlush keeps the prefab position.
- `param1`: WaterFlush only (section 4).
- `uiShowWait`: delay in ms (×0.001) after the tool's `appear` animation before `initFinish_cb`.
- `hasInitGuide > 0` → StartGame sets `handShowTime = 5`, so the guide shows on the first idle frame.
- `soundID`: looping work sound. `finishNum` (config): the step's weight in the level progress bar (UIC).

## 2. Erase algorithm (ICT::Update → Draw → FlushMaskBrush)

### Update (every frame)
```
if !isWork: return
if pointer over UI "Image_Skip": return
if mouseButton0 held:
    OnWorkingSound(); PlaySpines(true); Draw()
    if currentFrame % frameInterval(2) == 0: CheckFinish()
    currentFrame++
    if guide.active: guide off, isCheckHandShow=false, handShowTime=0, return
else:
    if !isCheckHandShow: isCheckHandShow=true; handShowTime=0
    OnIdelSound(); PlaySpines(false)
    if autoFinishPercent>0 && lastFinishPercent >= FinishPersent*autoFinishPercent/100: SetFlushGameFinished()
    else OnReturnTool(false)
    CheckShowHand()
```
The paint is applied EVERY held frame, including frames where the finger does not move. Holding still keeps stamping the
same spot.

### Draw (once per held frame)
1. On the first frame of a press, `lastMousePos == (0,0)` (it is reset in OnReturnTool on release). Set
   `lastMousePos = mouse`, call `OnRefreshToolPos(mouse, 0)` and return. No paint is applied on that frame.
2. `delta = mouse - lastMousePos; lastMousePos = mouse`.
3. `before` = world position of the tool's paint node BEFORE moving the tool (see the paint-node table in section 4).
4. WaterFlush only: apply the param1 gun-lowering (section 4).
5. `OnRefreshToolPos(mouse, delta)` moves the tool to the finger.
6. `after` = world position of the paint node AFTER the move.
7. Convert both points: `p = WorldToScreen(node) + operOffset`. With `rate = min(_rate_ST_W, _rate_ST_H)`, compute
   `x0 = (int)(p_before.x*rate), y0 = (int)(p_before.y*rate)` and the same for `after` → x1, y1. `(int)` truncates.
8. `brushShape == 1` → `DrawRect(x0,y0,x1,y1, brushW, brushH)`. Any other value → `DrawEllipse(...)`.
   Both run on `GetRawTextureData()`, then `LoadRawTextureData` + `Apply`.
So each frame stamps ONE shape spanning the segment from the previous paint point to the current one. There is no
sub-stepping.

### SafeByteAdd(a, b) (native, 0x479b088)
`return (225 - a) < b ? 255 : a + b;` Once a sum would pass 225, it jumps straight to 255.
`b` is computed as `(int)(value*255)` (truncation) and used as a byte.

### FlushMaskBrush.DrawEllipse(bytes,W,H,x0,y0,x1,y1,rx,ry,feather,center,edge): capsule/ellipse stroke (default brush)
```
k  = rx/ry                                  // y is scaled by k, so the shape is a circle of radius rx in scaled space
c  = 0.5*sqrt((x0-x1)^2 + (k*(y0-y1))^2)    // half the focal distance
a  = sqrt(rx^2 + c^2)                       // semi-major axis; foci are P0 and P1
bbox: x in [min(x0,x1)-rx, max(x0,x1)+rx), y in [min(y0,y1)-ry, max(y0,y1)+ry)   (upper bounds exclusive)
for each pixel in bbox and inside [0,W)x[0,H):
    s = sqrt((x0-x)^2 + (k*(y0-y))^2) + sqrt((x-x1)^2 + (k*(y-y1))^2)
    if s >= 2a: skip                         // outside the ellipse
    depth = (a - s/2)/(a - c)                // 1 on the segment P0–P1, 0 at the rim
    t = 1 - depth                            // 0 at the center line, 1 at the rim
    if feather < 1: w = (t > 1-feather) ? (t-(1-feather))/feather : 0
    else:           w = t
    value = center - (center-edge)*w         // 0.74 at the core down to 0.016 at the rim
    alpha = SafeByteAdd(alpha, (int)(value*255))
```
When P0 == P1 the shape is a disk of radius rx (ry vertically) with a linear radial falloff (feather = 1), or a solid
core of radius (1-feather)*rx followed by a linear ramp.

### FlushMaskBrush.DrawRect(...): axis-aligned box (brushShape 1, Squeegee)
```
x in [minX-rx, maxX+rx), y in [minY-ry, maxY+ry)   (bbox of both points, inflated by rx/ry; not swept/rotated)
fx = clamp01( min(x-xStart, xEnd-x) / max(1, rx*feather) )
fy = clamp01( min(y-yStart, yEnd-y) / max(1, ry*feather) )
w  = min(fx, fy)
value = edge + (center-edge)*w                     // edge at the box border, center when deeper than rx*feather
alpha = SafeByteAdd(alpha, (int)(value*255))
```
Squeegee (8401): brushSize 200×60 gives a 400×120 px box. brushFeather 10 gives feather = 0.1, so the ramp is 20 px (x) by 6 px (y).

Only the alpha byte (offset +3) is written. RGB stays 0.

### Strength in numbers
A core pixel gets +188 per stamp. One stamp takes it from 0 to 188 (≥ 180, so it counts as clean). A second stamp
saturates it to 255. Rim pixels get +4 per frame. Draw runs every held frame (only CheckFinish is throttled to every 2nd
frame), so a still finger cleans the core within 1–2 frames and the rim builds up slowly (+4/frame at 60 fps).

## 3. Progress and finish

### CheckFinish (every 2nd held frame)
```
finishNum = CountAlphaAtLeast(raw, W*H, 180)          // number of alpha bytes >= 180
p = (finishNum + allPx - W*H) / allPx                 // fraction of originally-dirty pixels now >= 180
lastFinishPercent = p                                 // non-dirt pixels are 255, so they cancel out
callBack(p / FinishPersent)                           // UIC.OnRefreshBarPercent: clamp01, progress = cfg.finishNum * v, bar tween 0.1 s
if p >= FinishPersent: SetFlushGameFinished()
else finishNum = 0
```

### Auto finish on release
When the finger is up (Update) or in UIC's `RequirePickUpAgain` (new-play), the step finishes if
`autoFinishPercent > 0 && lastFinishPercent >= FinishPersent * autoFinishPercent/100`.
Example: 7301 has finish 95 and auto 40, so lifting the finger at ≥ 38% clean finishes the step.
Otherwise the tool returns (`OnReturnTool(false)`).

### SetFlushGameFinished (also used by Skip: UIC.OnSkipStep / OnCloseSkip)
1. `isWork = false; lastFinishPercent = 0; callBack(1.0)`.
2. `rawMask.SetActive(false)`. This is the "auto clear rest": the whole dirt layer vanishes at once with no fade.
3. Guide off. `OnClearRendererTexture()` returns immediately because renderTexture is always null.
4. `OnReturnTool(true)` (fade), `OnIdelSound()`, `PlaySpines(false)`.
5. `PlayHide()`: `tool.SetActive(false)` immediately, which cuts the fade short.
6. `ShowFinishEffect()`:
   - Dispatch `FlushGame_UI_Hide_Return`, `StopAllSound`, `PlaySound(1902)`.
   - Instantiate `Effect_star` under UIWashMain (localPos 0, scale 1), then `SendStageComplete(id)`.
   - Start a 3.0 s timer, then:
     - If level `isNewPlay > 0`: `PlaySound(1901)` and dispatch `FlushGame_UI_StartNextLevel` (UIC advances to the next step).
     - Else: `RootMask.SetActive(true)`, `PlaySound(1901)`, play `_win_ani` state "Disappear". On completion,
       dispatch `FlushGame_UI_StartNextLevel` and turn RootMask off. Visual (inferred): a soft-mask wipe (DraggeableMask
       with Trail and particles) sweeps between Old (dirty) and New (clean).

## 4. Per-gametype behaviour

Numeric mapping, from `switch(gameType-1)` in InitTools/CurrentToolPosNode/OnReturnTool/OnRefreshToolPos/Draw and the
config tool paths:

| # | enum | config tool | ICT branch |
|---|---|---|---|
| 1 | WaterFlush | WashTool / WashTool_4 | case 0 |
| 2 | Shovel | ShovelTool | case 1 |
| 3 | LawnMower | MowTool (Aspirator) | case 2 |
| 4 | SprayTool | SprayTool | case 3 |
| 5 | GrinderTool | GrinderTool, CleanBrushTool | case 4 (shared "spray" branch) |
| 6 | Squeegee | SqueegeeTool | case 5 (shared "spray" branch) |
| 7 | Scissors | drag step, ScissorsTool | none in ICT; handled by AsmrDragStepController and THC |
| 8 | Besom | drag step, BesomTool | same |
| 9 | CurtainHand | drag step, CurtainHandTool | same |

PlaySpines: `gameType == 4` uses `'work2'`, everything else uses `'work'`. ICT's Draw returns early for 7–9.

### InitTools: node lookup
The tool prefab is instantiated under ToolRoot.

| type | skeleton (SkeletonGraphic) | paint node (`CurrentToolPosNode`, used by Draw) | effects |
|---|---|---|---|
| 1 | `Water_Gun` | `pos_Washing` = `Water_Gun/touch_points` (SkeletonUtilityBone, local (0,600) under Water_Gun at (0,-845)) | `Effect_water`, `Effect_water_zi` (null in all WashTool prefabs) |
| 2 | `Shovel_Tool` | `pos_Shovel` = tool root (finger exact) | `Effect_grass` (eff_Shovel), `Effect_shuazi` (eff_Shovel2, absent → null) |
| 3 | `Aspirator_Tool` | `pos_Aspirator` = tool root | `Effect_grass` |
| 4 | `Spray_Gun` | `drawCenterNode` = child `touch_point` (3,37), else tool root | `Effect_water` (inactive in prefab) |
| 5/6 | first SkeletonGraphic in children | `touch_point` if present: CleanBrush (0,110), Squeegee (0,20); GrinderTool has none, so the tool root is used | `Effect_grass` (Grinder only; null for CleanBrush/Squeegee) |

For every type: `toolReturnPos = node.localPosition` (rest pose). Type 1 also stores `orgin_tool_pos = tool.position`.
The skeleton plays `appear` once (no loop) and gets the `OnComplete` listener. Then `OnReturnTool(false)` and
`tool.SetActive(!WaitPickUp)`. WaitPickUp is UIC._isNewPlay: a new-play level hides the tool until the player picks it
up from the step bar.

### OnComplete (spine)
When `appear` ends: loop `idle`, remove the listener. If `uiShowWait > 0`, wait `uiShowWait*0.001` s, then call
`initFinish_cb`. Otherwise call it immediately. `initFinish_cb` (UIC b__96_0): if NOT new-play, dispatch
`FlushGame_UI_Start` → ICT.StartGame. In new-play, UIC starts the step when the tool is picked up (inferred:
OnStepBtnPickUp → ShowToolOnly, then the slide-out callback dispatches FlushGame_UI_Start).

### StartGame (event FlushGame_UI_Start)
Kill the return tween, `isReturnTool = false`. If WaitPickUp, show the tool. `isWork = true`, `isCheckHandShow = true`,
and if `hasInitGuide > 0` set `handShowTime = 5`.

### OnRefreshToolPos(mouse, delta): tool follows the finger
Kill the return tween. If WaitPickUp and the tool is inactive, activate it. Then, by type:
- 1: set `touch_points.localPosition` = mouse converted into its parent (Water_Gun) local space. This drags the nozzle
  bone, so the spine bends toward the finger (inferred: SkeletonUtilityBone override mode). Move `Effect_water` and
  `Effect_water_zi` to the touch_points world position and activate them.
- 2: tool root localPosition = mouse in ToolRoot space. Activate `Effect_grass`. (The `Effect_shuazi` code sets its
  position to itself, which does nothing.)
- 3: tool root follows. Activate `Effect_grass`.
- 4/5/6: tool root follows. Activate the effect if it exists.
The tool root sits exactly under the finger, so the paint point is `finger + touch_point offset × prefab scale`, and the
sprite art is offset by its prefab position (Spray_Gun (238,-190), Grinder_Tool (130,-213) scale 0.5,
Shovel_Tool (33,-173) scale 0.5 rotZ, Aspirator_Tool (106,21) scale 0.5, Squeegee_Tool (0,-180) scale 0.7,
CleanBrush_Tool (0,0) scale 0.5).
Finally `isReturnTool = false`.

### WaterFlush gun lowering (Draw, gameType == 1, `param1 = [50, 30]`)
```
thr = param1[0]*0.01 * Screen.height              // 50% of screen height
if mouse.y >= thr: tool.position = orgin_tool_pos  // gun body stays at its rest place (bottom centre)
else:
  wThr = ScreenToWorld(0, thr).y ; wM = ScreenToWorld(0, mouse.y).y      // in the tool parent's plane
  tool.position = orgin_tool_pos - (0, (wThr - wM) * param1[1]*0.01, 0)  // body sinks 30% of how far the finger is below thr
```
The nozzle bone still goes exactly to the finger (OnRefreshToolPos).

### OnReturnTool(isFade): on release, finish, or WorkStop
- Return if `isReturnTool` is already set.
- `node = ToolReturnWorldPos.HasValue ? CurrentToolPosNode() : null`. ToolReturnWorldPos is set by UIC.RecordToolReturnPos
  to the current step-bar button's world position (new-play levels). Remember `pos = node.position`.
- If `_toolsSoundID != -1`, call `StopSoundById`.
- Per type: `node.localPosition = toolReturnPos` (snap back to rest), deactivate effects, `lastMousePos = 0`.
  Type 1 also does `tool.position = orgin_tool_pos`.
- Kill the tween. Then:
  - `isFade && node`: CanvasGroup on the tool (added if missing) fades to 0 over 0.2 s, then SetActive(false) and alpha is restored.
  - `!isFade && node`: `node.position = pos` (it stays where the finger was), then DOMove to ToolReturnWorldPos over
    0.2 s, Ease 6 = OutQuad, then `tool.SetActive(false)`. The tool flies back into the step button.
  - No node (old-style levels): the tool only snaps to its rest pose and stays visible.
- `isReturnTool = true`.

### ShowToolOnly (UIC on pick-up from step button)
Kill the tween, `isReturnTool = false`, activate the tool, `OnRefreshToolPos(Input.mousePosition, 0)`.

### RequirePickUpAgain (UIC new-play, on release)
If the auto-finish condition holds, call SetFlushGameFinished. Otherwise `isWork = false`, idle sound, idle spine,
`OnReturnTool(false)`. The player must drag the tool out of the bar again, which restarts the step.

### Sound
- `OnWorkingSound` (once per press; `workSoundPlaying` guards it): `_toolsSoundID = soundID`, `StopAllSound`,
  `PlaySound(soundID, loop = true)`. Sound IDs are in the config (1889 water, 1890 spray, 1891 grinder/brush,
  1893 shovel, 1895 mower, 1896, 1900). 8401 has no soundID.
- `OnIdelSound` (once per release): `StopAllSound`, `StopSoundById(_toolsSoundID)`, `_toolsSoundID = -1`.
- Events: `FlushGame_Work` → `SetWorkState`: isWork = true. `FlushGame_WorkStop` (UIC.OnCloseFlush/popup) →
  `SetWorkStopState`: isWork = false, StopAllSound, OnReturnTool(false), idle spine, hide the guide.
- Finish sounds: 1902 on finish, 1901 after 3 s.

### changedWaterState / PlaySpines(working)
`changedWaterState` is just the last state. The animation changes only on a transition:
true → `work2` (type 4) or `work` (others), looped; false → `idle`, looped. Track 0, set (not queued).
`_old`/`_new` are only textures for the RootMask finish transition. The IL does no Old/New swapping during play.

### Hand guide (old-style levels)
- `CheckShowHand` (idle frames only, while isCheckHandShow): `handShowTime += dt`. When it reaches 5 s, call
  `ShowGuide()` (shown only if the current level's `isNewPlay <= 0`), then `handShowTime = 0`, `isCheckHandShow = false`.
- After each release, isCheckHandShow is re-armed with timer 0, so the guide reappears after 5 s idle.
- Pressing hides the guide.
- `hasInitGuide` makes the first guide appear immediately (timer pre-set to 5).
- New-play levels use UIC.ShowStepGuide instead, after 5 s idle with the tool parked (UIC.Update `_guideIdleTimer`),
  and the step-bar slides out (0.15 s, OutQuad, y - (h+200)) while pressing and back in (0.2 s) on release.

## 5. ToolHandComponent (THC): used by AsmrDragStepController for drag steps (types 7–9)

ICT does not use it. It is the generic tool holder for Scissors/Besom/CurtainHand.

- **Load(path, parent, Vector2? localPos, onReady)**
  - Instantiate the prefab under `parent`. If localPos has a value, set it as the localPosition.
  - `Graphic` = first SkeletonGraphic in children (including inactive).
  - `HitPoint` = `Graphic/touch_points` if it exists (and then `_effectFollowHitPoint = true`); otherwise the tool root.
    Scissors, Besom and CurtainHand have no `touch_points`, so their root follows the finger. Their `touch_point` child is
    used by the drag controller (inferred).
  - `_returnPos = HitPoint.localPosition`.
  - `_effects` = direct children whose name starts with `"Effect_"`.
  - `_workAnim` = `"work2"` if the skeleton has that animation, else `"work"`.
  - Then `Tool.SetActive(false)` and `onReady()`.
- **Show()**: kill the tween, `_isReturned = false`. If inactive: activate and `PlayIn()`, which plays `appear` (once),
  then loops `idle` on complete. With no appear animation it loops `idle` directly.
- **MoveTo(screenPos)**: `HitPoint.localPosition` = screenPos converted into HitPoint's parent rect (UI camera).
- **Follow(screenPos)** (each held frame): kill the tween, Show(), MoveTo(). For each effect, if
  `_effectFollowHitPoint` set its position to HitPoint, and activate it. `_isReturned = false`.
- **PlayWork(bool)**: on change only, set track 0 to `_workAnim` (true) or `idle` (false), looped. The drag controller
  calls `PlayWork(!_useHitAnim)` while held, so tools with a `toolHitAnim` stay idle and play hits instead.
- **PlayHit(anim)**: if the animation exists: `SetAnimation(0, anim, false)` and `AddAnimation(0, "idle", true, 0)`;
  `_isWorking = false`. Called from AsmrDragStepController.ClearAt each time a hit area is cleared
  (toolHitAnim = "work" for Scissors and Besom).
- **Return()** (finger up; skipped if already returned): kill the tween. If `ReturnWorldPos` is set, DOMove HitPoint
  there over 0.2 s, OutQuad, then hide the tool. Otherwise snap HitPoint to `_returnPos`. Deactivate effects,
  `_isReturned = true`.
- **FadeOut()** (drag-step finish): disable effects, CanvasGroup alpha → 0 over 0.2 s, then hide and restore alpha.
  `_isReturned = true`.
- **Hide()**: kill the tween, disable effects, hide the tool, `_isReturned = true`.
- **OnDestroy**: kill the tween, destroy the tool.
- **Drag-controller use**: `Update` calls Follow(mouse) while held and PlayWork(false)+Return() on release. If
  ShouldAutoFinish (autoFinishPercent, 40 in config), it calls AutoFinishRest instead. Finish → PlayWork(false)+FadeOut().
  FinishPull → Hide().

## 6. HTML port checklist
1. Mask canvas = dirty image size W×H. Build `clean[]` (Uint8 alpha): 0 where dirtyImg.a > 128 (count allPx), 255 elsewhere.
2. Render: draw the clean bg, then the dirty image with per-pixel alpha `dirty.a * (1 - clean/255)` (inferred shader).
   For example, use destination-out with the clean mask as alpha.
3. Pointer → mask px: `(screen - maskBottomLeftOnScreen) * min(W/maskScreenW, H/maskScreenH)`, y measured upward
   (equivalently `y_img = H-1-y` in top-down arrays). Truncate to int.
4. Each held frame (not the first frame of a press): stamp ellipse/rect from the previous to the current paint point with
   the exact kernels above. The paint point is the tool's touch node, not the raw finger.
5. Every 2nd held frame: `p = (count(a >= 180) - (W*H - allPx)) / allPx`, `bar = min(1, p/FinishPersent)`.
   Finish at `p >= FinishPersent`. On release, finish if `autoFinishPercent > 0 && p >= FinishPersent*auto/100`.
6. Finish: hide the dirt layer instantly, hide the tool, play sound 1902 and the star effect, wait 3 s, then sound 1901
   and the next step (old-style levels also play the RootMask "Disappear" wipe first).
