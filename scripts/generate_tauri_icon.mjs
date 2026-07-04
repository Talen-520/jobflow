import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "app/desktop/src-tauri/icons/icon.png";
const size = 512;
const radius = 108;
const raw = Buffer.alloc((size * 4 + 1) * size);

function setPixel(x, y, r, g, b, a) {
  const rowStart = y * (size * 4 + 1);
  raw[rowStart] = 0;
  const offset = rowStart + 1 + x * 4;
  raw[offset] = r;
  raw[offset + 1] = g;
  raw[offset + 2] = b;
  raw[offset + 3] = a;
}

function roundedRectContains(x, y, left, top, width, height, r) {
  const right = left + width - 1;
  const bottom = top + height - 1;
  const cx = x < left + r ? left + r : x > right - r ? right - r : x;
  const cy = y < top + r ? top + r : y > bottom - r ? bottom - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function drawRoundedRect(left, top, width, height, r, color) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      if (roundedRectContains(x, y, left, top, width, height, r)) {
        setPixel(x, y, ...color);
      }
    }
  }
}

function drawLine(x1, y1, x2, y2, thickness, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  for (let i = 0; i <= length; i += 1) {
    const t = i / length;
    const x = Math.round(x1 + dx * t);
    const y = Math.round(y1 + dy * t);
    drawRoundedRect(
      x - Math.floor(thickness / 2),
      y - Math.floor(thickness / 2),
      thickness,
      thickness,
      Math.floor(thickness / 2),
      color,
    );
  }
}

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    setPixel(x, y, 0, 0, 0, 0);
  }
}

drawRoundedRect(40, 40, 432, 432, radius, [37, 99, 235, 255]);
drawRoundedRect(132, 104, 248, 304, 34, [255, 255, 255, 255]);
drawRoundedRect(162, 138, 118, 22, 11, [37, 99, 235, 255]);
drawRoundedRect(162, 196, 188, 18, 9, [148, 163, 184, 255]);
drawRoundedRect(162, 240, 132, 18, 9, [148, 163, 184, 255]);
drawLine(182, 314, 226, 356, 28, [22, 163, 74, 255]);
drawLine(222, 356, 328, 270, 28, [22, 163, 74, 255]);

const signature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  signature,
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(out, png);
console.log(`Wrote RGBA icon to ${out}`);
