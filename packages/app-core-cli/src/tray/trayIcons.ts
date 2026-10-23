// Tray icons, drawn at runtime: a ring around a disc, one color per state. No image dependency and no generated asset
// to keep in sync (orchestrator generates its icons from Lucide with a script; app-core only needs four colors).
import * as zlib from 'node:zlib';

export type IconState = 'running' | 'stopped' | 'update' | 'busy';

const COLORS: Record<IconState, [number, number, number]> = {
  running: [74, 222, 128],
  stopped: [156, 163, 175],
  update: [251, 191, 36],
  busy: [96, 165, 250],
};

const SIZE = 64;

const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 64x64 RGBA PNG: a ring of the state's color around a smaller disc, transparent elsewhere. */
export function iconPng(state: IconState): Buffer {
  const [r, g, b] = COLORS[state];
  const center = (SIZE - 1) / 2;
  // Row = filter byte (0) + RGBA pixels.
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y++) {
    const row = y * (1 + SIZE * 4);
    for (let x = 0; x < SIZE; x++) {
      const distance = Math.hypot(x - center, y - center);
      const inRing = distance <= 30 && distance >= 24;
      const inDisc = distance <= 14;
      if (inRing || inDisc) {
        const offset = row + 1 + x * 4;
        raw[offset] = r;
        raw[offset + 1] = g;
        raw[offset + 2] = b;
        raw[offset + 3] = 255;
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function iconBase64(state: IconState): string {
  return iconPng(state).toString('base64');
}
