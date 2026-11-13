import UnityPy,sys,json,os
sys.path.insert(0,os.path.dirname(__file__))
from rawtext import raw_text
idx=json.load(open(sys.argv[1])); want=sys.argv[2]; out=sys.argv[3]
for b,v in idx.items():
    for k in v:
        if k.endswith(want):
            e=UnityPy.load(os.path.join(os.path.dirname(sys.argv[1]),'dec',b))
            o=e.container[k].deref(); open(out,'wb').write(raw_text(o)); print(k,os.path.getsize(out))
