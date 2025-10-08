import express, { type Request, type Response } from 'express';
import path from 'path';

import { CONVERTED_DIR, ensureStorageDirectories } from './config/storage';
import { createConversionRouter } from './routes/conversion';
import { createDownloadRouter } from './routes/download';
import { formatsRouter } from './routes/formats';
import { createTaskRouter } from './routes/tasks';
import { uploadRouter } from './routes/upload';
import { ConversionService } from './services/conversionService';
import { TaskManager } from './services/taskManager';

export interface AppContext {
  app: express.Express;
  conversionService: ConversionService;
  taskManager: TaskManager;
}

export async function createApp(): Promise<AppContext> {
  await ensureStorageDirectories();

  const app = express();
  const taskManager = new TaskManager();
  const conversionService = new ConversionService(taskManager, {
    outputDirectory: CONVERTED_DIR,
    pandocPath: process.env.PANDOC_PATH,
    markitdownPath: process.env.MARKITDOWN_PATH,
    sofficePath: process.env.SOFFICE_PATH
  });
  console.log(`Using output directory: ${CONVERTED_DIR}`);
  console.log(`Using Pandoc executable at: ${conversionService.getPandocPath()}`);
  console.log(`Using Markitdown executable at: ${conversionService.getMarkitdownPath()}`);
  const sofficePath = conversionService.getSofficePath();
  console.log(`Using LibreOffice soffice executable at: ${sofficePath ?? 'not configured'}`);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir));

  app.use('/downloads', express.static(CONVERTED_DIR));

  app.use('/upload', uploadRouter);
  app.use('/convert', createConversionRouter(conversionService));
  app.use('/tasks', createTaskRouter(taskManager));
  app.use('/download', createDownloadRouter(taskManager));
  app.use('/formats', formatsRouter);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  return { app, conversionService, taskManager };
}
