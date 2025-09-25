import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { ConversionTask } from '../types/task';
import { CreateTaskPayload, TaskManager } from './taskManager';

export interface ConversionRequest {
  sourceAbsolutePath: string;
  sourceRelativePath: string;
  sourceFormat: string;
  targetFormat: string;
  sourceFilename: string;
}

export interface ConversionServiceOptions {
  outputDirectory: string;
  pandocPath?: string;
}

const DEFAULT_PANDOC_PATH = process.env.PANDOC_PATH || 'pandoc';

export class ConversionService {
  private readonly outputDirectory: string;
  private readonly pandocPath: string;

  constructor(private readonly taskManager: TaskManager, options: ConversionServiceOptions) {
    this.outputDirectory = options.outputDirectory;
    this.pandocPath = options.pandocPath ?? DEFAULT_PANDOC_PATH;
  }

  async ensureDirectories(): Promise<void> {
    await fs.promises.mkdir(this.outputDirectory, { recursive: true });
  }

  async createConversionTask(request: ConversionRequest): Promise<ConversionTask> {
    await this.ensureDirectories();

    const taskId = this.generateTaskId();
    const task = this.taskManager.createTask({
      id: taskId,
      sourcePath: request.sourceAbsolutePath,
      sourceRelativePath: request.sourceRelativePath,
      sourceFormat: request.sourceFormat,
      targetFormat: request.targetFormat,
      sourceFilename: request.sourceFilename
    } satisfies CreateTaskPayload);

    void this.processTask(task);
    return task;
  }

  private async processTask(task: ConversionTask): Promise<void> {
    this.taskManager.setProcessing(task.id);

    const outputFilename = this.buildOutputFilename(task.sourceFilename, task.id, task.targetFormat);
    const outputPath = path.join(this.outputDirectory, outputFilename);

    try {
      if (process.env.NODE_ENV === 'test') {
        await this.simulateConversion(task.sourcePath, outputPath);
      } else {
        await this.runPandoc(task, outputPath);
      }

      this.taskManager.attachResult(task.id, outputPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.taskManager.attachError(task.id, errorMessage);
    }
  }

  private buildOutputFilename(originalFilename: string, taskId: string, targetFormat: string): string {
    const parsed = path.parse(originalFilename);
    const extension = this.normalizeExtension(targetFormat);
    return `${parsed.name}-${taskId}.${extension}`;
  }

  private normalizeExtension(format: string): string {
    return format.replace(/^\./, '');
  }

  private async simulateConversion(sourcePath: string, outputPath: string): Promise<void> {
    await fs.promises.copyFile(sourcePath, outputPath).catch(async () => {
      const sourceContent = await fs.promises.readFile(sourcePath, 'utf8');
      await fs.promises.writeFile(outputPath, sourceContent, 'utf8');
    });
  }

  private runPandoc(task: ConversionTask, outputPath: string): Promise<void> {
    const args = [
      '--from',
      task.sourceFormat,
      '--to',
      task.targetFormat,
      task.sourcePath,
      '--output',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const pandoc = spawn(this.pandocPath, args);

      let stderr = '';
      pandoc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      pandoc.on('error', (err: Error) => {
        reject(err);
      });

      pandoc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          const message = stderr || `Pandoc exited with code ${code}`;
          reject(new Error(message));
        }
      });
    });
  }

  private generateTaskId(): string {
    return randomUUID();
  }
}
