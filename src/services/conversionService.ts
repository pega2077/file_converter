import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { extractText } from 'unpdf';

import { ConversionTask } from '../types/task';
import { CreateTaskPayload, TaskManager } from './taskManager';
import { MarkitdownService } from './markitdownService';

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
  markitdownPath?: string;
  markitdownService?: MarkitdownService;
  sofficePath?: string;
}

const DEFAULT_PANDOC_PATH = process.env.PANDOC_PATH || 'pandoc';
const DEFAULT_SOFFICE_PATH = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';

interface PreparedSource {
  sourcePath: string;
  sourceFormat: string;
  cleanup: () => Promise<void>;
}

type ConversionStrategy = 'simulation' | 'markitdown' | 'pandoc';

export class ConversionService {
  private readonly outputDirectory: string;
  private readonly pandocPath: string;
  private readonly markitdownService: MarkitdownService;
  private readonly sofficePath?: string;
  private sofficeAvailability?: boolean;

  constructor(private readonly taskManager: TaskManager, options: ConversionServiceOptions) {
    this.outputDirectory = options.outputDirectory;
    this.pandocPath = options.pandocPath ?? DEFAULT_PANDOC_PATH;
    this.markitdownService = options.markitdownService ?? new MarkitdownService({ executablePath: options.markitdownPath });
    const configuredSoffice = options.sofficePath ?? process.env.SOFFICE_PATH ?? DEFAULT_SOFFICE_PATH;
    this.sofficePath = configuredSoffice?.trim() ? configuredSoffice : undefined;
  }

  getPandocPath(): string {
    return this.pandocPath;
  }

  getMarkitdownPath(): string {
    return this.markitdownService.getExecutablePath();
  }

  getSofficePath(): string | undefined {
    return this.sofficePath;
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

  async convertSynchronously(request: ConversionRequest): Promise<ConversionTask> {
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

    await this.processTask(task);

    const finalTask = this.taskManager.getTask(taskId);
    if (!finalTask) {
      throw new Error('Task not found after synchronous processing.');
    }

    return finalTask;
  }

  private async processTask(task: ConversionTask): Promise<void> {
    this.taskManager.setProcessing(task.id);

    const outputFilename = this.buildOutputFilename(task.sourceFilename, task.id, task.targetFormat);
    const outputPath = path.join(this.outputDirectory, outputFilename);

    try {
      const legacyPreparation = await this.prepareLegacyOfficeSource(task);
      const effectiveTask: ConversionTask = {
        ...task,
        sourcePath: legacyPreparation.sourcePath,
        sourceFormat: legacyPreparation.sourceFormat
      };

      try {
        const strategy = this.resolveStrategy(effectiveTask);
        const preparation = await this.prepareSource(effectiveTask, strategy);

        try {
          if (strategy === 'simulation') {
            await this.simulateConversion(preparation.sourcePath, outputPath);
          } else if (strategy === 'markitdown') {
            await this.markitdownService.convert({
              sourcePath: preparation.sourcePath,
              outputPath,
              sourceFormat: preparation.sourceFormat
            });
          } else {
            await this.runPandoc(effectiveTask, outputPath, preparation.sourcePath, preparation.sourceFormat);
          }
        } finally {
          await preparation.cleanup();
        }
      } finally {
        await legacyPreparation.cleanup();
      }

      this.taskManager.attachResult(task.id, outputPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.taskManager.attachError(task.id, errorMessage);
    }
  }

  private resolveStrategy(task: ConversionTask): ConversionStrategy {
    if (process.env.NODE_ENV === 'test') {
      return 'simulation';
    }

    return this.shouldUseMarkitdown(task.targetFormat) ? 'markitdown' : 'pandoc';
  }

  private async prepareSource(task: ConversionTask, strategy: ConversionStrategy): Promise<PreparedSource> {
    if (strategy === 'pandoc') {
      return await this.prepareSourceForPandoc(task);
    }

    return this.preparePassThroughSource(task);
  }

  private async prepareLegacyOfficeSource(task: ConversionTask): Promise<PreparedSource> {
    const mapping = this.getLegacyOfficeMapping(task.sourceFormat);
    if (!mapping) {
      return this.preparePassThroughSource(task);
    }

    const sofficePath = this.sofficePath;
    if (!sofficePath) {
      return this.preparePassThroughSource(task);
    }

    const available = await this.isSofficeAvailable(sofficePath);
    if (!available) {
      return this.preparePassThroughSource(task);
    }

    const tempDir = await fs.promises.mkdtemp(path.join(this.outputDirectory, 'soffice-'));

    try {
      const args = [
        '--headless',
        '--convert-to',
        mapping.targetExtension,
        task.sourcePath,
        '--outdir',
        tempDir
      ];

      await this.spawnLibreOffice(sofficePath, args);

      const convertedFiles = await fs.promises.readdir(tempDir);
      const lowerSuffix = `.${mapping.targetExtension}`;
      const convertedFile = convertedFiles.find((file) => file.toLowerCase().endsWith(lowerSuffix));

      if (!convertedFile) {
        throw new Error(`LibreOffice conversion completed without producing a "${mapping.targetExtension}" output.`);
      }

      const convertedPath = path.join(tempDir, convertedFile);

      return {
        sourcePath: convertedPath,
        sourceFormat: mapping.targetExtension,
        cleanup: async () => {
          await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
      };
    } catch (error) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  private preparePassThroughSource(task: ConversionTask): PreparedSource {
    return {
      sourcePath: task.sourcePath,
      sourceFormat: task.sourceFormat,
      cleanup: async () => {}
    };
  }

  private getLegacyOfficeMapping(format: string): { targetExtension: string } | undefined {
    const normalized = format.trim().toLowerCase();

    switch (normalized) {
      case 'doc':
        return { targetExtension: 'docx' };
      case 'ppt':
        return { targetExtension: 'pptx' };
      case 'xls':
        return { targetExtension: 'xlsx' };
      default:
        return undefined;
    }
  }

  private async isSofficeAvailable(sofficePath: string): Promise<boolean> {
    if (this.sofficeAvailability !== undefined) {
      return this.sofficeAvailability;
    }

    try {
      await fs.promises.access(sofficePath, fs.constants.F_OK);
      this.sofficeAvailability = true;
    } catch {
      this.sofficeAvailability = false;
    }

    return this.sofficeAvailability;
  }

  private spawnLibreOffice(executable: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const libProcess = spawn(executable, args);

      let stderr = '';
      libProcess.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      libProcess.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(new Error(`LibreOffice executable not found at "${executable}".`));
          return;
        }

        reject(error);
      });

      libProcess.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          const message = stderr.trim() || `LibreOffice exited with code ${code}`;
          reject(new Error(message));
        }
      });
    });
  }

  private shouldUseMarkitdown(targetFormat: string): boolean {
    // const normalized = targetFormat.trim().toLowerCase();
    // return normalized === 'markdown' || normalized === 'md';
    return false; // Temporarily disable Markitdown usage
  }

  private async prepareSourceForPandoc(task: ConversionTask): Promise<PreparedSource> {
    if (task.sourceFormat.toLowerCase() !== 'pdf') {
      return this.preparePassThroughSource(task);
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
    const normalized = format.replace(/^\./, '').toLowerCase();

    switch (normalized) {
      case 'markdown':
      case 'md':
        return 'md';
      case 'text':
      case 'txt':
      case 'plain':
        return 'txt';
      default:
        return normalized;
    }
  }

  private async simulateConversion(sourcePath: string, outputPath: string): Promise<void> {
    await fs.promises.copyFile(sourcePath, outputPath).catch(async () => {
      const sourceContent = await fs.promises.readFile(sourcePath, 'utf8');
      await fs.promises.writeFile(outputPath, sourceContent, 'utf8');
    });
  }

  private runPandoc(task: ConversionTask, outputPath: string, sourcePath: string, sourceFormat: string): Promise<void> {
    const normalizedSourceFormat = this.normalizeFormatForPandoc(sourceFormat);
    const normalizedTargetFormat = this.normalizeFormatForPandoc(task.targetFormat);

    const args = [
      '--from',
      normalizedSourceFormat,
      '--to',
      normalizedTargetFormat,
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

  private normalizeFormatForPandoc(format: string): string {
    const normalized = format.trim().toLowerCase();

    switch (normalized) {
      case 'markdown':
      case 'md':
        return 'markdown';
      case 'text':
      case 'txt':
      case 'plain':
        return 'plain';
      case 'htm':
        return 'html';
      default:
        return normalized;
    }
  }
}
