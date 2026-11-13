import UnityPy,sys,struct
def raw_text(o):
    r=o.get_raw_data(); n=struct.unpack_from('<i',r,0)[0]; p=(4+n+3)&~3
    L=struct.unpack_from('<i',r,p)[0]; return r[p+4:p+4+L]
if __name__=='__main__':
    e=UnityPy.load(sys.argv[1])
    for o in e.objects:
        if o.type.name=='TextAsset': open(sys.argv[2],'wb').write(raw_text(o))
