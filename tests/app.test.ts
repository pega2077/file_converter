import fs from 'fs';
import path from 'path';
import request from 'supertest';
import type { Application } from 'express';

import { createApp } from '../src/app';
import { CONVERTED_DIR, STORAGE_ROOT, UPLOADS_DIR } from '../src/config/storage';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function emptyDirectory(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    return;
  }

  const entries = await fs.promises.readdir(dir);
  await Promise.all(
    entries.map(async (entry: string) => {
      const entryPath = path.join(dir, entry);
      const stats = await fs.promises.stat(entryPath);
      if (stats.isDirectory()) {
        await fs.promises.rm(entryPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(entryPath);
      }
    })
  );
}

describe('File Converter Service', () => {
  let app: Application;

  beforeAll(async () => {
    const context = await createApp();
    app = context.app;
  });

  beforeEach(async () => {
    await emptyDirectory(UPLOADS_DIR);
    await emptyDirectory(CONVERTED_DIR);
  });

  it('uploads a file successfully', async () => {
    const response = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('# Sample document'), 'sample.md');

    expect(response.status).toBe(201);
    expect(response.body.file.originalName).toBe('sample.md');
    expect(response.body.file.mimeType).toBeTruthy();

    const savedRelativePath = response.body.file.path as string;
    const savedAbsolutePath = path.resolve(STORAGE_ROOT, savedRelativePath);
    expect(fs.existsSync(savedAbsolutePath)).toBe(true);
  });

  it('creates and completes a conversion task', async () => {
    const uploadResponse = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('# Title'), 'sample.md');

    const sourceRelativePath = uploadResponse.body.file.path as string;

    const convertResponse = await request(app)
      .post('/convert')
      .send({
        sourcePath: sourceRelativePath,
        sourceFormat: 'markdown',
        targetFormat: 'html'
      });

    expect(convertResponse.status).toBe(202);
    const taskId = convertResponse.body.task.id as string;

    let taskStatus = 'pending';
    let downloadUrl: string | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await wait(50);
      const taskResponse = await request(app).get(`/tasks/${taskId}`);
      expect(taskResponse.status).toBe(200);
      taskStatus = taskResponse.body.task.status;
      if (taskStatus === 'completed' || taskStatus === 'failed') {
        downloadUrl = taskResponse.body.task.downloadUrl as string | undefined;
        if (taskStatus === 'completed') {
          expect(downloadUrl).toBeTruthy();
        }
        break;
      }
    }

    expect(taskStatus).toBe('completed');

    const downloadResponse = await request(app)
      .get(`/download/${taskId}`)
      .expect(200);

    expect(downloadResponse.header['content-disposition']).toContain('attachment');
    const downloadedContent = downloadResponse.text ?? (downloadResponse.body as Buffer).toString();
    expect(downloadedContent).toContain('# Title');
    expect(downloadUrl).toBeDefined();
    const finalDownloadUrl = downloadUrl as string;
    expect(finalDownloadUrl).toContain(`/download/${taskId}`);
  });

  it('returns supported formats', async () => {
    const response = await request(app).get('/formats');

    expect(response.status).toBe(200);
    expect(response.body.formats.source).toContain('markdown');
    expect(response.body.formats.source).toContain('pdf');
    expect(response.body.formats.target).toContain('html');
  });
});
