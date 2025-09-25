import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';

import { ConversionService } from '../services/conversionService';
import { STORAGE_ROOT } from '../config/storage';

interface ConvertRequestBody {
  sourcePath: string;
  sourceFormat: string;
  targetFormat: string;
  sourceFilename?: string;
}

export function createConversionRouter(conversionService: ConversionService): express.Router {
  const router = express.Router();

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

  return router;
}
