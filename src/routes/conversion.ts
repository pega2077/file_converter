import express, { type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';

import { ConversionService } from '../services/conversionService';
import { CONVERTED_DIR, STORAGE_ROOT, UPLOADS_DIR } from '../config/storage';

interface ConvertRequestBody {
  sourcePath: string;
  sourceFormat: string;
  targetFormat: string;
  sourceFilename?: string;
}

export function createConversionRouter(conversionService: ConversionService): express.Router {
  const router = express.Router();
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname);
      const uniqueName = `${Date.now()}-${randomUUID()}${extension}`;
      cb(null, uniqueName);
    }
  });
  const upload = multer({ storage });

  function buildDownloadUrl(req: Request, taskId: string): string | undefined {
    const host = req.get('host');

    if (!host) {
      return undefined;
    }

    const protocol = req.protocol;
    const base = `${protocol}://${host}`;

    try {
      return new URL(`download/${encodeURIComponent(taskId)}`, base).toString();
    } catch (_error) {
      return undefined;
    }
  }

  router.post('/', async (req: Request, res: Response) => {
    const { sourcePath, sourceFormat, targetFormat, sourceFilename } = req.body as ConvertRequestBody;

    if (!sourcePath || !sourceFormat || !targetFormat) {
      return res.status(400).json({
        message: 'sourcePath, sourceFormat, and targetFormat are required.'
      });
    }

    if (path.isAbsolute(sourcePath)) {
      return res.status(400).json({
        message: 'sourcePath must be a path relative to the storage directory.'
      });
    }

    const normalizedRelativePath = path.normalize(sourcePath).replace(/\\/g, '/');
    const absoluteSourcePath = path.resolve(STORAGE_ROOT, normalizedRelativePath);
    const safeRelativePath = path.relative(STORAGE_ROOT, absoluteSourcePath);

    if (safeRelativePath.startsWith('..') || path.isAbsolute(safeRelativePath)) {
      return res.status(400).json({
        message: 'sourcePath must resolve within the storage directory.'
      });
    }

    if (!fs.existsSync(absoluteSourcePath)) {
      return res.status(404).json({
        message: 'Source file not found.',
        sourcePath
      });
    }

    try {
      const task = await conversionService.createConversionTask({
        sourceAbsolutePath: absoluteSourcePath,
        sourceRelativePath: safeRelativePath.replace(/\\/g, '/'),
        sourceFormat,
        targetFormat,
        sourceFilename: sourceFilename ?? path.basename(absoluteSourcePath)
      });

      return res.status(202).json({
        message: 'Conversion task created successfully.',
        task: {
          id: task.id,
          status: task.status,
          sourcePath: task.sourceRelativePath,
          sourceFormat: task.sourceFormat,
          targetFormat: task.targetFormat,
          sourceFilename: task.sourceFilename,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error.';
      return res.status(500).json({ message: errorMessage });
    }
  });

  router.post('/sync', upload.single('file'), async (req: Request, res: Response) => {
    const targetFormat = typeof req.body?.targetFormat === 'string' ? req.body.targetFormat.trim() : '';
    let sourceFormat = typeof req.body?.sourceFormat === 'string' ? req.body.sourceFormat.trim() : '';
    const overrideSourceFilename = typeof req.body?.sourceFilename === 'string' ? req.body.sourceFilename : undefined;

    if (!req.file) {
      return res.status(400).json({ message: 'File is required.' });
    }

    if (!targetFormat) {
      return res.status(400).json({ message: 'targetFormat is required.' });
    }

    if (!sourceFormat) {
      const inferred = path.extname(req.file.originalname).replace(/^\./, '');
      sourceFormat = inferred || '';
    }

    if (!sourceFormat) {
      return res.status(400).json({ message: 'sourceFormat is required when it cannot be inferred from the filename.' });
    }

    const absoluteSourcePath = req.file.path;
    const normalizedRelativePath = path.relative(STORAGE_ROOT, absoluteSourcePath).replace(/\\/g, '/');
    const sourceFilename = overrideSourceFilename ?? req.file.originalname;

    try {
      const task = await conversionService.convertSynchronously({
        sourceAbsolutePath: absoluteSourcePath,
        sourceRelativePath: normalizedRelativePath,
        sourceFormat,
        targetFormat,
        sourceFilename
      });

      const downloadUrl = task.status === 'completed' && task.outputPath
        ? buildDownloadUrl(req, task.id)
        : undefined;

      const relativeOutputPath = task.outputPath
        ? path.relative(CONVERTED_DIR, task.outputPath).replace(/\\/g, '/')
        : undefined;

      const payload = {
        id: task.id,
        status: task.status,
        sourcePath: task.sourceRelativePath,
        sourceFormat: task.sourceFormat,
        targetFormat: task.targetFormat,
        sourceFilename: task.sourceFilename,
        outputPath: relativeOutputPath,
        error: task.error,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        downloadUrl
      };

      if (task.status === 'failed') {
        const message = task.error ?? 'Conversion failed.';
        return res.status(500).json({
          message,
          task: payload
        });
      }

      return res.status(200).json({
        message: 'Conversion completed successfully.',
        task: payload
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error.';
      return res.status(500).json({ message: errorMessage });
    }
  });

  return router;
}
