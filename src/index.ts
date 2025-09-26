import 'dotenv/config';
import http from 'http';

import { createApp } from './app';

const port = Number(process.env.PORT ?? 3100);

async function bootstrap(): Promise<void> {
  try {
    const { app } = await createApp();
    const server = http.createServer(app);

    server.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`File conversion service listening on port ${port}`);
      const host = (process.env.HOST ?? 'localhost').trim() || 'localhost';
      const url = `http://${host}:${port}/`;
      // eslint-disable-next-line no-console
      console.log(`Open ${url}`);
      if (process.env.PUBLIC_BASE_URL) {
        // eslint-disable-next-line no-console
        console.log(`Public base URL: ${process.env.PUBLIC_BASE_URL}`);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', message);
    process.exit(1);
  }
}

void bootstrap();
