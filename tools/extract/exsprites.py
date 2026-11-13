# Export named sprites (with pivot meta) from given bundles; handles late-binding SpriteAtlas packing.
# usage: exsprites.py <scratch> <outdir> <names.txt> <bundle-prefix-container-substring>
import UnityPy, json, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dumpprefab as D

S, OUT, NAMES, SUB = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
want = set(open(NAMES, encoding='utf-8').read().split('\n')) - {''}
os.makedirs(OUT, exist_ok=True)
idx = D.idx
bundles = sorted(set(b for b, v in idx.items() for k in v if SUB in k))
meta = {}
got = set()
texcache = {}


def save(nm, img, st):
    r = st['m_Rect']
    pv = st.get('m_Pivot', {'x': 0.5, 'y': 0.5})
    img.save(os.path.join(OUT, nm.replace(' ', '_') + '.png'))
    meta[nm] = {'w': round(r['width']), 'h': round(r['height']), 'px': round(pv['x'], 4), 'py': round(pv['y'], 4), 'ppu': st.get('m_PixelsToUnits', 100)}
    got.add(nm)


for b in bundles:
    env = D.load_env(b)
    D.ENV = env
    # direct sprites
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        try:
            st = o.read_typetree()
        except Exception:
            continue
        nm = st['m_Name']
        if nm not in want or nm in got:
            continue
        if st['m_RD']['texture']['m_PathID'] != 0:
            try:
                save(nm, o.read().image, st)
            except Exception as ex:
                print('err', nm, ex)
    # atlases
    for o in env.objects:
        if o.type.name != 'SpriteAtlas':
            continue
        t = o.read_typetree()
        names = t['m_PackedSpriteNamesToIndex']
        for i, pp in enumerate(t['m_PackedSprites']):
            nm = names[i]
            if nm not in want or nm in got:
                continue
            sp = D.deref(pp, o)
            if sp is None:
                continue
            st = sp.read_typetree()
            rk = st['m_RenderDataKey']
            rd = next((val for kk, val in t['m_RenderDataMap'] if kk[0] == rk[0] and kk[1] == rk[1]), None)
            if rd is None:
                continue
            tp = (id(o.assets_file), rd['texture']['m_PathID'])
            if tp not in texcache:
                to = D.deref(rd['texture'], o)
                if to is None:
                    continue
                texcache[tp] = to.read().image
            img = texcache[tp]
            r = rd['textureRect']
            H = img.height
            x, y, w, h = r['x'], r['y'], r['width'], r['height']
            crop = img.crop((round(x), round(H - y - h), round(x + w), round(H - y)))
            rot = (rd['settingsRaw'] >> 2) & 0xF
            if rot == 1:
                crop = crop.transpose(Image.FLIP_LEFT_RIGHT)
            elif rot == 2:
                crop = crop.transpose(Image.FLIP_TOP_BOTTOM)
            elif rot == 3:
                crop = crop.transpose(Image.ROTATE_180)
            elif rot == 4:
                crop = crop.transpose(Image.ROTATE_270)
            sr = st['m_Rect']
            off = rd.get('textureRectOffset', {'x': 0, 'y': 0})
            full = Image.new('RGBA', (round(sr['width']), round(sr['height'])), (0, 0, 0, 0))
            full.paste(crop, (round(off['x']), round(sr['height'] - off['y'] - h)))
            save(nm, full, st)
old = {}
mp = os.path.join(OUT, 'meta.json')
if os.path.exists(mp):
    old = json.load(open(mp, encoding='utf-8'))
old.update(meta)
json.dump(old, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('got', len(got), 'missing', sorted(want - got)[:20])
