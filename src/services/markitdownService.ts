import { spawn } from 'child_process';
import path from 'path';

export interface MarkitdownServiceOptions {
  executablePath?: string;
}

export interface MarkitdownConvertOptions {
  sourcePath: string;
  outputPath: string;
  sourceFormat?: string;
}

const DEFAULT_MARKITDOWN_PATH = process.env.MARKITDOWN_PATH ?? 'markitdown';

export class MarkitdownService {
  private readonly executablePath: string;

  constructor(options: MarkitdownServiceOptions = {}) {
    this.executablePath = options.executablePath ?? DEFAULT_MARKITDOWN_PATH;
  }

  getExecutablePath(): string {
    return this.executablePath;
  }

  async convert(options: MarkitdownConvertOptions): Promise<void> {
    const args = [options.sourcePath, '-o', options.outputPath];
    const extensionHint = this.getExtensionHint(options);

    if (extensionHint) {
      args.push('--extension', extensionHint);
    }
    console.log(`Executing markitdown with args: ${args.join(' ')}`);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.executablePath, args);

      let stderr = '';
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        console.error(`markitdown stderr: ${data.toString()}`);
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          console.error(`Markitdown executable not found at "${this.executablePath}".`);
          reject(new Error(`Markitdown executable not found at "${this.executablePath}". Install markitdown or set MARKITDOWN_PATH to the executable location.`));
          return;
        }

        reject(error);
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          const message = stderr || `markitdown exited with code ${code}`;
          reject(new Error(message));
        }
      });
    });
  }

  private getExtensionHint(options: MarkitdownConvertOptions): string | undefined {
    if (options.sourceFormat) {
      const normalized = options.sourceFormat.trim().replace(/^\./, '').toLowerCase();
      if (normalized) {
        return normalized;
      }
    }

    const ext = path.extname(options.sourcePath);
    if (ext) {
      return ext.replace(/^\./, '').toLowerCase();
    }

    return undefined;
  }
}
