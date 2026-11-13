# Dump a prefab hierarchy (with component typetrees) from the decrypted bundles.
# usage: dumpprefab.py <scratch> <container path> <out.json>
import UnityPy, json, os, sys

S = sys.argv[1]
idx = json.load(open(os.path.join(S, 'index.json')))
cab = json.load(open(os.path.join(S, 'cab.json')))


def bundle_of(container):
    for b, v in idx.items():
        if container in v:
            return b
    raise SystemExit('not found ' + container)


def load_env(b):
    seen = set()
    todo = [b]
    paths = []
    while todo:
        x = todo.pop()
        if x in seen:
            continue
        seen.add(x)
        p = os.path.join(S, 'dec', x)
        paths.append(p)
        e = UnityPy.load(p)
        for f in e.files.values():
            for sf in getattr(f, 'files', {}).values():
                for ext in getattr(sf, 'externals', []):
                    nm = ext.path.split('/')[-1]
                    if nm.lower() in cab:
                        todo.append(cab[nm.lower()])
                    elif nm in cab:
                        todo.append(cab[nm])
    return UnityPy.load(*paths)


ENV = None
NAMECACHE = {}


def deref(pp, owner):
    if not isinstance(pp, dict) or 'm_PathID' not in pp or pp['m_PathID'] == 0:
        return None
    try:
        sf = owner.assets_file
        fid = pp['m_FileID']
        if fid == 0:
            target = sf
        else:
            ext = sf.externals[fid - 1]
            nm = ext.path.split('/')[-1].lower()
            target = None
            for f in ENV.files.values():
                for k, s2 in getattr(f, 'files', {}).items():
                    if k.lower() == nm:
                        target = s2
            if target is None:
                return None
        return target.objects.get(pp['m_PathID'])
    except Exception:
        return None


def objname(pp, owner):
    key = (id(owner.assets_file), pp.get('m_FileID'), pp.get('m_PathID')) if isinstance(pp, dict) else None
    if key in NAMECACHE:
        return NAMECACHE[key]
    o = deref(pp, owner)
    r = None
    if o is not None:
        try:
            t = o.read_typetree()
            r = {'type': o.type.name, 'name': t.get('m_Name') or t.get('m_ClassName')}
            SV = os.environ.get('SAVEIMG')
            if SV and o.type.name in ('Sprite', 'Texture2D') and r['name']:
                fp = os.path.join(SV, r['name'] + '.png')
                if not os.path.exists(fp):
                    try:
                        o.read().image.save(fp)
                    except Exception as ex2:
                        print('imgerr', r['name'], ex2)
            if o.type.name == 'MonoScript':
                r['name'] = t.get('m_ClassName')
            if o.type.name == 'MonoBehaviour' and not r['name']:
                sc = deref(t.get('m_Script'), o)
                if sc is not None:
                    r['name'] = sc.read_typetree().get('m_ClassName')
        except Exception as ex:
            r = {'type': o.type.name, 'err': str(ex)}
    NAMECACHE[key] = r
    return r


SKIP_KEYS = {'m_GameObject', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset', 'm_ObjectHideFlags', 'm_EditorHideFlags', 'm_EditorClassIdentifier'}


def simplify(v, owner, depth=0):
    if isinstance(v, dict):
        if set(v.keys()) == {'m_FileID', 'm_PathID'}:
            if v['m_PathID'] == 0:
                return None
            n = objname(v, owner)
            return {'ref': n, 'pid': str(v['m_PathID'])} if n else {'pid': str(v['m_PathID']), 'fid': v['m_FileID']}
        return {k: simplify(x, owner, depth + 1) for k, x in v.items() if k not in SKIP_KEYS}
    if isinstance(v, list):
        if len(v) > 400:
            return {'len': len(v)}
        return [simplify(x, owner, depth + 1) for x in v]
    if isinstance(v, (bytes, bytearray)):
        return {'bytes': len(v)}
    return v


def dump_go(go):
    t = go.read_typetree()
    node = {'name': t['m_Name'], 'active': t['m_IsActive'], 'layer': t.get('m_Layer'), 'comps': [], 'children': []}
    tr = None
    for c in t['m_Component']:
        co = deref(c['component'], go)
        if co is None:
            continue
        ct = co.read_typetree()
        tn = co.type.name
        if tn in ('Transform', 'RectTransform'):
            tr = (co, ct)
            d = {k: ct[k] for k in ct if k in ('m_LocalRotation', 'm_LocalPosition', 'm_LocalScale', 'm_AnchorMin', 'm_AnchorMax', 'm_AnchoredPosition', 'm_SizeDelta', 'm_Pivot')}
            d['_type'] = tn
            node['tr'] = d
            continue
        if tn == 'MonoBehaviour':
            sc = deref(ct.get('m_Script'), co)
            tn = sc.read_typetree().get('m_ClassName') if sc is not None else 'MonoBehaviour?'
        if tn in ('ParticleSystem',):
            node['comps'].append({'_type': tn})
            continue
        d = simplify(ct, co)
        d['_type'] = tn
        node['comps'].append(d)
    if tr:
        for ch in tr[1]['m_Children']:
            cho = deref(ch, tr[0])
            if cho is None:
                continue
            cgo = deref(cho.read_typetree()['m_GameObject'], cho)
            if cgo is not None:
                node['children'].append(dump_go(cgo))
    return node


if __name__ == '__main__':
    cont = sys.argv[2]
    b = bundle_of(cont)
    ENV = load_env(b)
    root = None
    for e2 in ENV.files.values():
        pass
    for k, v in ENV.container.items():
        if k == cont:
            root = v.deref() if hasattr(v, 'deref') else v
    go = root
    tree = dump_go(go)
    json.dump(tree, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('ok', sys.argv[3])
