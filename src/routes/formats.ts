import express, { type Request, type Response } from 'express';

import {
  SUPPORTED_SOURCE_FORMATS,
  SUPPORTED_TARGET_FORMATS
} from '../config/formats';

export const formatsRouter = express.Router();

formatsRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    formats: {
      source: SUPPORTED_SOURCE_FORMATS,
      target: SUPPORTED_TARGET_FORMATS
    }
  });
});
