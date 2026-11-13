import struct,sys,json
d=open(sys.argv[1],'rb').read()
lo,ls,lc,do,ds,dc=struct.unpack_from('<6I',d,8)
offs=struct.unpack_from('<%dI'%lc,d,lo)
out=[d[do+offs[i]:do+offs[i+1]].decode('utf-8','replace') for i in range(lc-1)]
json.dump(out,open(sys.argv[2],'w',encoding='utf-8'),ensure_ascii=False)
print(len(out),out[:20])
