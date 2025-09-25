import express, { type Request, type Response } from 'express';
import path from 'path';

import { CONVERTED_DIR } from '../config/storage';
import { TaskManager } from '../services/taskManager';

export function createTaskRouter(taskManager: TaskManager): express.Router {
  const router = express.Router();

  router.get('/:taskId', (req: Request, res: Response) => {
    const { taskId } = req.params;
    const task = taskManager.getTask(taskId);

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const downloadUrl = task.status === 'completed' && task.outputPath
      ? `${req.protocol}://${req.get('host')}/download/${task.id}`
      : undefined;

    const relativeOutputPath = task.outputPath
      ? path.relative(CONVERTED_DIR, task.outputPath).replace(/\\/g, '/')
      : undefined;

    return res.json({
      task: {
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
      }
    });
  });

  return router;
}
