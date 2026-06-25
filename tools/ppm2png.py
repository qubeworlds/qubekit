#!/usr/bin/env python3
# Minimal P6 PPM → PNG (stdlib only; no PIL). Used by the local-render self-test
# to turn quine's QUINE_THUMB_OUT .ppm into a .png an agent can view.
import sys, zlib, struct

def ppm_to_png(src, dst):
    d = open(src, 'rb').read()
    assert d[:2] == b'P6', 'not a P6 PPM'
    i, vals = 2, []
    while len(vals) < 3:
        while d[i:i+1].isspace(): i += 1
        if d[i:i+1] == b'#':
            while d[i:i+1] not in (b'\n', b''): i += 1
            continue
        s = i
        while not d[i:i+1].isspace(): i += 1
        vals.append(int(d[s:i]))
    w, h, _maxv = vals
    i += 1  # one whitespace after maxval
    pix = d[i:i+w*h*3]
    def chunk(typ, p):
        c = typ + p
        return struct.pack('>I', len(p)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += pix[y*w*3:(y+1)*w*3]
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    open(dst, 'wb').write(png)
    print(f'{w}x{h} → {dst}')

if __name__ == '__main__':
    ppm_to_png(sys.argv[1], sys.argv[2])
