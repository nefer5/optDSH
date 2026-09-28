import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sizeOf from 'image-size';

export const hash = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function imageInfo(src) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(src || '');
  if (!match) throw Error('Expected embedded PNG/JPEG/WebP image');
  const bytes = Buffer.from(match[2], 'base64');
  const info = sizeOf(bytes);
  if (!['png', 'jpg', 'webp'].includes(info.type) || !info.width || !info.height) throw Error('Invalid image bytes');
  if ((info.type === 'jpg' ? 'jpeg' : info.type) !== match[1]) throw Error('Image MIME does not match bytes');
  return {width: info.width, height: info.height, bytes: bytes.length, sha256: hash(bytes)};
}
export function localImage(file, baseDir = process.cwd()) {
  if (/^data:/.test(file || '')) { imageInfo(file); return file; }
  if (typeof file !== 'string' || /^(https?:|file:|\\\\)/i.test(file)) throw Error('Image must be a local file path');
  const bytes = fs.readFileSync(path.resolve(baseDir, file));
  const type = sizeOf(bytes).type;
  if (!['png', 'jpg', 'webp'].includes(type)) throw Error('Only PNG/JPEG/WebP supported');
  return `data:image/${type === 'jpg' ? 'jpeg' : type};base64,${bytes.toString('base64')}`;
}
export function contain(src, box) {
  const {width, height} = imageInfo(src);
  const ratio = Math.min(box.w / width, box.h / height);
  return {x: box.x + (box.w - width * ratio) / 2, y: box.y + (box.h - height * ratio) / 2, w: width * ratio, h: height * ratio};
}
