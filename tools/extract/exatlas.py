# Cut sprites out of SpriteAtlas assets. usage: exatlas.py <scratch> <outdir> <name filter regex or names file>
import UnityPy, json, os, sys, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.argv_saved = list(sys.argv)
from PIL import Image

S, OUT = sys.argv[1], sys.argv[2]
want = None
if len(sys.argv) > 3:
    want = set(open(sys.argv[3], encoding='utf-8').read().split('\n')) - {''}
idx = json.load(open(os.path.join(S, 'index.json')))
os.makedirs(OUT, exist_ok=True)
got = set()
texcache = {}
for b, v in idx.items():
    if 'SpriteAtlas' not in v.values():
        continue
    import dumpprefab as D
    e = D.load_env(b); D.ENV = e
    for o in e.objects:
        if o.type.name != 'SpriteAtlas':
            continue
        t = o.read_typetree()
        aname = t['m_Name']
        names = t['m_PackedSpriteNamesToIndex']
        packed = t['m_PackedSprites']
        for i, pp in enumerate(packed):
            nm = names[i]
            if want is not None and nm not in want:
                continue
            if nm in got:
                continue
            sp = D.deref(pp, o)
            if sp is None:
                continue
            st = sp.read_typetree()
            rk = st['m_RenderDataKey']
            rd = None
            for (kk, val) in t['m_RenderDataMap']:
                if kk[0] == rk[0] and kk[1] == rk[1]:
                    rd = val
                    break
            if rd is None:
                print('no rd', nm)
                continue
            tp = rd['texture']['m_PathID']
            if tp not in texcache:
                texcache[tp] = D.deref(rd['texture'], o).read().image
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
            # restore full sprite rect (tight packing offset)
            sr = st['m_Rect']
            off = rd.get('textureRectOffset', {'x': 0, 'y': 0})
            full = Image.new('RGBA', (round(sr['width']), round(sr['height'])), (0, 0, 0, 0))
            full.paste(crop, (round(off['x']), round(sr['height'] - off['y'] - h)))
            full.save(os.path.join(OUT, nm + '.png'))
            got.add(nm)
print('got', len(got))
if want:
    print('missing', sorted(want - got))
