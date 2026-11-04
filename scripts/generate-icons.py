"""Generate original pixel-star PNG icons with only the Python standard library."""
import struct
import zlib
from pathlib import Path

PIXELS = [
    '................', '.......##.......', '.......##.......', '......####......',
    '..############..', '..############..', '...##########...', '....########....',
    '....########....', '...##########...', '...###.##.###...', '..####.##.####..',
    '..####....####..', '..###......###..', '................', '................',
]
ROOT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
ROOT.mkdir(exist_ok=True)

def png(size):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            px, py = x * 16 // size, y * 16 // size
            color = (21, 27, 45, 255)
            if py > 0 and PIXELS[py - 1][px] == '#':
                color = (170, 113, 59, 255)
            if PIXELS[py][px] == '#':
                color = (255, 213, 128, 255)
            if (px, py) in [(6, 7), (9, 7)]:
                color = (58, 48, 45, 255)
            row.extend(color)
        rows.append(b'\x00' + row)
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')

for dimension in (16, 32, 48, 128):
    (ROOT / f'{dimension}.png').write_bytes(png(dimension))
