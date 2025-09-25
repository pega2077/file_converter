import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const STORAGE_ROOT = path.resolve(ROOT, 'storage');

export const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
export const CONVERTED_DIR = path.join(STORAGE_ROOT, 'converted');

export async function ensureStorageDirectories(): Promise<void> {
  await Promise.all([
    fs.promises.mkdir(STORAGE_ROOT, { recursive: true }),
    fs.promises.mkdir(UPLOADS_DIR, { recursive: true }),
    fs.promises.mkdir(CONVERTED_DIR, { recursive: true })
  ]);
}
