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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', message);
    process.exit(1);
  }
}

void bootstrap();
