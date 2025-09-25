export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ConversionTask {
  id: string;
  sourcePath: string;
  sourceRelativePath: string;
  sourceFormat: string;
  targetFormat: string;
  sourceFilename: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  outputPath?: string;
  error?: string;
}
