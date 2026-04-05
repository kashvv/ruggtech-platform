import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { SanityClient } from '@sanity/client';

const TEMP_DIR = path.join(process.cwd(), 'temp-images');
const WATERMARK_PATH = path.join(process.cwd(), 'assets', 'ruggtech-watermark.png');

export function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const REMBG_PATH = 'C:\\Users\\CashC\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\rembg.exe';

export function checkRembg(): boolean {
  const cmds = [
    `"${REMBG_PATH}" --version`,
    'rembg --version',
    'python -m rembg --version',
  ];
  for (const cmd of cmds) {
    try { execSync(cmd, { stdio: 'pipe', timeout: 5000 }); return true; } catch {}
  }
  return false;
}

export function getRembgCmd(): string {
  try {
    execSync(`"${REMBG_PATH}" --version`, { stdio: 'pipe', timeout: 5000 });
    return `"${REMBG_PATH}"`;
  } catch {}
  return 'rembg';
}

export function checkSharp(): boolean {
  try { require('sharp'); return true; } catch { return false; }
}

export function hasWatermarkFile(): boolean {
  return fs.existsSync(WATERMARK_PATH);
}

// Download a single image to temp dir
export async function downloadImage(imageUrl: string, destPath: string): Promise<string | null> {
  const res = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) return null; // skip tiny images
  fs.writeFileSync(destPath, buf);
  return destPath;
}

// Pre-download all images to temp folder
export async function predownloadImages(
  productName: string,
  imageUrls: string[],
): Promise<{ filepath: string; index: number }[]> {
  ensureTempDir();
  const results: { filepath: string; index: number }[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const ext = url.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'jpg';
    const slug = productName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g,'-').slice(0,40);
    const filename = `${slug}-${i + 1}.${ext}`;
    const destPath = path.join(TEMP_DIR, filename);

    // Skip if already downloaded
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 5000) {
      results.push({ filepath: destPath, index: i });
      continue;
    }

    try {
      const result = await downloadImage(url, destPath);
      if (result) results.push({ filepath: result, index: i });
    } catch {
      // skip failed downloads
    }
  }

  return results;
}

// Remove background using rembg Python CLI
export async function removeBackground(imagePath: string): Promise<string> {
  const ext = path.extname(imagePath);
  const outputPath = imagePath.replace(ext, '-nobg.png');
  const rembg = getRembgCmd();
  const cmds = [
    `${rembg} i "${imagePath}" "${outputPath}"`,
    `rembg i "${imagePath}" "${outputPath}"`,
    `python -m rembg i "${imagePath}" "${outputPath}"`,
  ];
  for (const cmd of cmds) {
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 90000 });
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) return outputPath;
    } catch {}
  }
  throw new Error('rembg failed');
}

// Add watermark using sharp
export async function addWatermark(imagePath: string): Promise<string> {
  const sharp = require('sharp');
  const opacity = parseFloat(process.env.WATERMARK_OPACITY || '1.0');
  const scale   = parseFloat(process.env.WATERMARK_SCALE   || '0.9');
  const gravity = process.env.WATERMARK_POSITION || 'centre';
  const ext = path.extname(imagePath);
  const outputPath = imagePath.replace(ext, '-wm' + ext);

  const meta = await sharp(imagePath).metadata();
  const imgWidth = meta.width || 800;
  const wmWidth = Math.round(imgWidth * scale);

  const watermark = await sharp(WATERMARK_PATH)
    .resize(wmWidth)
    .ensureAlpha()
    .composite([{
      input: Buffer.from([0, 0, 0, Math.round(255 * opacity)]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-in',
    }])
    .toBuffer();

  await sharp(imagePath)
    .composite([{ input: watermark, gravity }])
    .toFile(outputPath);

  return outputPath;
}

// Process images (BG removal + watermark) and upload to Sanity
export async function processAndUpload(
  downloadedFiles: { filepath: string; index: number }[],
  bgRemoveIndexes: number[],
  watermarkIndexes: number[],
  sanityClient: SanityClient,
): Promise<string[]> {
  const assetIds: string[] = [];

  for (const { filepath, index } of downloadedFiles) {
    let current = filepath;

    if (bgRemoveIndexes.includes(index)) {
      try { current = await removeBackground(current); } catch {}
    }
    if (watermarkIndexes.includes(index) && hasWatermarkFile()) {
      try { current = await addWatermark(current); } catch {}
    }

    if (!fs.existsSync(current)) continue;
    try {
      const buf = fs.readFileSync(current);
      const ext = path.extname(current).toLowerCase();
      const mime = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' } as Record<string,string>)[ext] || 'image/jpeg';
      const asset = await sanityClient.assets.upload('image', buf, {
        filename: path.basename(current),
        contentType: mime,
      });
      assetIds.push(asset._id);
    } catch (e: unknown) {
      console.error('Upload failed:', (e as Error).message);
    }
  }

  return assetIds;
}

// Cleanup temp dir
export function cleanupTemp() {
  if (!fs.existsSync(TEMP_DIR)) return;
  fs.readdirSync(TEMP_DIR).forEach(f => {
    if (f !== '.gitkeep') {
      try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch {}
    }
  });
}
