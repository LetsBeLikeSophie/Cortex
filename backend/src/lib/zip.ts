import { PassThrough } from "node:stream";

// A minimal .zip writer for 메모 내보내기: entries are stored as-is (photos
// are already JPEG, the memo text is small), names are UTF-8 so Korean file
// names open right, and each entry goes out as soon as it's added -- only
// a file or so is ever held at a time. No zip64: an export stays far
// under 4 GB.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export class ZipStream {
  readonly stream = new PassThrough();
  private offset = 0;
  private central: Buffer[] = [];
  private count = 0;

  private push(buf: Buffer): boolean {
    this.offset += buf.length;
    return this.stream.write(buf);
  }

  // Resolves once the reader has taken the bytes (backpressure), so a slow
  // phone connection never piles every photo up in memory.
  async add(name: string, data: Buffer, when = new Date()) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const { time, date } = dosTime(when);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4); // made by
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt32LE(this.offset, 42);
    this.central.push(head, nameBuf);

    this.push(local);
    this.push(nameBuf);
    const ok = this.push(data);
    this.count++;
    if (!ok && !this.stream.destroyed) {
      await new Promise<void>((resolve) => {
        this.stream.once("drain", resolve);
        this.stream.once("close", resolve);
      });
    }
  }

  end() {
    const start = this.offset;
    const dir = Buffer.concat(this.central);
    this.push(dir);
    const tail = Buffer.alloc(22);
    tail.writeUInt32LE(0x06054b50, 0);
    tail.writeUInt16LE(this.count, 8);
    tail.writeUInt16LE(this.count, 10);
    tail.writeUInt32LE(dir.length, 12);
    tail.writeUInt32LE(start, 16);
    this.stream.end(tail);
  }
}
