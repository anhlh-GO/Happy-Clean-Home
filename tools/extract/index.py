import UnityPy,glob,os,sys,json
from multiprocessing import Pool
def f(p):
    try:
        e=UnityPy.load(p)
        return os.path.basename(p),{k:v.type.name for k,v in e.container.items()}
    except Exception as x: return os.path.basename(p),{'ERR':str(x)}
if __name__=='__main__':
    with Pool(8) as pl: r=dict(pl.map(f,glob.glob(sys.argv[1]+'/*.bundle')))
    json.dump(r,open(sys.argv[2],'w'),indent=0)
    print(sum(len(v) for v in r.values()))
