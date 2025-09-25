import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';

import { ConversionService } from '../services/conversionService';

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

    const normalizedSourcePath = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.resolve(sourcePath);

    if (!fs.existsSync(normalizedSourcePath)) {
      return res.status(404).json({
        message: 'Source file not found.',
        sourcePath: normalizedSourcePath
      });
    }

    try {
      const task = await conversionService.createConversionTask({
        sourcePath: normalizedSourcePath,
        sourceFormat,
        targetFormat,
        sourceFilename: sourceFilename ?? path.basename(normalizedSourcePath)
      });

      return res.status(202).json({
        message: 'Conversion task created successfully.',
        task
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error.';
      return res.status(500).json({ message: errorMessage });
    }
  });

  return router;
}
