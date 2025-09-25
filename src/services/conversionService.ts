import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { extractText } from 'unpdf';

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

interface PreparedSource {
  sourcePath: string;
  sourceFormat: string;
  cleanup: () => Promise<void>;
}

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
      const useSimulation = process.env.NODE_ENV === 'test';
      const preparation = useSimulation
        ? this.prepareSimulationSource(task)
        : await this.prepareSourceForPandoc(task);

      try {
        if (useSimulation) {
          await this.simulateConversion(task.sourcePath, outputPath);
        } else {
          await this.runPandoc(task, outputPath, preparation.sourcePath, preparation.sourceFormat);
        }
      } finally {
        await preparation.cleanup();
      }

      this.taskManager.attachResult(task.id, outputPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.taskManager.attachError(task.id, errorMessage);
    }
  }

  private prepareSimulationSource(task: ConversionTask): PreparedSource {
    return {
      sourcePath: task.sourcePath,
      sourceFormat: task.sourceFormat,
      cleanup: async () => {}
    };
  }

  private async prepareSourceForPandoc(task: ConversionTask): Promise<PreparedSource> {
    if (task.sourceFormat.toLowerCase() !== 'pdf') {
      return {
        sourcePath: task.sourcePath,
        sourceFormat: task.sourceFormat,
        cleanup: async () => {}
      };
    }

    const intermediatePath = this.buildIntermediateMarkdownPath(task.sourceFilename, task.id);
    await this.convertPdfToMarkdown(task.sourcePath, intermediatePath);

    return {
      sourcePath: intermediatePath,
      sourceFormat: 'markdown',
      cleanup: async () => {
        await fs.promises.unlink(intermediatePath).catch(() => undefined);
      }
    };
  }

  private buildIntermediateMarkdownPath(originalFilename: string, taskId: string): string {
    const parsed = path.parse(originalFilename);
    return path.join(this.outputDirectory, `${parsed.name}-${taskId}-intermediate.md`);
  }

  private async convertPdfToMarkdown(inputPath: string, outputPath: string): Promise<void> {
  const pdfBuffer: Buffer = await fs.promises.readFile(inputPath);
  const binaryData = new Uint8Array(pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength));
  const { text } = await extractText(binaryData, { mergePages: true });
  const markdownContent = Array.isArray(text) ? text.join('\n\n') : text;
    await fs.promises.writeFile(outputPath, markdownContent, 'utf8');
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

  private runPandoc(task: ConversionTask, outputPath: string, sourcePath: string, sourceFormat: string): Promise<void> {
    const args = [
      '--from',
      sourceFormat,
      '--to',
      task.targetFormat,
      sourcePath,
      '--output',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const pandoc = spawn(this.pandocPath, args);

      let stderr = '';
      pandoc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      pandoc.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          console.error(`Pandoc executable not found at "${this.pandocPath}".`);
          reject(new Error(`Failed to launch Pandoc at "${this.pandocPath}". Ensure Pandoc is installed on the server and the executable path is reachable (set PANDOC_PATH if necessary).`));
          return;
        }

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
