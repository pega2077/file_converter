import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';

import { TaskManager } from '../services/taskManager';

export function createDownloadRouter(taskManager: TaskManager): express.Router {
  const router = express.Router();

  router.get('/:taskId', (req: Request, res: Response) => {
    const { taskId } = req.params;
    const task = taskManager.getTask(taskId);

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    if (task.status !== 'completed' || !task.outputPath) {
      return res.status(409).json({
        message: 'Task is not completed yet or has no output.',
        status: task.status
      });
    }

    const filePath = task.outputPath;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Converted file not found on disk.' });
    }

    const fileName = path.basename(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const readStream = fs.createReadStream(filePath);
    readStream.on('error', (error: NodeJS.ErrnoException) => {
      if (!res.headersSent) {
        const status = error.code === 'ENOENT' ? 404 : 500;
        res.status(status).json({ message: 'Failed to read converted file.' });
      }
    });

    readStream.pipe(res);
    return undefined;
  });

  return router;
}
