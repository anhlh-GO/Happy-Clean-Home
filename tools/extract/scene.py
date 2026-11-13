# Convert pf/*.json prefab dumps into compact scene nodes for the HTML engine.
import json, os, sys, math

S, OUT = sys.argv[1], sys.argv[2]
names = sys.argv[3].split(',')


def rnd(v, k=2):
    return round(v, k)


def ref(c, key):
    s = c.get(key)
    if s and s.get('ref') and s['ref'].get('name'):
        return s['ref']['name'].replace(' ', '_')
    return None


def conv(n):
    o = {'n': n['name']}
    if not n['active']:
        o['off'] = 1
    tr = n.get('tr') or {}
    sc = tr.get('m_LocalScale', {'x': 1, 'y': 1})
    q = tr.get('m_LocalRotation', {'z': 0, 'w': 1})
    rot = math.degrees(2 * math.atan2(q.get('z', 0), q.get('w', 1)))
    if tr.get('_type') == 'RectTransform':
        amin, amax = tr['m_AnchorMin'], tr['m_AnchorMax']
        p, s, pv = tr['m_AnchoredPosition'], tr['m_SizeDelta'], tr['m_Pivot']
        o['r'] = [rnd(amin['x'], 4), rnd(amin['y'], 4), rnd(amax['x'], 4), rnd(amax['y'], 4), rnd(p['x']), rnd(p['y']), rnd(s['x']), rnd(s['y']), rnd(pv['x'], 4), rnd(pv['y'], 4)]
    else:
        p = tr.get('m_LocalPosition', {'x': 0, 'y': 0})
        o['t'] = [rnd(p['x']), rnd(p['y'])]
    if abs(sc['x'] - 1) > 1e-4 or abs(sc['y'] - 1) > 1e-4:
        o['s'] = [rnd(sc['x'], 4), rnd(sc['y'], 4)]
    if abs(rot) > 0.01:
        o['rot'] = rnd(rot, 2)
    for c in n['comps']:
        ty = c['_type']
        if ty == 'Image':
            o['img'] = ref(c, 'm_Sprite') or ''
            if not c.get('m_Enabled', 1):
                o['imgOff'] = 1
            col = c.get('m_Color')
            if col and (col['r'], col['g'], col['b'], col['a']) != (1, 1, 1, 1):
                o['col'] = [rnd(col['r'], 3), rnd(col['g'], 3), rnd(col['b'], 3), rnd(col['a'], 3)]
            if c.get('m_Type'):
                o['itype'] = c['m_Type']
                if c['m_Type'] == 3:
                    o['fill'] = [c.get('m_FillMethod'), c.get('m_FillOrigin'), c.get('m_FillAmount')]
            if c.get('m_PreserveAspect'):
                o['aspect'] = 1
        elif ty == 'RawImage':
            o['raw'] = ref(c, 'm_Texture') or ''
            if not c.get('m_Enabled', 1):
                o['imgOff'] = 1
            col = c.get('m_Color')
            if col and col['a'] != 1:
                o['col'] = [rnd(col['r'], 3), rnd(col['g'], 3), rnd(col['b'], 3), rnd(col['a'], 3)]
        elif ty == 'SkeletonGraphic':
            sd = ref(c, 'skeletonDataAsset') or ''
            o['spine'] = {'d': sd.replace('_SkeletonData', ''), 'a': c.get('startingAnimation') or '', 'l': c.get('startingLoop', 0), 'skin': c.get('initialSkinName') or 'default', 'ts': c.get('timeScale', 1)}
            col = c.get('m_Color')
            if col and col['a'] != 1:
                o['col'] = [1, 1, 1, rnd(col['a'], 3)]
        elif ty == 'Button':
            o['btn'] = 1
        elif ty == 'CanvasGroup':
            o['cg'] = rnd(c.get('m_Alpha', 1), 3)
        elif ty in ('ParticleSystem', 'UIParticle', 'UIParticleSystem'):
            o['ps'] = 1
        elif ty in ('TextMeshProUGUI', 'LocalizeTextMeshProUGUI', 'Text'):
            o['txt'] = c.get('m_text') or c.get('m_Text') or ''
        elif ty in ('HorizontalLayoutGroup', 'VerticalLayoutGroup'):
            o['layout'] = {'t': ty[0], 'sp': c.get('m_Spacing'), 'pad': c.get('m_Padding'), 'al': c.get('m_ChildAlignment')}
        elif ty in ('Mask', 'RectMask2D'):
            o['mask'] = 1
        elif ty == 'SkeletonUtilityBone':
            o['bone'] = c.get('boneName')
    ch = [conv(x) for x in n['children']]
    if ch:
        o['c'] = ch
    return o


res = {}
for nm in names:
    t = json.load(open(os.path.join(S, 'pf', nm + '.json'), encoding='utf-8'))
    res[nm] = conv(t)
json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(os.path.getsize(OUT))
