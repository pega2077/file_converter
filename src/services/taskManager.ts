import { ConversionTask, TaskStatus } from '../types/task';

export interface CreateTaskPayload {
  id: string;
  sourcePath: string;
  sourceFormat: string;
  targetFormat: string;
  sourceFilename: string;
}

export class TaskManager {
  private readonly tasks = new Map<string, ConversionTask>();

  createTask(payload: CreateTaskPayload): ConversionTask {
    const task: ConversionTask = {
      ...payload,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.tasks.set(payload.id, task);
    return task;
  }

  updateStatus(id: string, status: TaskStatus, updates: Partial<ConversionTask> = {}): ConversionTask | undefined {
    const task = this.tasks.get(id);
    if (!task) {
      return undefined;
    }

    const nextTask: ConversionTask = {
      ...task,
      ...updates,
      status,
      updatedAt: new Date()
    };

    this.tasks.set(id, nextTask);
    return nextTask;
  }

  attachResult(id: string, outputPath: string): ConversionTask | undefined {
    return this.updateStatus(id, 'completed', { outputPath });
  }

  attachError(id: string, error: string): ConversionTask | undefined {
    return this.updateStatus(id, 'failed', { error });
  }

  setProcessing(id: string): ConversionTask | undefined {
    return this.updateStatus(id, 'processing');
  }

  getTask(id: string): ConversionTask | undefined {
    return this.tasks.get(id);
  }
}
