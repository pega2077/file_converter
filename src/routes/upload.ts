import express, { type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';

import { UPLOADS_DIR } from '../config/storage';

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
  const extension = path.extname(file.originalname);
  const uniqueName = `${Date.now()}-${randomUUID()}${extension}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

export const uploadRouter = express.Router();

uploadRouter.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const filePath = req.file.path.replace(/\\/g, '/');

  return res.status(201).json({
    message: 'File uploaded successfully.',
    file: {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: filePath
    }
  });
});
