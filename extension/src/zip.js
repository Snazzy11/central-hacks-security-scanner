// Minimal ZIP reader/writer built on the browser's native (De)CompressionStream.
// Enough for Office Open XML files (.docx/.xlsx/.pptx). No ZIP64, no encryption.
(function (root) {
  'use strict';

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function streamThrough(bytes, transform) {
    const stream = new Blob([bytes]).stream().pipeThrough(transform);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const inflate = (b) => streamThrough(b, new DecompressionStream('deflate-raw'));
  const deflate = (b) => streamThrough(b, new CompressionStream('deflate-raw'));

  /** Parse a zip. Returns entries with lazily-readable data. */
  function readZip(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 0xffff); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a zip file');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = [];
    const dec = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Bad central directory');
      const flags = dv.getUint16(p + 8, true);
      const method = dv.getUint16(p + 10, true);
      const time = dv.getUint16(p + 12, true);
      const date = dv.getUint16(p + 14, true);
      const crc = dv.getUint32(p + 16, true);
      const compSize = dv.getUint32(p + 20, true);
      const size = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      if (compSize === 0xffffffff || localOff === 0xffffffff) throw new Error('ZIP64 not supported');
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const compressed = u8.subarray(dataStart, dataStart + compSize);
      entries.push({ name, flags, method, time, date, crc, size, compressed });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function entryBytes(e) {
    if (e.method === 0) return e.compressed;
    if (e.method === 8) return inflate(e.compressed);
    throw new Error(`Unsupported compression method ${e.method}`);
  }

  /** Replace an entry's content with new uncompressed bytes. */
  async function setEntryBytes(e, bytes) {
    e.compressed = await deflate(bytes);
    e.method = 8;
    e.crc = crc32(bytes);
    e.size = bytes.length;
    e.flags &= ~0x0008; // sizes now in the local header, no data descriptor
  }

  function writeZip(entries) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.name);
      const flags = (e.flags & ~0x0008) | 0x0800; // UTF-8 names
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, flags, true);
      lh.setUint16(8, e.method, true);
      lh.setUint16(10, e.time, true);
      lh.setUint16(12, e.date, true);
      lh.setUint32(14, e.crc, true);
      lh.setUint32(18, e.compressed.length, true);
      lh.setUint32(22, e.size, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, e.compressed);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, flags, true);
      ch.setUint16(10, e.method, true);
      ch.setUint16(12, e.time, true);
      ch.setUint16(14, e.date, true);
      ch.setUint32(16, e.crc, true);
      ch.setUint32(20, e.compressed.length, true);
      ch.setUint32(24, e.size, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + e.compressed.length;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, entries.length, true);
    eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)]);
  }

  const api = { readZip, writeZip, entryBytes, setEntryBytes, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PIIZip = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
