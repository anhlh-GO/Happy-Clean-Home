# Happy Merge Home – Room (decoration / cleaning) meta-game spec

Source: Hotfix.dll IL (Room, RoomNode, RoomItem, RoomItemGraphic, RoomGraphic, Gameplay.RoomData, RoomManager,
UIItemGroup, UIBubble, UIProgress, Main_DecorationController, RoomTimeLineManager, Fsm.RoomRewardBoxLogic),
configs out/room*.json, room/10227_*.json, prefab dumps (all 52 Room10227 prefabs dumped to work/pf10227/*.json).
"(inferred)" = not read directly from code. Note: `DecoSelectUI`, `Decoration.UI.ChoseNodeItem`,
`Decoration.Bubble.NodeBubbleManager`, `RoomHelpBubbleController` belong to the WORLD (area/building) deco mode,
not the room. The room equivalents are **`UIItemGroup`** (select/buy panel) and **`UIBubble`** (node bubble).

---------------------------------------------------------------------------------------------------
## 0. Data model at a glance

| Thing | Source | Key |
|---|---|---|
| Room | out/room.json (`TableRoom`) | id, roomResId, rewardId[]/rewardNum[] (completion box), soundId, storyPos[] |
| Node (hotspot) | out/roomnode.json (`TableRoomNode`) filtered by roomId | id, nextNode[], isOpen, price… |
| Node graphic | room/<res>_Base/Offset/OldFur/Anim.json (`Home.Core.RoomNodeCfg` → `ItemCfgs`) | node id → items |
| Item | prefab `RoomRes/<res>/Prefabs/Room<res>/<itemId>` | itemId = `"<nodeId>_<Name>###<suffix>"` e.g. `1022706_EasyChair###tangyi_03` |
| Save | `StorageHome.roomData[roomId]` → `StorageRoom` → `roomNodes[nodeId]` → `StorageNode{id,status,selectId,oneTimeChoice}` | |

Item kinds inside a node (OldFur json `isOld`): **old** item (`*_old`, dirty version) and **new** items
(1 item = no choice; `_01.._06` = style choice). In-bundle file names are `Base_royalx.json`, etc.

Room 10227 nodes (14 counted + 1 RV):
```
id       name/items                          rq   price(102) flags                 next
1022701  Downstairs: 1ceng_04, 1ceng_old    700   30  isOpen asmr 1/B7 isHideOld   1022715
1022715  Graffiti: tuya_old only              0   40  isClear asmr 2/B8 isHideOld  1022716
1022716  Sticker: tiezhi_old only             0   35  isClear asmr 3/B3 isHideOld  1022703
1022703  Floor: diban_04, diban_old        1100   60  asmr 4/B4 isHideOld          1022717
1022717  Fence: weilan_old only               0   70  isClear asmr 5/B5 isHideOld  1022704
1022704  SwimmingPool: yongchi, yongchi_old 900   75  asmr 6/B6 isHideOld          1022705,1022709,1022714
1022705  zhushui (new only)                1000   80  isLoop                        1022706
1022706  EasyChair tangyi_01..06           1200  100                                1022712
1022712  Platform liushui (new only)        850   70  isLoop                        1022707
1022707  Food shiwu_01..06                 1100   75                                0 (end)
1022709  Cabinets guizi_01..06              650   80                                1022710
1022710  Sofas shafa_01..06                 850  110                                1022711
1022711  FloorPlants dazhiwu_01..06         450   90                                1022713
1022713  Animal chongwu_01..06              800   90  isLoop                        -1 (end)
1022714  Tree shu_01, shu_old                 1   –   isRvGet (free via rewarded ad) 0
```
All give decoReward [104] x10 (resource 104, inferred = XP). unLockResType 102 = the star/key currency earned in merge
(105 = event currency, 18 activity nodes only). Prefabs 1022702 (Upstairs) / 1022708 (Door) exist but have no node
row → unused standalone (the `1ceng_04` prefab already embeds the 2ceng and men skeletons).

---------------------------------------------------------------------------------------------------
## 1. Room load / scene assembly

### 1.1 Sequence (`RoomManager.EnterRoom` → `_coLoadRoom` → `Room.InitGraphic`)
1. `new Room(roomId, resId)`: `_data = new RoomData(roomId)` (creates `StorageRoom` if missing), `initCamera()`.
2. `Room.InitGraphic(isInit)`: `InitNodeStorage()` – every TableRoomNode without a StorageNode gets one with
   `status = isOpen ? 1 : 0`; `UpdateNodeStorage()` – repair pass: for every node with status 2 or 4, each
   `nextNode` still at 0 is set to 1.
3. `_InitGraphic` coroutine: `new RoomGraphic(room)` → creates GameObject `Room_<id>` at origin and instantiates
   `RoomRes/<res>/Prefabs/Room<res>/room2d_Room<res>` under it (just the BG SpriteRenderer, sprite
   `room2d_10227_BG###bg`, size 8.64×17.2 units, localPos (0,0,10), sortingOrder 0).
4. `initNodes`: for each `RoomNodeCfg` in the view config (`GetRoomNodeViewConfig(resId).roomNodes`) that has a
   TableRoomNode → `new RoomNode` → empty GameObject `Node_<id>` parented to the room; one `RoomItem` per ItemCfg
   (no graphics yet). Node 10227 (the BG pseudo-node in Base json) has no table row → ignored.
5. `isInit ? initItemFromStorage : ShowAllOldItem`. `initItemFromStorage`: status ≥ 2 → `Room.GetItem(id)` =
   `SetItem(storage.selectId)`; else `node.ShowOldItem()`.
6. `_coLoadRoom` waits (WaitForFixedUpdate) until `IsCurrentRoomReady` (BG + every current item prefab loaded).

### 1.2 Which item is visible per state (`RoomNode.SetItem` / `ShowOldItem`)
- Exactly one item per node is visible: `_currentItem`. `SetItem(id)` hides the previous (`ClearGraphic` =
  SetActive(false)), loads/activates the new (`UpdateSpriteAndOffset` → `RoomItemGraphic.SetItemSprite`, prefab
  instantiated once and cached), plays `Normal`.
- `SetItem("")`/`SetItem("0")` → `ShowOldItem()`: shows the `isOld` item; **if the node has no old item, the node is
  empty** (e.g. 1022705 zhushui, 1022712 liushui appear only when bought).
- Not bought (status 0/1): old item (if any). Bought (2/4): `selectId` item. isClear nodes bought: selectId is
  empty and `GetItem` returns early → nothing is shown (the dirt is gone).
- Locked nodes (status 0) still render their old item; they just get no bubble.
- `ItemListWithOutOld` = the selectable items = all non-old items (the attached-ad variants are filtered by status
  when an AttachedAd config exists; 10227 has none).

### 1.3 Positions and units
- Pixels-per-unit = 100. Design space = **864 × 1720 px** (`Room.DESIGN_WIDTH/HEIGHT`, literals in `initCamera`),
  origin = room centre, +y up. World units = design px / 100. The BG sprite is 864×1720 px centred at 0.
- **Item prefabs are placed at the node origin** (`TransformExtension.Reset` after SetParent) – all positioning is
  baked in the prefab: Spine items have their skeleton at (0,0) with world coordinates inside the skeleton; sprite
  old items have a child `01` at an absolute world position, z = 10 (e.g. yongchi_old `01` at (0,-4.70),
  diban_old (-1.13,-2.84), 1ceng_old (0.49,1.94), shu_old (0,3.90)). **For the port: draw every item in room
  coordinates; ignore Offset for drawing.**
- **Offset json** (`OffsetItemCfg.pos[]`, `{key, value{x,y}}`) is in design px from room centre and is only the
  **anchor of the bubble / focus point** (`ConvertOffsetToScreenPos`, `RoomItem.WorldPosition`, `RoomNode.Offset`).
  `key` = optional parent item id: `checkParentNode(key)` picks the value whose key equals the currently selected
  item of the parent node (the node id parsed from the key prefix); `key == ""` is the default. All 10227 keys
  are "". (`UpdateNodeIfParentIs` re-evaluates child offsets when a parent changes item.)
- `ConvertOffsetToScreenPos(cam, off)`: `d = off - CenterPosition; s = max(Screen.w/DesignW, Screen.h/DesignH);
  screen = (Screen.w/2 + d.x*s, Screen.h/2 + d.y*s)` (DesignW/H/Center are the dynamic focus values, see 1.5).

### 1.4 Draw order
- Unity sorts by sortingLayer (all Default) → **sortingOrder** → distance. The order is baked per renderer in the
  prefab and **mirrors Base.json `renderQueue`** (diban 1100, yongchi 900, zhushui 1000, guizi 650, shafa 901,
  dazhiwu 450, liushui 850, chongwu 902, shiwu 1100, old sprites: 1ceng_old 901, diban_old 1100,
  yongchi_old 1101, shu_old 1, weilan_old 2, tiezhi_old 650, tuya_old 900). Base `renderQueue` itself is only used
  by code for tap priority (`RoomNode.RenderQueue = renderQueue + 10`, highest wins in `Room.TapNode`).
- **SkeletonRenderSeparator**: a skeleton with `separatorSlotNames` is split at those slots into N+1
  `SkeletonPartsRenderer` children (`1`,`2`,`3`…) each with its own sortingOrder; the parent MeshRenderer draws
  nothing. Parts = consecutive runs of the skeleton draw order cut at the separator slots (slot `layer_N` objects
  are just markers). tangyi_0x: sep [layer_1, layer_2] → parts 200 / 1100 / 1200 (chair back behind the floor
  stuff, front over food 1100). 1ceng_04: three skeletons: 1ceng (sep layer_2,layer_1 → 500/600/700), 2ceng
  (layer_1 → 200/250), door men (layer_3,2,1 → 251/400/900/750). shu_01: parts 1/1. For the port: render each
  part as a separate draw entry with its sortingOrder, merging everything into one global sorted list; ties →
  BG z=10 first (inferred: stable by load order).
- `orderLayer` (2 nodes, not 10227): during `first_confirm`, `SpecialLogic` sets the first skeleton MeshRenderer
  sortingOrder to `orderLayer`, restored after the animation.

### 1.5 Camera
- Orthographic, position (0,0,-50), no user pan/zoom (no drag/pinch code references `Room.Camera`; only
  `FocusOn/FocusOff/TapNode`).
- `CalculateOrthographicSize(w,h)`: `halfW = w/200, halfH = h/200; if (Screen.w/Screen.h > w/h) size = halfW /
  cam.aspect else size = halfH` → **"cover" fit**: the 864×1720 room always fills the screen, overflow cropped
  (phones narrower than 0.502 show full height and crop the sides).
- `FocusOn(node)` (on style select, 0.5 s DOTween DOMove + DOOrthoSize):
  - if `focusScale > 0.1`: camera → (focusX, focusY) world units; size = `min(focusScale,
    baseSize - 2*max(|focusX|,|focusY|))`.
  - else: target = camera moved **1/3 of the way** toward the item's anchor (`MoveTowards(cam, itemWorld,
    dist*0.33333)`); `c = Offset*0.33333`; dynamic design = `((432-|c.x|)*2, (860-|c.y|)*2)`; size =
    `CalculateOrthographicSize(dynamic)`; `CenterPosition = c` (keeps bubbles consistent).
- `FocusOff()`: tween back to (0,0,-50) + base size in 0.5 s, `resetCamera()` (center 0, 864×1720).

---------------------------------------------------------------------------------------------------
## 2. Node states & unlock graph

### 2.1 Status (`StorageNode.status`, enum `RoomItem.Status`)
`0 Lock`, `1 UnLock` (purchasable, has bubble), `2 Received` (bought), `3 LockAttachedAd` (bought, ad variant not
taken), `4 ReceivedAll` (bought + ad variant). Without AttachedAd configs only 0/1/2 occur.

### 2.2 Transitions
- Initial: `isOpen ? 1 : 0` (`InitNodeStorage`). One `isOpen` root per room (10227: 1022701).
- Buy: `RoomData.UnLockNextNode(id, rvGot)`: node → 2 (or 3/4 if attached-ad), then if `nextNode[0] > 0`, every
  `nextNode` with status < 2 → 1. `nextNode [0]` and `[-1]` both mean "none" (only `[0]` element is tested).
  The graph is a DAG/tree; branches open in parallel (1022704 opens 3 nodes).
- `Room.BuyNode(id)` sets status 1 (no-op guard before UnLockNextNode), `Room.UpdateNodeSelect` sets 2/4 +
  selectId.
- Progress `RoomManager.GetRoomDecorationRate(roomId, out finished, out rvFinished)` = finished / total where
  total = nodes with `!isRvGet && nodeBehaviour<=0` and not a detail-room child; finished = such nodes with
  status ≥ 2. RV nodes don't count. `IsFinish` = rate ≥ 1. 10227 total = 14.

### 2.3 Bubbles (`Main_DecorationController.UpdateBubble`, `UIBubble`)
- A bubble exists for each StorageNode with `status == 1`, or `RoomData.isRVGetAttachedNode` (attached-ad node with
  status 2/3). Bubbles of nodes leaving that set are destroyed.
- Prefab `ScreenOrigin/FurniturePointButton` (110×109): `PlaceBg/Background` bg sprite, `PlaceBg/PlaceIcon` =
  `iconResName` from atlas `CoomonAtlas` (e.g. ui_icon_noode_tangyi, ui_icon_noode_dasao for ASMR/cleaning),
  `PlaceBg/vfx_hint` glow particles, `PlaceBg/Arrow` guide arrow.
- Bg sprite: `ui_home_main_bg_buildTouchPointSpecial2` if `isRvGet`/RV-attached, `…Special`/`…Special3` for
  nodeBehaviour 1/2 (detail rooms), else `ui_home_main_bg_buildTouchPoint`.
- `canBuyEf` (vfx_hint) on if `isRvGet` or (status 1 and the player can afford `unLockPrice`).
- Position: `RoomNode.ScreenPos` (anchor from Offset, 1.3) / canvas scale, `FitUIPos` clamped into `SafeArea`,
  + random ±5 px jitter, then `BubbleFDG.StartSimulatePos` force-directed de-overlap, each bubble
  `DOLocalMove(1 s)` to its solved spot.
- Show anim (`ShowHideBubbles(true)`): scale 0 → 1 in 0.5 s, delay 0.15 s, Ease OutBack; hidden while a select
  panel / animation is active.

### 2.4 Per-field behaviour
| field | effect |
|---|---|
| isOpen | initial status 1 |
| nextNode | children opened on purchase (see 2.2) |
| unLockResType / unLockPrice | cost; UI icon via `CommonUtils.UpdateIconImage(type)`; afford check `UserData.CanAfford`; type 105 skips the no-money popup check |
| isRvGet | free node unlocked by rewarded video: panel shows `ADSButton` (or `ADSLoadingButton` if no fill) instead of price; RV success → `onSelectionConfirmClick` → `OnNodeBuy` RV branch (no cost). Excluded from progress; no interstitial afterwards |
| decoReward / rewardNum | resources granted in `AddDecorationReward` at purchase (reason 23); shown in panel `DecorationGroup` ("UI_common_reward" + icons); flown to the top bar (`FlyGameObjectManager.FlyObject`, sound 28) at the end of the replace animation |
| isClear | node only has an `_old` item; buying plays the old item's `clean` animation, then nothing remains. Panel hides the style grid and shows one tile with `decoraResName` icon (only if asmrLevel ≤ 0). Never cleared/replaced in the completion replay |
| isHideOld | completion replay (`ShowAllOldItem`) does NOT re-show its old item (used for ASMR/clean nodes) |
| notClearGraphic | completion replay (`ClearAllGraphic`) keeps its current graphic visible |
| oneTimeClean / oneTimeSound | first time the node's item plays `first_confirm`, it plays spine anim `oneTimeClean` instead and sound `oneTimeSound` instead of `sound`; `StorageNode.oneTimeChoice` set true |
| isLoop | after `first_confirm`/`Normal` finishes, `Normal` is played looped (`ChangeSkeletonLoopAnim`); otherwise `Normal` is played once (pose) |
| hideNodes ["02"] | during `first_confirm`, children named e.g. `02` under the node's non-old item roots are hidden, restored afterwards (`HideNodes`/`RecoverNodes`) |
| showNodes ["<nodeId>#<objName>"] | sub-objects (`objName`) of ANOTHER node's items that are only visible once THIS node is bought; toggled by `SetShowNodes(show, playAppear)` (Animator `appear` when shown with anim). Hidden in replay start |
| decoraResName | panel tile icon for clean/sweep nodes (e.g. ui_icon_main_sweep) |
| focusX/Y/Scale | camera focus on select (1.5) |
| sound | sound id → `GlobalConfigManager.GetSoundName` → `RoomRes/<res>/Sound/Room<res>/<name>` (e.g. sfx_deco_70027_sofa); BGM paused for its length |
| nodeBehaviour | 1/2 = enter/leave "detail room" sub-view (other rooms only) |
| orderLayer | temporary sortingOrder during first_confirm (1.4) |
| asmrLevel / asmrLevelB | ASMR minigame node (section 5) |

---------------------------------------------------------------------------------------------------
## 3. Style choice (`UIItemGroup`, the "SelectUI" panel)

Open paths:
- Bubble tap (`OnBubbleClick`, sound 200 via `GoToGetBubblesView`): status 1 or 3 → `GoToGetBubblesView`
  (buy panel); status 2/4 → `GoToSelectOneView` (change panel).
- Tap on a room item (`onPointerUp` → `Room.TapNode`: point-in-PolygonCollider2D of the current item, highest
  RenderQueue wins; **old items are not tappable** – `RoomItem.TouchMe` returns false): opens the panel for
  that node (sound 202). Item gets `Tap` anim (no 10227 skeleton has it). Activity rooms block re-tap of bought
  nodes. → This is the "change later" entry.
- Both hide main UI (`UIHomeMainController.HideUI`), hide bubbles, show `FullScreenClose` (tap outside = cancel).

`SetData(nodeCfg)`:
- `_itemList = node.ItemListWithOutOld` (in ItemCfgs order = Base json order; normally _01.._06).
- Grid `LayoutGroup/FurnituresLayout` (6 slots `FurnitureItem0..5`, 163 px tiles, grid `constraintCount =
  count ≤ 4 ? count : 3` → 6 items = 2 rows of 3) or `FurnituresFourLayout` when exactly 4 items. Slots beyond
  count hidden. Each tile = `UISelectableItem` with icon `RoomItem.Icon` = sprite `<suffix>_2d_256` from atlas/bundle
  `Icon<resId>` (e.g. `tangyi_03_2d_256` in `Icon10227`), `SelectedIndicator` frame on the selected one.
- **Immediate preview**: if `selectId` empty → `selectId := items[0]` (written to storage), `SelectItem(items[0])`;
  else `SelectItem(selectId)`. So the first style is put into the room as soon as the panel opens.
- Buttons (`InitDecorationText`): `SureSelectButton` (green `CommonBtnGreen`, text + currency icon + price
  `unLockPrice`; grey `CommonBtnGrey` + "have/price" text if not affordable; price/icon hidden when node already
  bought), `CloseSelectButton` (red), `ADSButton` for isRvGet. Reward row from decoReward.
- ASMR nodes: grid hidden, `LayoutGroup/AsmrGroup` shown with image `UIDecorationMain_RoomBG<asmrLevel>`.

`SelectItem(itemId)` (tile tap): sound 203, highlight tile, `Room.SetItem(node, itemId)` – the room swaps to that
style instantly (old/previous hidden, new shown in `Normal`), `RoomItem.OnSelected` → anim `choice` (absent in
10227 → no-op), `Room.FocusOn(node)`.

Confirm (`onSelectionConfirmClick`): ASMR → section 5; isClear → `OnNodeBuy`; status 1 (or RV-attached) →
`OnNodeBuy` (buy, 4.1); status 2/4 (restyle) → `ReplaceRoomNode(isBuy=true, isPlayAudio=false)`: stores selectId,
plays `first_confirm` + effects on the new style, then the normal end flow (focus off, reward fly = visual only;
no cost, nothing granted again – inferred from `AddDecorationReward` being called only in OnNodeBuy).

Cancel (`OnSelectionCancelClick` / FullScreenClose): if still status 1 → `selectId := ""`; item `OnDeSelect`
(Normal); `node.ResetDefault()` → `SetItem(storage selectId)` → old item back (or stored style for bought nodes);
camera `FocusOff`; bubbles + main UI back.

---------------------------------------------------------------------------------------------------
## 4. Buy / clean / replace sequence

### 4.1 `UIItemGroup.OnNodeBuy` (normal node, price path)
1. `CanAfford(type, price)` else `UIPopupNoMoneyController.ShowUI()` and stop (type 105 exempt).
2. `UIProgress.UpdateSlider`, `UserData.ConsumeRes` (reason 22), top-bar currency counts down (0.5 s),
   `AddDecorationReward` (grant decoReward), `Room.BuyNode`, `RoomData.UnLockNextNode(id,false)`,
   `UpdateBubble` (new bubbles for children appear), BI events. Input disabled.
3. After **0.5 s** → isClear ? `PlayCleanRoomAnim` (4.3) : `ReplaceRoomNode(true,true)` (4.2).
   RV path (`isRvGet`): same but no cost, `UnLockNextNode(id,true)`, no 0.5 s delay.

### 4.2 `ReplaceRoomNode(isBuy, isPlayAudio)` – new item appears
After **0.5 s** (`DelayWork`):
1. `PlayAudio()` – node `sound` (or `oneTimeSound` on first oneTimeClean), path `RoomRes/<res>/Sound/Room<res>/
   <name>`, BGM paused for clip length.
2. `selectId := selected item`, `SetPlayEffect(true)`, `SetShowNodes(false, true)`.
3. `RoomItem.OnChangeDifferentItem(cb)` (if stored id differed) or `OnConfirm(cb)` → both
   `RoomItemGraphic.PlayAnimation("first_confirm", cb)`.
   The old item was already hidden when the style was previewed (SetItem). So visually: on panel open the clean
   item replaces the dirty one in `Normal` pose; on confirm the new item plays its build-in animation.

`RoomItemGraphic.PlayAnimation(name, cb)`:
- `SwitchAnimName`: `first_confirm` → `oneTimeClean` if node.oneTimeClean && !storage.oneTimeChoice
  (`OneTimeChoice` then sets it).
- `SpecialLogic(name, false)`: first_confirm → `HideNodes()`, orderLayer override.
- duration = max(spine anim duration, Animator clip length) over names {first_confirm, clean, choice,
  oneTimeClean, Normal}. Animator only when Anim json `controller` non-empty (loaded from
  `RoomRes/Common/Animations/Common/<controller>.controller`, e.g. RoyalX_Common_01*); 10227 uses none →
  pure Spine.
- Spine: `skeletonDataAsset.defaultMix = 0`, `SetAnimation(0, name, loop=false)`, Update(0) on every
  SkeletonAnimation of the prefab (multi-skeleton prefabs play together). Animator `.Play(name)` if present.
- 10227 skeletons: new items have `Normal` + `first_confirm`; isClear old items (tuya/tiezhi/weilan) have
  `Normal` + `clean`. (2ceng/men/1ceng: `Normal` only found by string scan → effectively no confirm anim.)
- If duration ≤ 0: immediately `SpecialLogic(true)`, SetShowNodes, cb, loop handling; no effects.
- Else after `duration` s: if isAutoPlayEffect → `PlayEffect(true)` (activate effects), `SpecialLogic(true)`
  (RecoverNodes, `SetShowNodes(true,true)` → show-node objects play `appear`), then if the item has effects:
  **wait 1.5 s** → dispatch `RoomAnimationEnd(roomId)`, effects off, cb; else dispatch + cb immediately.
  Finally `ChangeSkeletonLoopAnim`: isLoop → `Normal` looped.
- Effects = Anim json `effects[]`: prefab `RoomRes/Common/effect/<prefabName>` instantiated once per item, renamed
  `objectName`, parented under the item's child `01`, Reset, then `AnimItemEffect.Cover`: for each
  transformVariant `path` (relative to the effect root) apply localPos/rot/scale/active; particle variants
  override ParticleSystem modules (startSize, shape rotation/scale, colour gradient, maxParticles…). 10227: every
  new item uses `ep_Common_first_confirm01` (sub-object `xingxing` = star sparkle), localPos = item centre in
  world units (e.g. tangyi (-2.12,-1.58), yongchi (0.64,-5.15)); tuya_old uses `ep_1022715_Graffiti###tuya_old`.
  For the port: a ~1.5 s star-sparkle burst at that point AFTER the build anim (sized by shape scale, e.g.
  5.14×2.78 units for the floor).

4. `ReplaceNodeEndCall(isBuy)` (cb): if !isBuy → re-enable input, close panel. Else: optional story
   (`StorySubSystem.Trigger("<roomId>_<finishedCount>")`, dialogue black box; `storyPos` [2,5,8,11] marks those
   counts on the progress bar), then `ShowUI`, `Room.FocusOff()`, after **0.35 s** `HandleDecorationReward` (fly
   reward icons, sound 28) → level-up check → `Fsm.RoomRewardBoxLogic.RoomDecorationBoxLogic(roomId)` (4.4) →
   `HandleRewardCallback` → panel closes, interstitial ad (`IN_Room_Decorate`, not for RV), guide triggers,
   `FinishNode` event if last room in chapter finished.

### 4.3 `PlayCleanRoomAnim` (isClear nodes)
After 0.5 s: `PlayAudio()`, `RoomManager.PlayCleanRoomAnim(cfg, cb)` → `RoomNode.PlayCleanRoomAnim` → for each
old item: SetActive(true), `PlayAnimation("clean", cb)` (dirt wipes away; same effect/1.5 s rules). cb →
`ReplaceRoomNode(false, true)` → `_selectItem == null` & isClear → `ReplaceNodeEndCall(false)` → input back,
panel closes. (No reward fly / story / box check on this path – rewards were already granted.) After reload the
node shows nothing.

### 4.4 Room complete (`Fsm.RoomRewardBoxLogic`)
`ValidateRoomState`: rate*100 ≥ 100 and `!StorageRoom.isGetBox` (and `CanUnLockNewRoom`) →
1. `PrepareUIForReward`: hide bubbles/panel, `FocusOff`, input off.
2. `HandleRewardDisplay`: sound 39, `UIProgress.SetSliderFull` (100%), `RoomDecorationReward.ShowDecorationReward`
   (box on the progress bar icon → `CommonRewardManager.PopRoomBoxReward` with TableRoom `rewardId/rewardNum`,
   10227: 1102, 200101, 2202 ×1; 2 s).
3. `DistributeRewards` (`AddRes` reason 24, `isGetBox = true`), `HandleRewardComplete` (`ResetUI`).
4. `PlayCompletionAnimations` → `RoomTimeLineManager.PlayRoomAnim(roomId, cb)`:
   - play `roomanimtimeline.sound` (10227: 1757 → sfx_deco_70027_all), BGM paused.
   - `RoomManager.StopEffect`, `ClearAllGraphic` (hide all nodes except isClear / notClearGraphic),
     `ShowAllOldItem` (re-show old items for nodes not isClear and not isHideOld, hide showNodes).
   - for i: at `showTimeLine[i]` s → `Room.GetItem(showRoomNode[i], playAnim=true, effect=false)` → stored item
     plays `first_confirm` (no sparkle). 10227: t=[0,.49,1.13,1.93,2.88,3.68,4.19,4.88,5.88,6.88,8] nodes
     [01,09,11,04,10,03,06,12,05,07,13] (clean nodes & RV tree not listed; they stay hidden/as-is).
     Special id 7899999 = `UpdateChildNodesStatus`.
   - wait `showTime` (9 s) → `ReceiveDetailNodes`, `PlayRoomEffect` (UI `Prefabs/Effects/vfx_Stars_001`,
     destroyed after 5 s) → wait 1.5 s → cb.
   - `StopRoomAnim` (skip) instantly sets every listed node's item.
5. `HandleRoomUnlock`: `GetNextRoomChapter` → story trigger → `UIUnlockRoomController.OpenUnlockRoomWindow
   (nextRoomId)` → `RoomManager.UnLockRoom(nextId)` (saves `StorageHome.unLockRoom`, opens UIRoomMap /
   `RoomMapModel.ShowRoomView`). Room order = `roomchapter.json` `roomIds` (9000 = coming-soon sentinel).

---------------------------------------------------------------------------------------------------
## 5. ASMR nodes (asmrLevel / asmrLevelB)

- Level used: `UIItemGroup.GetEffectiveAsmrLevel()` = `asmrLevelB > 0 && ABTestManager.IsAsmrNewPlay ?
  asmrLevelB : asmrLevel`. (Panel art always uses `asmrLevel`: `UIDecorationMain_RoomBG<asmrLevel>`.)
  For a port choose one group (A = asmrLevel 1..6, B = 7,8,3,4,5,6 for 10227).
- Panel: normal buy panel without style grid. Opening it already previews `items[0]` (e.g. `1ceng_04`) – isClear
  ASMR nodes have no items, so the dirt stays.
- Confirm (`onSelectionConfirmClick`, asmrLevel > 0): afford check first (no-money popup, nothing charged);
  then `UIManager.OpenHomeWindow(UIPopupMask, 1, cb, mainCamera)` (transition mask) → cb:
  `FlushGameManager.InitAsmrGame(level, onComplete)`. **Cost is charged only when the minigame completes**:
  `onComplete = OnNodeBuy` → full 4.1 flow (consume stars, grant reward, status 2, open children, bubbles), then
  after 0.5 s: isClear → `clean` animation on the old item (graffiti/sticker/fence vanish); else
  `ReplaceRoomNode` → new item (`_04`) `first_confirm` + sparkle + node sound, focus off, reward fly,
  room-complete check. (Sound 1723 resolves to `sfx_deco_70026_dasao`, which is NOT in Sound/Room10227 – only
  `sfx_deco_70027_dasao` is – so in 10227 it likely plays nothing (inferred); use 70027_dasao in the port.)
- 10227 node sounds (out/sound.json): 1753 water, 1754 lounge, 1425 pubu, 1833 10027_pooldeco, 1749 carbon,
  1752 sofa, 1755 randrail, 1832 10027_dongwu, 1850 shu; replay 1757 70027_all (prefix `sfx_deco_`).
  Abort/fail from the minigame: no callback → node stays status 1 (inferred).

---------------------------------------------------------------------------------------------------
## 6. Persistence and main deco UI

### 6.1 Save (`StorageHome`)
```
roomData: { [roomId]: StorageRoom { id, isFinish, isClean, isPlayAnim, isGetBox,
            roomNodes: { [nodeId]: StorageNode { id, status(0..4), selectId(itemId string), oneTimeChoice } } } }
unLockRoom[], roomChapterId, curRoomId, currency/res (102 stars etc.), exp/level
```
Write points: InitNodeStorage (create), SetData (selectId preview), Cancel (selectId ""), OnNodeBuy
(status, children), ReplaceRoomNode (selectId), RoomItemGraphic.OneTimeChoice, RewardBox (isGetBox).
`isFinish/isClean/isPlayAnim` are only touched by debug `SROptions` here.
Minimal port save: `{roomId, nodes:{id:{s,sel,once}}, gotBox, stars}`.

### 6.2 Main deco screen (`UIDecorationMain`, `Main_DecorationController`)
- `TopGroup/Slider` (670 px): fill = decoration rate, `Slider/Text` "NN%", `DecorationIcon/Text` +
  `Nodes/Text` = finished / total counts (`GetRoomDecorationCount`), story markers at `storyPos` (x =
  -310 + …), `Slider/Icon` = completion gift box (`RoomDecorationReward`; tap shows `rewardId` preview).
  `UpdateSliderA`: DOValue tween 1 s on each purchase.
- `TopGroup/CurrencyBarGroup3` star counter (`UpdateKeyText`, counts down 0.5 s on spend).
- `ScreenOrigin/` bubbles (2.3). `SelectUI` (bottom, 380 px tall, anchored bottom, slides in 0.3 s via
  `AnimControlManager` id 3; TopGroup id 4, 0.35 s): see section 3.
- Play button / merge entry belong to `UIHomeMainController` (out of scope) – hidden while the panel is open.
- Sounds: 200 bubble open, 202 item tap, 203 tile select, 28 reward fly, 39 room box.

---------------------------------------------------------------------------------------------------
## 7. Port checklist (HTML5 canvas, no merge)
1. Load BG + all item atlases/skeletons; world→screen = cover-fit 864×1720 design px, 100 px/unit, y up.
2. Build nodes from roomnode (roomId) + Base/OldFur/Offset/Anim; status from save (`isOpen` default).
3. Visible item: bought → selectId (isClear → none); else old (or none).
4. Render list = all renderer parts sorted by prefab sortingOrder (BG 0).
5. Bubbles at Offset anchors for status 1 (+ RV); icon iconResName; glow if affordable.
6. Tap bubble/item → panel: tiles `<suffix>_2d_256`, preview on select, camera focus 0.5 s.
7. Confirm → (ASMR minigame →) spend → status/children → 0.5 s → 0.5 s → sound + `first_confirm`/`clean`
   (or `oneTimeClean`) → sparkle 1.5 s → focus off → +rewards → completion check → 9 s timeline replay → next room.
