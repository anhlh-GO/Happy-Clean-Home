# minimal CIL disassembler using dnfile
import dnfile, struct, sys, re

OPS1 = {}
one = """00 nop -;01 break -;02 ldarg.0 -;03 ldarg.1 -;04 ldarg.2 -;05 ldarg.3 -;06 ldloc.0 -;07 ldloc.1 -;08 ldloc.2 -;09 ldloc.3 -;0a stloc.0 -;0b stloc.1 -;0c stloc.2 -;0d stloc.3 -;0e ldarg.s u1;0f ldarga.s u1;10 starg.s u1;11 ldloc.s u1;12 ldloca.s u1;13 stloc.s u1;14 ldnull -;15 ldc.i4.m1 -;16 ldc.i4.0 -;17 ldc.i4.1 -;18 ldc.i4.2 -;19 ldc.i4.3 -;1a ldc.i4.4 -;1b ldc.i4.5 -;1c ldc.i4.6 -;1d ldc.i4.7 -;1e ldc.i4.8 -;1f ldc.i4.s i1;20 ldc.i4 i4;21 ldc.i8 i8;22 ldc.r4 r4;23 ldc.r8 r8;25 dup -;26 pop -;27 jmp tok;28 call tok;29 calli tok;2a ret -;2b br.s b1;2c brfalse.s b1;2d brtrue.s b1;2e beq.s b1;2f bge.s b1;30 bgt.s b1;31 ble.s b1;32 blt.s b1;33 bne.un.s b1;34 bge.un.s b1;35 bgt.un.s b1;36 ble.un.s b1;37 blt.un.s b1;38 br b4;39 brfalse b4;3a brtrue b4;3b beq b4;3c bge b4;3d bgt b4;3e ble b4;3f blt b4;40 bne.un b4;41 bge.un b4;42 bgt.un b4;43 ble.un b4;44 blt.un b4;45 switch sw;46 ldind.i1 -;47 ldind.u1 -;48 ldind.i2 -;49 ldind.u2 -;4a ldind.i4 -;4b ldind.u4 -;4c ldind.i8 -;4d ldind.i -;4e ldind.r4 -;4f ldind.r8 -;50 ldind.ref -;51 stind.ref -;52 stind.i1 -;53 stind.i2 -;54 stind.i4 -;55 stind.i8 -;56 stind.r4 -;57 stind.r8 -;58 add -;59 sub -;5a mul -;5b div -;5c div.un -;5d rem -;5e rem.un -;5f and -;60 or -;61 xor -;62 shl -;63 shr -;64 shr.un -;65 neg -;66 not -;67 conv.i1 -;68 conv.i2 -;69 conv.i4 -;6a conv.i8 -;6b conv.r4 -;6c conv.r8 -;6d conv.u4 -;6e conv.u8 -;6f callvirt tok;70 cpobj tok;71 ldobj tok;72 ldstr str;73 newobj tok;74 castclass tok;75 isinst tok;76 conv.r.un -;79 unbox tok;7a throw -;7b ldfld tok;7c ldflda tok;7d stfld tok;7e ldsfld tok;7f ldsflda tok;80 stsfld tok;81 stobj tok;82 conv.ovf.i1.un -;83 conv.ovf.i2.un -;84 conv.ovf.i4.un -;85 conv.ovf.i8.un -;86 conv.ovf.u1.un -;87 conv.ovf.u2.un -;88 conv.ovf.u4.un -;89 conv.ovf.u8.un -;8a conv.ovf.i.un -;8b conv.ovf.u.un -;8c box tok;8d newarr tok;8e ldlen -;8f ldelema tok;90 ldelem.i1 -;91 ldelem.u1 -;92 ldelem.i2 -;93 ldelem.u2 -;94 ldelem.i4 -;95 ldelem.u4 -;96 ldelem.i8 -;97 ldelem.i -;98 ldelem.r4 -;99 ldelem.r8 -;9a ldelem.ref -;9b stelem.i -;9c stelem.i1 -;9d stelem.i2 -;9e stelem.i4 -;9f stelem.i8 -;a0 stelem.r4 -;a1 stelem.r8 -;a2 stelem.ref -;a3 ldelem tok;a4 stelem tok;a5 unbox.any tok;b3 conv.ovf.i1 -;b4 conv.ovf.u1 -;b5 conv.ovf.i2 -;b6 conv.ovf.u2 -;b7 conv.ovf.i4 -;b8 conv.ovf.u4 -;b9 conv.ovf.i8 -;ba conv.ovf.u8 -;c2 refanyval tok;c3 ckfinite -;c6 mkrefany tok;d0 ldtoken tok;d1 conv.u2 -;d2 conv.u1 -;d3 conv.i -;d4 conv.ovf.i -;d5 conv.ovf.u -;d6 add.ovf -;d7 add.ovf.un -;d8 mul.ovf -;d9 mul.ovf.un -;da sub.ovf -;db sub.ovf.un -;dc endfinally -;dd leave b4;de leave.s b1;df stind.i -;e0 conv.u -"""
for e in one.strip().split(';'):
    c, n, o = e.split()
    OPS1[int(c, 16)] = (n, o)
OPS2 = {0x00: ('arglist', '-'), 0x01: ('ceq', '-'), 0x02: ('cgt', '-'), 0x03: ('cgt.un', '-'), 0x04: ('clt', '-'), 0x05: ('clt.un', '-'), 0x06: ('ldftn', 'tok'), 0x07: ('ldvirtftn', 'tok'), 0x09: ('ldarg', 'u2'), 0x0a: ('ldarga', 'u2'), 0x0b: ('starg', 'u2'), 0x0c: ('ldloc', 'u2'), 0x0d: ('ldloca', 'u2'), 0x0e: ('stloc', 'u2'), 0x0f: ('localloc', '-'), 0x11: ('endfilter', '-'), 0x12: ('unaligned.', 'u1'), 0x13: ('volatile.', '-'), 0x14: ('tail.', '-'), 0x15: ('initobj', 'tok'), 0x16: ('constrained.', 'tok'), 0x17: ('cpblk', '-'), 0x18: ('initblk', '-'), 0x1a: ('rethrow', '-'), 0x1c: ('sizeof', 'tok'), 0x1d: ('refanytype', '-'), 0x1e: ('readonly.', '-')}

pe = dnfile.dnPE(sys.argv[1])
md = pe.net.mdtables
us = pe.net.user_strings


def tname(t):
    try:
        ns = str(t.TypeNamespace)
        return (ns + '.' if ns else '') + str(t.TypeName)
    except Exception:
        return '?'


TD = list(md.TypeDef)
MD = list(md.MethodDef)
FD = list(md.Field)
MR = list(md.MemberRef) if md.MemberRef else []
TR = list(md.TypeRef) if md.TypeRef else []
MS = list(md.MethodSpec) if md.MethodSpec else []
TS = list(md.TypeSpec) if md.TypeSpec else []
mowner = {}
fowner = {}
for t in TD:
    for m in t.MethodList:
        mowner[m.row_index] = tname(t)
    for f in t.FieldList:
        fowner[f.row_index] = tname(t)


def parent_name(p):
    if p is None:
        return '?'
    if hasattr(p, 'TypeName'):
        return tname(p)
    if hasattr(p, 'Signature'):
        return '<spec>'
    return str(getattr(p, 'Name', '?'))


def ref_name(cr):
    try:
        r = cr.row
    except Exception:
        return '?'
    if r is None:
        return '?'
    if hasattr(r, 'Class'):
        return parent_name(r.Class.row) + '::' + str(r.Name)
    nm = str(getattr(r, 'Name', '?'))
    idx = getattr(r, 'row_index', None)
    if idx and hasattr(r, 'Rva'):
        return mowner.get(idx, '?') + '::' + nm
    return nm


def tokname(tok):
    tb = tok >> 24
    ix = tok & 0xffffff
    try:
        if tb == 0x06:
            return f'{mowner.get(ix, "?")}::{MD[ix - 1].Name}'
        if tb == 0x04:
            return f'{fowner.get(ix, "?")}::{FD[ix - 1].Name}'
        if tb == 0x0a:
            r = MR[ix - 1]
            return parent_name(r.Class.row) + '::' + str(r.Name)
        if tb == 0x02:
            return tname(TD[ix - 1])
        if tb == 0x01:
            return tname(TR[ix - 1])
        if tb == 0x1b:
            return '<typespec>'
        if tb == 0x2b:
            return 'spec:' + ref_name(MS[ix - 1].Method)
    except Exception:
        return f'?{tok:08x}'
    return f'{tok:08x}'


def getus(tok):
    off = tok & 0xffffff
    try:
        return us.get(off).value
    except Exception:
        return '?'


def body(rva):
    data = pe.get_data(rva, 12)
    h = data[0]
    if h & 3 == 2:
        size = h >> 2
        return pe.get_data(rva + 1, size)
    size = struct.unpack_from('<I', data, 4)[0]
    hs = (struct.unpack_from('<H', data, 0)[0] >> 12) * 4
    return pe.get_data(rva + hs, size)


def dis(code):
    i = 0
    out = []
    while i < len(code):
        st = i
        b = code[i]
        i += 1
        if b == 0xfe:
            n, o = OPS2.get(code[i], ('?', '-'))
            i += 1
        else:
            n, o = OPS1.get(b, ('?%02x' % b, '-'))
        arg = ''
        if o == 'u1':
            arg = str(code[i]); i += 1
        elif o == 'i1':
            arg = str(struct.unpack_from('<b', code, i)[0]); i += 1
        elif o == 'u2':
            arg = str(struct.unpack_from('<H', code, i)[0]); i += 2
        elif o == 'i4':
            arg = str(struct.unpack_from('<i', code, i)[0]); i += 4
        elif o == 'i8':
            arg = str(struct.unpack_from('<q', code, i)[0]); i += 8
        elif o == 'r4':
            arg = repr(round(struct.unpack_from('<f', code, i)[0], 5)); i += 4
        elif o == 'r8':
            arg = repr(struct.unpack_from('<d', code, i)[0]); i += 8
        elif o == 'b1':
            arg = 'IL_%04x' % (i + 1 + struct.unpack_from('<b', code, i)[0]); i += 1
        elif o == 'b4':
            arg = 'IL_%04x' % (i + 4 + struct.unpack_from('<i', code, i)[0]); i += 4
        elif o == 'tok':
            t = struct.unpack_from('<I', code, i)[0]; i += 4; arg = tokname(t)
        elif o == 'str':
            t = struct.unpack_from('<I', code, i)[0]; i += 4; arg = repr(getus(t))
        elif o == 'sw':
            n_ = struct.unpack_from('<I', code, i)[0]; i += 4
            base = i + 4 * n_
            arg = ','.join('IL_%04x' % (base + struct.unpack_from('<i', code, i + 4 * k)[0]) for k in range(n_))
            i = base
        out.append(f'  {st:04x} {n} {arg}')
    return out


pat = re.compile(sys.argv[2])
nest = {}
for r in (md.NestedClass or []):
    nest[r.NestedClass.row_index] = r.EnclosingClass.row_index


def full(ix):
    n = tname(TD[ix - 1])
    if ix in nest:
        return full(nest[ix]) + '/' + n
    return n


for ti, t in enumerate(TD, 1):
    fn = full(ti)
    if not pat.search(fn):
        continue
    ext = ''
    try:
        ext = parent_name(t.Extends.row) if t.Extends and t.Extends.row else ''
    except Exception:
        pass
    print(f'\n######## class {fn} : {ext}')
    for f in t.FieldList:
        print(f'  field {f.row.Name}')
    for m in t.MethodList:
        m = m.row
        print(f'\n== {fn}::{m.Name}')
        if m.Rva:
            try:
                print('\n'.join(dis(body(m.Rva))))
            except Exception as e:
                print('ERR', e)
