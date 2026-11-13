import hashlib,glob,os,sys
from multiprocessing import Pool
from Crypto.Cipher import AES
K=hashlib.sha256(b'mx2dmimahencheng').digest()
def f(a):
    src,dst=a
    c=open(src,'rb').read()
    if c[:7]!=b'UnityFS':
        p=AES.new(K,AES.MODE_ECB).decrypt(c); p=p[:-p[-1]]
    else: p=c
    open(dst,'wb').write(p); return p[:7]==b'UnityFS'
if __name__=='__main__':
    os.makedirs(sys.argv[2],exist_ok=True)
    jobs=[(x,os.path.join(sys.argv[2],os.path.basename(x))) for x in glob.glob(sys.argv[1]+'/*.bundle')]
    with Pool(8) as p: r=p.map(f,jobs)
    print(len(r),sum(r))
