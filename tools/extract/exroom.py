# Export one room (RoomRes/<id>) into compact JSON + list of sprites/spines/sounds.
# usage: exroom.py <scratch> <roomId> <outdir>
import json, os, sys, math, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dumpprefab as D
from rawtext import raw_text
import UnityPy

S, RID, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
idx = D.idx
pre = f'Assets/Export/RoomRes/{RID}/'
conts = {k: (b, t) for b, v in idx.items() for k, t in v.items() if k.startswith(pre)}


def r2(v):
    return round(v, 3)


def ref(c, key):
    s = c.get(key)
    if s and isinstance(s, dict) and s.get('ref') and s['ref'].get('name'):
        return s['ref']['name']
    return None


sprites, spines = set(), set()


def conv(n):
    o = {'n': n['name']}
    if not n['active']:
        o['off'] = 1
    tr = n.get('tr') or {}
    p = tr.get('m_LocalPosition') or {'x': 0, 'y': 0}
    if tr.get('_type') == 'RectTransform' and tr.get('m_AnchoredPosition'):
        p = tr['m_AnchoredPosition']
    o['t'] = [r2(p['x'] * 100), r2(p['y'] * 100)]
    sc = tr.get('m_LocalScale', {'x': 1, 'y': 1})
    if abs(sc['x'] - 1) > 1e-4 or abs(sc['y'] - 1) > 1e-4:
        o['s'] = [r2(sc['x']), r2(sc['y'])]
    q = tr.get('m_LocalRotation', {'z': 0, 'w': 1})
    rot = math.degrees(2 * math.atan2(q.get('z', 0), q.get('w', 1)))
    if abs(rot) > 0.01:
        o['rot'] = r2(rot)
    for c in n['comps']:
        ty = c['_type']
        if ty == 'SpriteRenderer':
            sp = ref(c, 'm_Sprite')
            if sp:
                sprites.add(sp)
            col = c.get('m_Color') or {}
            o['sr'] = {'sp': sp, 'ord': c.get('m_SortingOrder', 0), 'lay': c.get('m_SortingLayer', 0), 'en': 1 if c.get('m_Enabled', 1) else 0}
            if c.get('m_FlipX'):
                o['sr']['fx'] = 1
            if c.get('m_FlipY'):
                o['sr']['fy'] = 1
            if col and (col.get('r'), col.get('g'), col.get('b'), col.get('a')) != (1, 1, 1, 1):
                o['sr']['col'] = [r2(col['r']), r2(col['g']), r2(col['b']), r2(col['a'])]
            mats = [m['ref']['name'] for m in c.get('m_Materials', []) if m and m.get('ref')]
            if mats and mats[0] != 'Sprites-Default':
                o['sr']['mat'] = mats[0]
        elif ty == 'MeshRenderer':
            o['mr'] = {'ord': c.get('m_SortingOrder', 0), 'lay': c.get('m_SortingLayer', 0), 'en': 1 if c.get('m_Enabled', 1) else 0}
        elif ty in ('SkeletonAnimation', 'SkeletonMecanim'):
            sd = (ref(c, 'skeletonDataAsset') or '').replace('_SkeletonData', '')
            spines.add(sd)
            o['sk'] = {'d': sd, 'a': c.get('_animationName') or '', 'l': c.get('loop', 0), 'skin': c.get('initialSkinName') or '', 'sep': c.get('separatorSlotNames') or [], 'ts': c.get('timeScale', 1)}
        elif ty == 'SkeletonPartsRenderer':
            o['part'] = 1
        elif ty == 'SkeletonRendererCustomMaterials':
            mul = [x['slotName'] for x in c.get('customSlotMaterials', []) if x.get('material') and x['material'].get('ref') and 'Multiply' in (x['material']['ref'].get('name') or '')]
            add = [x['slotName'] for x in c.get('customSlotMaterials', []) if x.get('material') and x['material'].get('ref') and re.search('Additive|Screen', x['material']['ref'].get('name') or '')]
            if mul:
                o['mul'] = mul
            if add:
                o['add'] = add
        elif ty == 'PolygonCollider2D':
            pts = c.get('m_Points', {}).get('m_Paths') if isinstance(c.get('m_Points'), dict) else None
            off = c.get('m_Offset', {'x': 0, 'y': 0})
            if pts:
                o['poly'] = [[[r2((pt['x'] + off['x']) * 100), r2((pt['y'] + off['y']) * 100)] for pt in path] for path in pts]
        elif ty == 'BoxCollider2D':
            sz, off = c.get('m_Size'), c.get('m_Offset', {'x': 0, 'y': 0})
            if sz:
                o['box'] = [r2(off['x'] * 100), r2(off['y'] * 100), r2(sz['x'] * 100), r2(sz['y'] * 100)]
        elif ty == 'Animator':
            ctl = ref(c, 'm_Controller')
            if ctl:
                o['anim'] = ctl
        elif ty in ('ParticleSystem',):
            o['ps'] = 1
        elif ty == 'SpineAnimationManager':
            o['sam'] = 1
    ch = [conv(x) for x in n['children']]
    if ch:
        o['c'] = ch
    return o


result = {'id': RID, 'items': {}, 'cfg': {}}
# configs
for k, (b, t) in conts.items():
    if '/Config/' in k and t == 'TextAsset':
        e = UnityPy.load(os.path.join(S, 'dec', b))
        nm = os.path.basename(k).replace('_royalx.json', '')
        result['cfg'][nm] = json.loads(raw_text(e.container[k].deref()).decode('utf-8'))
# prefabs
prefabs = [k for k, (b, t) in conts.items() if t == 'GameObject' and '/Prefabs/' in k]
for k in sorted(prefabs):
    b = conts[k][0]
    D.ENV = D.load_env(b)
    root = D.ENV.container[k].deref()
    tree = D.dump_go(root)
    name = os.path.basename(k)[:-7]
    result['items'][name] = conv(tree)
# spine files map: skeleton data name -> files
spfiles = {}
for k, (b, t) in conts.items():
    if '/Spine/' in k and t in ('TextAsset', 'Texture2D'):
        spfiles.setdefault(os.path.dirname(k), []).append((k, t, b))
result['spineDirs'] = {d: [os.path.basename(x[0]) for x in v] for d, v in spfiles.items()}
result['sounds'] = [os.path.basename(k) for k, (b, t) in conts.items() if t == 'AudioClip']
json.dump(result, open(os.path.join(OUT, 'room.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
open(os.path.join(OUT, 'sprites.txt'), 'w', encoding='utf-8').write('\n'.join(sorted(sprites)))
print(RID, 'items', len(result['items']), 'sprites', len(sprites), 'spines', len(spines), 'cfg', list(result['cfg']))
