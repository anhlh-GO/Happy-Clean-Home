# Package an exported room into the HTML project: spines (un-PMA if needed), sprites (webp), sounds (wav)
# usage: packroom.py <scratch> <roomId> <projectDir>
import os, sys, json, re
import numpy as np
from PIL import Image
import UnityPy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rawtext import raw_text

S, RID, P = sys.argv[1], sys.argv[2], sys.argv[3]
src = os.path.join(S, 'rooms', RID)
dst = os.path.join(P, 'assets', 'rooms', RID)
for d in ('img', 'spine', 'snd'):
    os.makedirs(os.path.join(dst, d), exist_ok=True)
idx = json.load(open(os.path.join(S, 'index.json')))
room = json.load(open(os.path.join(src, 'room.json'), encoding='utf-8'))


def is_pma(a):
    m = (a[..., 3] > 8) & (a[..., 3] < 247)
    semi = a[m]
    if len(semi) < 50:
        return False
    over = (semi[:, :3].max(1) > semi[:, 3] + 3).mean()
    return over < 0.01


def save_tex(img, path):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    if is_pma(a):
        al = a[..., 3:4]
        rgb = np.where(al > 0, np.clip(a[..., :3] * 255 / np.maximum(al, 1), 0, 255), 0)
        a = np.concatenate([rgb, al], -1)
    Image.fromarray(a.astype(np.uint8), 'RGBA').save(path, 'WEBP', quality=88, alpha_quality=100, method=5)


pre = f'Assets/Export/RoomRes/{RID}/'
spmap = {}
bybundle = {}
for b, v in idx.items():
    for k, t in v.items():
        if k.startswith(pre) and (('/Spine/' in k and t in ('TextAsset', 'Texture2D')) or t == 'AudioClip'):
            bybundle.setdefault(b, []).append((k, t))
nsk = 0
for b, ks in bybundle.items():
    e = UnityPy.load(os.path.join(S, 'dec', b))
    for k, t in ks:
        o = e.container[k].deref()
        fn = os.path.basename(k)
        if t == 'AudioClip':
            d = o.read()
            for n, data in d.samples.items():
                open(os.path.join(dst, 'snd', os.path.splitext(fn)[0] + '.wav'), 'wb').write(data)
        elif fn.endswith('.skel.bytes'):
            open(os.path.join(dst, 'spine', fn[:-6]), 'wb').write(raw_text(o)); nsk += 1
        elif fn.endswith('.atlas.txt'):
            txt = raw_text(o).decode('utf-8')
            txt = re.sub(r'([^\n]+)\.png', lambda m: m.group(1).replace(' ', '_') + '.webp', txt)
            open(os.path.join(dst, 'spine', fn[:-4].replace(' ', '_')), 'wb').write(txt.replace('\r', '').encode('utf-8'))
        elif t == 'Texture2D':
            save_tex(o.read().image, os.path.join(dst, 'spine', fn[:-4].replace(' ', '_') + '.webp'))
# sprites
meta = json.load(open(os.path.join(src, 'img', 'meta.json'), encoding='utf-8'))
for nm in meta:
    im = Image.open(os.path.join(src, 'img', nm.replace(' ', '_') + '.png')).convert('RGBA')
    im.save(os.path.join(dst, 'img', re.sub(r'[^A-Za-z0-9_.-]', '_', nm) + '.webp'), 'WEBP', quality=88, alpha_quality=100, method=5)
room['sprites'] = {nm: dict(v, f=re.sub(r'[^A-Za-z0-9_.-]', '_', nm)) for nm, v in meta.items()}
# skeleton name -> atlas name (same basename unless shared)
sk = {}
for f in os.listdir(os.path.join(dst, 'spine')):
    if f.endswith('.skel'):
        base = f[:-5]
        sk[base] = base if os.path.exists(os.path.join(dst, 'spine', base + '.atlas')) else None
for base in [k for k, v in sk.items() if v is None]:
    # shared atlas in same spine dir
    for d, files in room['spineDirs'].items():
        if base + '.skel.bytes' in files:
            at = [x for x in files if x.endswith('.atlas.txt')]
            if at:
                sk[base] = at[0][:-10].replace(' ', '_')
room['skel'] = sk
del room['spineDirs']
json.dump(room, open(os.path.join(dst, 'room.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
tot = sum(os.path.getsize(os.path.join(r, x)) for r, _, fs in os.walk(dst) for x in fs)
print(RID, 'skels', nsk, 'MB', round(tot / 1e6, 1), 'missingAtlas', [k for k, v in sk.items() if not v])
