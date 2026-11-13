import UnityPy,json,os,sys,re
sys.path.insert(0,os.path.dirname(__file__))
from rawtext import raw_text
S=sys.argv[1]; out=sys.argv[2]
idx=json.load(open(os.path.join(S,'index.json')))
bs=set(b for b,v in idx.items() for k in v if '/FlushGame/Spines/' in k)
for b in bs:
    e=UnityPy.load(os.path.join(S,'dec',b))
    for k,pp in e.container.items():
        if '/FlushGame/Spines/' not in k: continue
        o=pp.deref(); fn=os.path.basename(k)
        d=os.path.join(out,k.split('/Spines/')[1].split('/')[0]); os.makedirs(d,exist_ok=True)
        if o.type.name=='TextAsset':
            open(os.path.join(d,fn),'wb').write(raw_text(o))
        elif o.type.name=='Texture2D':
            t=o.read(); t.image.save(os.path.join(d,fn))
for d in sorted(os.listdir(out)):
    for f in os.listdir(os.path.join(out,d)):
        if f.endswith('.skel.bytes'):
            b=open(os.path.join(out,d,f),'rb').read(64)
            m=re.search(rb'\d\.\d+\.\d+',b); print(d,f,m.group() if m else b[:30])
