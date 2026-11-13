# Happy Merge Home: ASMR — Home MAP + room progression spec (for HTML5 canvas rebuild)

Sources: il2/UIRoomMapController.il, RoomMapItem.il, Gameplay.UI.Room.RoomMap.*.il, RoomManager.il,
UIUnlockRoomController.il, UIChooseRoomController.il, ChoseRoomItem.il, ABTest.ABTestManager (re-disassembled),
TableConfigManage(+nested), SceneFsmHome::Enter, UIOpeningStoryController, Fsm.RoomRewardBoxLogic (all.il),
pf/UIRoomMap*.json, out/roommap.json, room.json, roomchapter.json, out/avatar.json (extracted now from
`Assets/Export/Configs/Global/avatar.json`).
Coordinates: Unity UI (y up) unless said "map px" = origin top-left of the 768 x 4714 map, y down.
Extracted art (cut from atlases with tools/exatlas.py): `scratchpad/work/mapart/*.png`; a reconstruction of
the whole map from the prefab is `scratchpad/work/map_full.png` (768x4714) — it matches the game.

---------------------------------------------------------------------------------------------------
## 0. Key facts (TL;DR)
- Window `UIRoomMap` (prefab `Assets/Export/Prefabs/Home/UIRoomMap.prefab`) = full-screen overlay
  (root Image black, alpha 0.6) containing ONE vertical ScrollRect whose content is a single
  768 x 4714 painted town (`MapBg`). No zoom, no horizontal scroll.
- Every house is a pre-placed child of MapBg named like the roommap `node` value. `UIRoomMapController::
  InitializeRoomItems` does `transform.Find("Root/Scroll View/Viewport/Content/MapBg/" + row.node)` and
  adds a `RoomMapItem` to it for every roommap row of the ACTIVE chapter group.
- One roommap row = one house. `roomIds` has 1 or 2 rooms (2 = house with two interiors; the two small
  round "1"/"2" node buttons sit at nodeXOffset/nodeYOffset). Progression goes bottom -> top of the map.
- Default chapter for new players = **1006** (AB "FIRST_ROOM_ASMR" is hard-coded ON). First rooms:
  10227 (Pool Villa) -> 10002 (Rachel's House) -> house {70006,70037} -> ...
- Bubble avatar = NPC head `Head_N` from avatar table (newHeadIcon, since `IsABTestNewRole()` returns true);
  current house shows the PLAYER head (avatar id 19 -> `Head_19`) with a ring progress "NN%".
- Room % = done nodes / countable nodes; house % = average of its rooms. Room complete at 100 %.
  Completion -> reward box -> UIUnlockRoom popup -> next room. A new house is revealed on the map with a
  finish effect on the old house + unlock animation on the new one.

---------------------------------------------------------------------------------------------------
## 1. Map layout

### 1.1 Hierarchy (pf/UIRoomMap.json)
```
UIRoomMap (stretch, Image black a=0.6)
 Root
  Scroll View  ScrollRect: vertical only, MovementType=Clamped(2), inertia on, decelerationRate 0.135,
               scrollSensitivity 1, elasticity 0.1 (unused when clamped)
   Viewport    stretch, pivot (0,1), SoftMask
    Content    anchors top-stretch, pivot (0,1); VerticalLayoutGroup childAlignment=UpperCenter,
               ContentSizeFitter vertical=Preferred  -> content height = 4714
     MapBg     768 x 4714, pivot (0.5,1)  (centered horizontally in the viewport)
      BG*, Decorate*, <houses...>  (all anchored top-center of MapBg, pivot (0.5,1) except BG1/BG5/BG6)
   Viewport/ReturnBtn  150x150, anchor (0.5,-0.04), pos (-262,206): bottom-left "back" button, icon Home12
```
`UIRoomMap_Pad.prefab` is the tablet variant (not analysed). Reference width of the map art is 768 px:
in HTML scale everything by `canvasWidth/768` (inferred; the game's CanvasScaler was not checked).

### 1.2 Background layers (draw in this order, map px, sprite = UIMergeMap_*)
| child | sprite | center (x,y) | size |
|---|---|---|---|
| BG1 | UIMergeMap_BG1 | 384,2042 | 768x1024 |
| BG5 | UIMergeMap_BG6 | 385,1447 | 768x807 |
| BG6 | UIMergeMap_BG7 | 385,684 | 768x1368 |
| BG2 | UIMergeMap_BG2 | 384,3065 | 768x1024 |
| BG3 | UIMergeMap_BG3 | 385,3706 | 768x258 |
| BG4 | UIMergeMap_BG5 | 385,4276 | 768x883 |
| Decorate1 | UIMergeMap_DecorateBG1 | 432,3079 | 141x146 |
| Decorate5 | UIMergeMap_LampBG1 | 372,1579 | 184x204 (drawn between houses, prefab order) |
| Decorate2/3/4 | DecorateBG2/3/4 | 282,3675 / 700,1631 / 126,4308 | 540x203 / 139x71 / 25x33 (after BrownBigRoom1) |
(`UIMergeMap_BG4` is NOT a map layer; it is the "Coming soon" label plate.)

### 1.3 Houses (sibling order = draw order; later ones overlap earlier ones)
Each house GameObject = Button (raycast rect = its RectTransform) + child `RoomNormalBG` Image
(preserveAspect=1, anchored at house rect center + offset) + disabled `RoomDislBG`. "center" = house rect
center in map px; "img" = RoomNormalBG offset (Unity y-up) and size (sprite is aspect-fitted into it).
```
node              center      rect     img(dx,dy,w,h)
PinkBigRoom1      550, 311    508x391  0,0,437x361
BlueBigRoom2      205, 662    508x391  0,0,408x340
PurpleBigRoom3    596, 609    508x391  0,0,347x419
OrangeBigRoom2    357,1045    508x391  0,0,712x507
GreenBigRoom2     255,1397    508x391  0,0,508x391
OrangeBigRoom1    564,1278    410x364  0,0,410x364
RedSmallRoom1     168,1634    335x298  0,0,335x298
PurpleSmallRoom1  590,1518    359x255  0,0,359x255
(Decorate5 lamp)
BlueSmallRoom1    541,1749    298x250  0,0,322x283
PurpleBigRoom1    218,1898    433x337  29,0,492x398
GreenSmallRoom1   602,2006    286x310  0,0,339x312
YellowSmallRoom1  309,2154    229x219  0,0,229x219
RedBigRoom1       583,2295    368x269  -33,0,435x269
OrangeSmallRoom1  142,2344    255x253  0,0,277x349
GreenBigRoom1     528,2595    442x330  0,0,481x381
BrownSmallRoom1   163,2628    326x205  0,-42,326x302
BlueBigRoom1      219,2887    418x293  0,0,418x293
BrownSmallRoom2   631,2888    275x289  0,0,275x289
BlueSmallRoom2    643,3120    250x180  0,0,250x180
RedBigRoom2       362,3266    348x298  0,0,470x362
PinkSmallRoom1     52,3241    105x209  0,0,105x209   (decor only, no roommap row)
PurpleBigRoom2    668,3395    203x224  -16,14,235x258
BrownSmallRoom3   146,3478    291x230  0,0,291x230
BrownBigRoom1     527,3612    480x219  -20,32,523x289  (+ CarSpine, see 1.6)
(Decorate2, Decorate3, Decorate4)
RedsmailRoom1     144,3990    289x290  2,0,289x290   (decor only, no roommap row)
ChristmasRoom     550,4161    434x416  -34,26,505x498 (activity room 78903)
```
Formula used: house anchoredPos (ax,ay), pivot (0.5,1) -> center = (384+ax, -ay + h/2).

### 1.4 roommap rows -> houses
`TableConfigManage::GetRoomMap` = all rows with `group == StorageHome.RoomChapterId` (fallback: group 1001).
Groups 1001..1006 are near-identical (24 rows each); only row 1 roomId (first room) / row 2 / row 9 and
some bubbleOffsets differ. Group 1006 (default) with derived positions (map px):
```
row  node              roomIds          newHead bubble-center   node buttons (room0, room1)
6001 BrownBigRoom1     [10227]          20      447,3462        -
6002 BrownSmallRoom3   [10002]          22      116,3328        -
6003 RedBigRoom2       [70006,70037]    23      362,3116        (258,3279) (428,3279)
6004 PurpleBigRoom2    [70003,70004]    24      687,3283        (600,3409) (732,3409)
6005 BlueSmallRoom2    [70015,70009]    25      660,3018        (575,3134) (707,3134)
6006 BrownSmallRoom2   [70030,70014]    26      637,2780        (575,2913) (715,2875)
6007 BlueBigRoom1      [70010,70013]    28      259,2737        (159,2875) (326,2925)
6008 BrownSmallRoom1   [70029,70031]    29      168,2491        (81,2643)  (232,2612)
6009 GreenBigRoom1     [10026,70018]    30      514,2434        (446,2620) (576,2663)
6010 OrangeSmallRoom1  [70024,70012]    31      137,2237        (87,2378)  (240,2378)
6011 RedBigRoom1       [70035,70007]    33      568,2145        (528,2329) (681,2329)
6012 YellowSmallRoom1  [70001,70011]    34      294,2004        (307,2154) (447,2154)
6013 GreenSmallRoom1   [70032,70020]    7       587,1856        (547,2040) (700,2040)
6014 PurpleBigRoom1    [70019,70023]    6       250,1719        (170,1892) (365,1892)
6015 BlueSmallRoom1    [70041,70016]    4       541,1599        (487,1729) (629,1729)
6016 RedSmallRoom1     [70044,70043]    31      154,1484        (72,1610)  (230,1610)
6017 PurpleSmallRoom1  [70017,70045]    25      575,1368        (493,1494) (652,1494)
6018 GreenBigRoom2     [70070,70042]    26      240,1247        (154,1362) (331,1362)
6019 OrangeBigRoom1    [70048,70051]    29      549,1128        (463,1243) (640,1243)
6020 OrangeBigRoom2    [70050,70052]    30      342,895         (256,1010) (433,1010)
6021 PurpleBigRoom3    [70028,70033]    31      580,459         (494,574)  (672,574)
6022 BlueBigRoom2      [9000]           -       190,512         - (9000 isComingSoon)
6023 PinkBigRoom1      (none)           -       -               - (state None, grayed)
601  ChristmasRoom     [78903]          15      535,4011        - (isActivityRoom)
```
- Bubble position (`RoomMapItem::InitBubble`): bubble is parented to the house; because the house pivot.y==1
  the code subtracts h/2, so effectively **bubble center = house rect center + (bubbleOffset.x, bubbleOffset.y)**
  (Unity y-up => map px: `(cx+bx, cy-by)`), z=-1, scale 1.
- Node buttons (`RoomMapItem::InitNode`, only when roomIds.length>1): same rule, center = house center +
  (nodeXOffset[i], nodeYOffset[i]) (y-up). Single-room rows' nodeXOffset ([1,2]) is ignored.
- Houses in the prefab without a row in the active group (PinkSmallRoom1, RedsmailRoom1) are plain art:
  no RoomMapItem, no bubble, normal colour, tap does nothing.

### 1.5 Scroll & initial position
- Opening: `OnOpenWindow(args)` -> `InitializeRoomIds` (args[0]=unLockRoomID, args[1]=finishRoomID, default -1)
  -> `InitializeRoomItems` -> `ScrollToLastUnlockedRoom` = `ScrollToRoom(RoomManager.GetLastUnLockRoomId())`.
- `ScrollToRoom(id)`: idx = index of the row containing id (rows in table order 0..N).
  H = content height (4714), V = viewport height, `scrollTop` = distance of viewport top from map top.
  - idx <= 3: `scrollTop = (-row0.localPos.y) - V + 307` where row0 = first row (BrownBigRoom1, localPos.y
    = -3502) -> `scrollTop = 3809 - V` (viewport bottom 307 px below the top edge of the first house).
  - idx > 3: `scrollTop = houseTop - 0.28571*V` (house's top edge placed at 2/7 of the screen height).
  - verticalNormalizedPosition = clamp01(1 - scrollTop/(H-V)) i.e. clamp scrollTop to [0, H-V].
- No pinch/zoom anywhere in the controller. Drag = vertical scroll with inertia, clamped.

### 1.6 Car (first-time only)
`Root/Scroll View/Viewport/Content/MapBg/BrownBigRoom1/CarSpine`: Spine `car_05` (anim "walk_4", loop),
local pos (54,-154) inside BrownBigRoom1, scale 0.08; hidden in `PrivateAwake`. `PlayCarAni` (called from
`UIOpeningStoryController.OnComplete` after the opening story) disables input, plays Animator state
"appear", then hides the car, re-enables input, `SetAllRoomItemsVisible(true,true)` and fires guide 16
(finger on the first house bubble; target registered in InitBubble with key roomIds[0]).
Optional for the rebuild.

---------------------------------------------------------------------------------------------------
## 2. Bubbles

### 2.1 State machine (`RoomMapItem::UpdateBubbleState`, enum BubbleState in declaration order)
`None=0, Normal=1, NeedDownload=2, Waiting=3, Finished=4, Decorating=5, Coming=6, WaitUnLock=7, Locked=8`
```
if roomIds empty                       -> None (0)
else if IsWaitingForResource()          -> IsWaitingForUnlock ? WaitUnLock(7) : NeedDownload(2)
else if any room isComingSoon (room[0]) -> Coming (6)
else if no room unlocked                -> Locked (8)
else (UpdateUnlockedState):
     IsWaitingForUnlock                  -> WaitUnLock (7)   (house contains the unLockRoomID passed to the map)
     roomIds contains GetLastUnLockRoomId -> Decorating (5)  (= the current house)
     all rooms 100 %  (RoomMapModel.IsFinish) -> Finished (4)
     else                                -> Normal (1)       (unlocked, older, unfinished; e.g. the activity room)
```
IsWaitingForResource = (house is unlocked OR contains the next room) AND not coming-soon AND resources not
downloaded. For the HTML port treat all resources as ready => states 2/3 never happen (rooms whose art is
missing can be shown as Coming soon — design choice).

### 2.2 What each state draws (`RoomMapItem::SetType` -> `UIRoomMapBubble::SetBubbleState`)
- House sprite gets material `Materials/UIMaterials/Gray.mat` (greyscale) ONLY for None(0) and Coming(6).
  Locked houses are drawn in full colour.
- 0 None / 1 Normal: no bubble.
- 8 Locked: `BubbleGroup` with NPC avatar + `Lock` icon (Finish hidden).
- 7 WaitUnLock: same as Locked (lock), progress hidden; then plays the unlock animation (2.5).
- 4 Finished: `BubbleGroup` with NPC avatar + `Finish` check icon ("Right").
- 5 Decorating: `UIRoomMapProgress` (player avatar + ring fill + "NN%"); also shows the house's node buttons.
- 6 Coming: `UIRoomMapComing` label plate "Coming Soon..." (key UI_Map_ComingSoon, color #676573, size ~15).
- 2 NeedDownload / 3 Waiting: DownloadGroup / WaitingGroup ("Tap to Download") — skip in HTML.

### 2.3 Bubble geometry (relative to bubble center, Unity y-up; prefab UIRoomMapBubble, root 124x140)
BubbleGroup (Locked/Finished):
- `Avatar` frame area 124x140 centered on bubble center (pivot bottom at y=-70).
  - head: `HeadIcon` 112x112 at (-1,+8), clipped by mask shape `UIRoomMap_MapPubbleBG1` (122x130 white
    teardrop pin, mask only, alpha 0) — i.e. the avatar is masked into the pin's round head.
  - overlay frame `UIRoomMap_MapPubbleBG4_1` (124x139, white ring pin).
  - background `UIRoomMap_MapPubbleBG1` drawn under the head (white pin, 124x140).
- `Lock/Icon` = `Lock` 33x42 at (0,-30) (bottom of the circle). `Finish/Icon` = `Right` 70x70 at (4,-33).
UIRoomMapProgress (Decorating): rect 159x201 anchored to bubble bottom (y=-70), pivot bottom ->
its center = bubble center + (0,+30.5). Children relative to that center:
- `BG1` = `UIRoomMap_MapPubbleBG5` 201x240 (white pin with yellow glow) at (0,0).
- `Avatar` at (0,+19.2): mask 124x140 (BG1 shape), `HeadIcon` 116x117 at (0,+6) scaled 1.1 = PLAYER head;
  `Avatar/BG1` = `UIRoomMap_MapPubbleBG2` 159x201 white ring pin at (0,-19.2) (i.e. progress center).
- `ProgressBG` = `UIRoomMap_MapPubbleBG3` 159x201 (BLUE ring pin) Image type Filled, FillMethod Vertical,
  origin Bottom, fillAmount = progress -> the white ring turns blue from the bottom up.
- `Text` at (0,-45) 73x36, white TMP, `"{floor(progress*100)}%"` (`UIRoomMapProgress::UpdateProgressUI`).
Node button (prefab UIRoomMapNode): 97x96 under `Root` (Animator): `BG1`=UIRoomMapNode_BG1 (house "1") shown
when index 0 and unlocked, `BG2`=UIRoomMapNode_BG2 ("2") when index 1 and unlocked, `Lock`=UIRoomMapNode_BG3
when not unlocked (`RoomMapNode::Init`). Tap: if unlocked -> `ShowRoomView(roomId)`.

### 2.4 Avatars (`RoomMapItem::InitBubble`, `UIRoomMapProgress::SetAvatar`)
- NPC: `GlobalConfigManager.GetTableAvatar(IsABTestNewRole ? newHeadIcon : headIcon)`; IsABTestNewRole()
  is hard-coded `return true` -> use **newHeadIcon**. Sprite = `headIconAtlas/headIconName` = CoomonAtlas
  `Head_N`. avatar.json: id 0..15 -> Head_(id+1); id >= 17 -> Head_id (no id 16). So newHeadIcon 20 ->
  Head_20, 22->Head_22, 7->Head_8, 6->Head_7, 4->Head_5, 15->Head_16.
- Player (progress bubble): avatar id 19 (new role) -> `Head_19` (id 0 -> Head_1 if AB off).
- Rows without headIcon (9000, PinkBigRoom1) get no avatar.

### 2.5 Progress formula
`RoomManager::GetRoomDecorationRate(roomId, out done, out rv)` (0 if room locked or no storage):
countable = roomnode rows of the room that are NOT child nodes (TableConfigManage.GetChildNodeConfigs),
have `nodeBehaviour <= 0` and `isRvGet == false`; done = storage nodes with `Status >= 2` that are not RV
nodes; rate = done / countable. `RoomMapModel::GetProgress(roomIds)` = mean of the rates of the house's
rooms (a locked 2nd room counts 0, so a two-room house shows 50 % when room 1 is done).
`IsFinish(roomIds)` = every room `(int)(rate*100) >= 100`. `RoomManager::IsFinish(id)` = rate >= 1.
Shown text: `floor(clamp01(p)*100) + "%"`, no animation on map open (`SetProgressImmediate`).

### 2.6 Animations / sounds
- Unlock (`UIRoomMapBubble::PlayUnlockAnimation`): input disabled, after 0.5 s `sfx_map_HouseUnlock`,
  BubbleGroup Animator "appear", then state 5 + UIRoomMapProgress Animator "appear", then StorySubSystem
  trigger (type 2, key = roommap row id) and guide 16; finally unlock/finish ids reset to -1 and state
  recomputed (`<TryPlayUnlockEffect>b__47_0`).
- Finish (`RoomMapItem::PlayFinishEffect`, on the house containing finishRoomID if IsFinish): input off,
  `sfx_map_HouseComplete`, instantiate `Prefabs/Effects/fx_finish` at house center, destroyed after 3 s,
  then `PlayAutoDownload` -> new house unlock sequence.
- Nodes: "appear" / "disappear" Animator states; after appear, the node of the current room
  (== GetLastUnLockRoomId) plays "hint" after the appear clip length (`PlayHintAfterDelay`).
  Clip controllers: `Prefabs/Home/Animations/UIRoomMapNode.controller`, `UIRoomMapProgress.controller`,
  `UIRoomMapBubble_hint.controller` (timings not decoded; use ~0.3 s scale-pop, inferred).

### 2.7 Tap handling (`RoomMapItem::HandleClick`, also bubble button)
```
roomIds null or state Coming      -> nothing
state NeedDownload                -> download (skip)
state Locked                      -> toast "Complete the previous house to unlock" (Tip_Map_HouseLocked)
roomIds.length > 1:
   Finished   -> controller.HideAllFinishedNode() (hides nodes of other finished houses) and show this
                 house's two node buttons (player then taps "1" or "2")
   Decorating -> ShowRoomView(GetLastUnLockRoomId())
   other      -> nothing (Normal/WaitUnLock two-room houses ignore house taps)
single room:
   Decorating -> ShowRoomView(GetLastUnLockRoomId()) else ShowRoomView(roomIds[0])
```
`RoomMapModel::ShowRoomView(roomId)`: finishes guides 16/913; if roomId == CurRoomId -> close map
(+ room story trigger); else hide room bubbles, `RoomManager.EnterRoom(roomId)` and on load close the map.
ReturnBtn -> `AnimCloseWindow` (back to the current room).

---------------------------------------------------------------------------------------------------
## 3. Progression

### 3.1 Storage / "current room"
StorageHome: `RoomChapterId`, `CurRoomId`, `UnLockRoom` (dictionary used as a set), `RoomData[roomId]`
(StorageRoom: id, roomNodes{id->Status}, isFinish, isClean, isPlayAnim, isGetBox).
- `UpdateRoomChapterStorage`: RoomChapterId<=0 -> 1001; curRoomChapter = roomchapter row; if CurRoomId<=0:
  CurRoomId = chapter.roomIds[0] and unlock it; ALSO always unlock chapter.activityRoomIds[0] (78903 — so the
  Christmas house is unlocked from the start and shows as Normal/no bubble).
- `GetLastUnLockRoomId` = the LAST room in chapter.roomIds order that is in UnLockRoom ("the frontier").
- `CurRoomId` = room currently loaded (can be an older room the player revisited).
  `GetLastRoomId` = lastUnlock if >0 and != cur, else cur.
- `GetNextRoomChapter(id)` = first room after id in chapter.roomIds whose TableRoom exists and
  `isComingSoon == false` (so after 70033 nothing: 9000 is coming soon -> end of content).

### 3.2 Completing a room
A room is complete when GetRoomDecorationRate == 1 (all countable nodes Status>=2; inside-room logic is the
other spec). Then `Fsm.RoomRewardBoxLogic`: reward box -> `DistributeRewards` sets `IsGetBox=true` and adds
`rewardId[i] x rewardNum[i]` (resource ids, e.g. 1102/1101/1201/2202/200101; 9000 & 78903 give 101x500,
201x50 — meanings not decoded). `ValidateRoomState`: if rate==100% and IsGetBox -> `CanUnLockNewRoom(true)`.
`TableRoom.storyPos` (e.g. [2,5,8,11] for 10227) = story marker positions on the in-room progress bar
(`UIProgress::InitStoryNodes`: x = -310 + storyPos[i]*620/totalNodes) — inside-room concern.
Home HUD bubble (`BubbleData::UpdateBubble` type 3) shows the next room name when CanUnLockNewRoom(false)>0.

### 3.3 Unlocking the next room
`RoomManager::CanUnLockNewRoom(open)`: last = GetLastUnLockRoomId; requires RoomData[last] exists and
rate*100 >= 100; next = GetNextRoomChapter(last); if open -> `UIUnlockRoomController.OpenUnlockRoomWindow(next)`
(IsABTestNewWorld() == false -> opens `UIPopupUnlockRoom` with next).
UIUnlockRoom popup (pf/UIUnlockRoom.json): title, card `Common_UI_BG_1` with `Icon` = RoomAtlas
`TableRoom.mapImgComplete` (e.g. ui_home_chooseroom_icon_normal_02) 649x395, name plate `Common_UI_BG_26`
with localized `roomName`, green button `Common_UI_Button_green_1` -> `RoomManager.UnLockRoom(next)` + close.
`RoomManager::UnLockRoom(next)`:
- If `!RoomMapModel.IsUnlockNewMapItem(next)` (next is NOT the first room of its house, i.e. 2nd room of the
  same two-room house) and resources ready: CurRoomId = next, `ShowRoomView(next)` straight into the room,
  then on load: unlock effect, SaveUnLockStorageRoom(next), sound 35, close UIChooseRoom. No map.
- Else (next opens a NEW house): (network check) `SaveUnLockStorageRoom(next)` then open `UIRoomMap` with
  args `[next, curRoomId]` -> map: fx_finish on the old house (finishRoomID), then the new house (contains
  unLockRoomID) goes WaitUnLock -> unlock animation -> Decorating. CurRoomId is not changed; the player taps
  the new house -> ShowRoomView(lastUnlock) -> EnterRoom.

### 3.4 UIChooseRoom (legacy list)
`UIChooseRoomController` = vertical list (LoopScrollView) of all chapter rooms (bottom = first room) plus a
second tab with activity rooms; each `ChoseRoomItem` shows `mapImgComplete` and one of 4 groups
(groupType 0 unlocked/in progress, 1 finished, 2 locked, 3 coming soon); tap -> if room == CurRoomId close,
else `RoomManager.UnLockRoom(roomId)` (i.e. revisit/enter). OnOpenWindow also calls CanUnLockNewRoom(true).
In this build it is only opened from `Home_ThemeDecoration` (activity); the home "rooms" button
(`UIHomeMainController::OnButtonChooseRoom`) opens **UIRoomMap** instead. => Not needed for the rebuild;
"revisit a finished room" is done on the map (tap finished house / its node).

### 3.5 First session flow
`SceneFsmHome::Enter`: if `!StorageHome.IsFirstLogin` (flag false = brand-new player, inferred) -> open
UIRoomMap and UIOpeningStory on top; story end -> `SetAllRoomItemsVisible(false,false)` -> `PlayCarAni`
-> bubbles appear -> guide 16 on house 1 -> tap -> enter 10227. Otherwise normal home in CurRoomId.
`RoomMapModel::WriteOldUserRoom/IsOldUserLimit` only suppress stories for migrated users (ignore).

---------------------------------------------------------------------------------------------------
## 4. Active chapter & AB test
- `RoomManager.curCharpterId` defaults 1001; actual = `StorageHome.RoomChapterId` (`UpdateRoomChapterStorage`).
- `RoomManager::FirstRoomABAdapt` (called from UILoginController.OnLoginResult) runs only for new players
  (returns if IsFirstLogin): `EnsureABTestConfigExists`: if AbTestConfig lacks key "FIRST_ROOM_ASMR", store
  "1" if `ABTestManager.IsOpenFirstRoomAsmr(1)` else "0"; `SyncABTestToCommonStorage` mirrors it;
  `ApplyRoomChapterBasedOnABTest`: "1" -> RoomChapterId = **1006**, else 1004; CurRoomId = -1 then
  UpdateRoomChapterStorage (CurRoomId = first room, unlock it + 78903).
- `ABTestManager::IsOpenFirstRoomAsmr` is literally `return true` => every new install gets **1006**
  (10227 Pool Villa -> 10002 Rachel's House -> 70006/70037 ...). 1004 = control (10127 first).
  1001-1003/1005 = legacy saves only. Fields RoomChapterIdA/B are unused.
- Map rows follow the chapter: group == RoomChapterId (6001..6023 + 601 for 1006).

---------------------------------------------------------------------------------------------------
## 5. Art assets (container paths; all present in the APK, already cut to work/mapart/*.png)
Prefabs/config: `Assets/Export/Prefabs/Home/UIRoomMap.prefab`, `UIRoomMapBubble.prefab`, `UIRoomMapNode.prefab`,
`UIUnlockRoom.prefab`, `Assets/Export/Prefabs/Effects/fx_finish.prefab`,
`Assets/Export/Configs/Room/roommap.json`, `room.json`, `roomchapter.json`, `Assets/Export/Configs/Global/avatar.json`,
`Assets/Export/Materials/UIMaterials/Gray.mat` (use canvas `filter: grayscale(1)`).
Map art `Assets/Export/Textures/UI/UIMergeMap/`:
- Backgrounds: `UIMergeMap_BG1.png BG2 BG3 BG5 BG6 BG7` (BG4 = coming-soon plate)
- Decor: `UIMergeMap_DecorateBG1..4.png`, `UIMergeMap_LampBG1.png`
- Houses: `UIMergeMap_{BlueBigRoom1,BlueBigRoom2,BlueSmallRoom1,BlueSmallRoom2,BrownBigRoom1,BrownSmallRoom1,
  BrownSmallRoom2,BrownSmallRoom3,ChristmasRoom,GreenBigRoom1,GreenBigRoom2,GreenSmallRoom1,OrangeBigRoom1,
  OrangeBigRoom2,OrangeSmallRoom1,PinkBigRoom1,PinkSmallRoom1,PurpleBigRoom1,PurpleBigRoom2,PurpleBigRoom3,
  PurpleSmallRoom1,RedBigRoom1,RedBigRoom2,RedSmallRoom1,RedsmailRoom1,YellowSmallRoom1}.png`
- Bubble: `UIRoomMap_MapPubbleBG1.png` (white pin / mask), `BG2` (white ring pin), `BG3` (blue ring pin, fill),
  `BG4_1` (thin white ring frame), `BG5` (glow pin), `UIRoomMap_Icon1.png` (hourglass), `Icon2` (download)
- Nodes: `UIRoomMapNode_BG1.png` ("1"), `BG2` ("2"), `BG3` (lock)
Common: `Assets/Export/Textures/UI/Common/Lock.png`, `Right.png`; back button `Textures/UI/Home/Home12.png`;
heads `Assets/Export/Textures/UI/IconAll/Head_1..34.png` (needed for 1006: Head_19 player, Head_20,22..26,28..31,
33,34,8,7,5,16).
Unlock popup: RoomAtlas `ui_home_chooseroom_icon_normal_NN` = `Assets/Export/Textures/Room/ui_home_chooseroom_icon_normal_NN.png`
(02,06,37,03,04,15,09,30,14,10,13,29,31,26,18,24,12,35,07,01,11,32,20,19,23,41,16,44,43,17,45,70,42,48,51,50,52,28,33,27,21;
note 26 is used by 10026), plus `Common_UI_BG_1`, `Common_UI_BG_26`, `Common_UI_Button_green_1` (CoomonAtlas).
Optional: Spine `Assets/Export/Spine/Home/car_05.{skel.bytes,atlas.txt,png}`; sounds `sfx_map_HouseUnlock`,
`sfx_map_HouseComplete`. Font: LocaleFont_En SDF (any rounded bold web font).
Strings (locale_en): UI_Map_ComingSoon "Coming Soon...", Tip_Map_HouseLocked "Complete the previous house to
unlock", UI_Map_Waiting "Tap to Download", room names e.g. UI_map_name27 "Pool Villa", UI_map_name26
"Rachel's House".

---------------------------------------------------------------------------------------------------
## 6. HTML port recipe (inferred simplification)
1. Load group 1006 rows; draw BG layers, then all houses in prefab order (grayscale for None/Coming).
2. Per row compute state with 2.1 (resources always ready); draw bubbles after all houses.
3. Scroll: one vertical offset clamped to [0, 4714*s - viewH], drag + inertia; on open apply 1.5.
4. Tap hit-test: node buttons (48 px radius) first, then bubbles, then house rects (top-most first).
5. On room complete: popup (3.3) -> same house 2nd room: enter directly; new house: open map with
   finish effect on old house + unlock pop on the new house, then the player taps it.
