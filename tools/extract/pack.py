import os,sys,shutil,glob,json
import numpy as np
from PIL import Image
S,P=sys.argv[1],sys.argv[2]
A=os.path.join(P,'assets'); 
for d in ('img','spine','snd'): os.makedirs(os.path.join(A,d),exist_ok=True)
for f in glob.glob(S+'/raw/img/*.png'):
    n=os.path.basename(f)[:-4].replace(' ','_')
    im=Image.open(f).convert('RGBA')
    im.save(os.path.join(A,'img',n+'.webp'),'WEBP',quality=88,alpha_quality=100,method=5)
for d in glob.glob(S+'/raw/spine/*'):
    for f in os.listdir(d):
        src=os.path.join(d,f); base=f.replace(' ','_')
        if f.endswith('.skel.bytes'): shutil.copy(src,os.path.join(A,'spine',base[:-6]))
        elif f.endswith('.atlas.txt'):
            t=open(src,encoding='utf-8').read().replace(' _sweeper.png','_sweeper.png').replace('.png','.webp')
            open(os.path.join(A,'spine',base[:-4]),'w',encoding='utf-8').write(t)
        elif f.endswith('.png'):
            a=np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)
            al=a[...,3:4]; rgb=np.where(al>0,np.clip(a[...,:3]*255/np.maximum(al,1),0,255),0)
            out=np.concatenate([rgb,al],-1).astype(np.uint8)
            Image.fromarray(out,'RGBA').save(os.path.join(A,'spine',base[:-4]+'.webp'),'WEBP',quality=90,alpha_quality=100,method=5)
for f in glob.glob(S+'/raw/snd/*.wav'): shutil.copy(f,os.path.join(A,'snd'))
shutil.copy(S+'/out/flushgame.json',os.path.join(A,'flushgame.json'))
tot=sum(os.path.getsize(os.path.join(r,x)) for r,_,fs in os.walk(A) for x in fs); print('MB',tot/1e6)
