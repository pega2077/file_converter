# File Converter Service

A lightweight file conversion service built with Node.js, TypeScript, and Express. It orchestrates document conversions by invoking [Pandoc](https://pandoc.org/) via the command line and exposes three primary endpoints.

## Features

- **File upload** (`POST /upload`) – Accepts a multipart form upload (`file` field) and stores the file in `storage/uploads/`.
- **Conversion task creation** (`POST /convert`) – Submits a conversion job using Pandoc given a source file path, source format, and target format.
- **Task status lookup** (`GET /tasks/:id`) – Retrieves task metadata, including status, timestamps, and a download URL when the conversion succeeds.
- **Task download** (`GET /download/:id`) – Streams the converted asset directly using the task ID once processing has finished.
- **Formats listing** (`GET /formats`) – Returns the source/target formats that the service currently accepts.

## Prerequisites

- Node.js 18 or later.
- Pandoc installed locally and accessible via the `PANDOC_PATH` environment variable (defaults to `pandoc` on the system `PATH`).

## Getting Started

```bash
npm install
npm run build
npm start
```

For local development with automatic reloads:

```bash
npm run dev
```

## API Overview

### `POST /upload`

Multipart upload endpoint. Example using `curl`:

```bash
curl -F "file=@document.md" http://localhost:3000/upload
```

**Response**

```json
{
  "message": "File uploaded successfully.",
  "file": {
    "originalName": "document.md",
    "storedName": "1695662550000-1234abcd.md",
    "mimeType": "text/markdown",
    "size": 128,
    "path": "uploads/1695662550000-1234abcd.md"
  }
}
```

### `POST /convert`

Submit a conversion task. The `sourcePath` must be the relative path provided by `/upload` (e.g., `uploads/<filename>`); the service resolves it within the `storage/` directory.

```bash
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -d '{
        "sourcePath": "uploads/1695662550000-1234abcd.md",
        "sourceFormat": "markdown",
        "targetFormat": "html"
      }'
```

**Response**

```json
{
  "message": "Conversion task created successfully.",
  "task": {
    "id": "a1b2c3d4",
    "status": "pending",
    "sourcePath": "...",
    "createdAt": "2024-09-25T12:00:00.000Z"
  }
}
```

### `GET /tasks/:id`

Fetch task status and, when complete, retrieve the download URL for the converted file.

```bash
curl http://localhost:3000/tasks/a1b2c3d4
```

**Response (completed task)**

```json
{
  "task": {
    "id": "a1b2c3d4",
    "status": "completed",
    "downloadUrl": "http://localhost:3000/download/a1b2c3d4",
    "outputPath": "document-a1b2c3d4.html",
    "updatedAt": "2024-09-25T12:00:10.000Z"
  }
}
```

### `GET /download/:id`

Stream the converted file associated with a completed task directly to the caller.

```bash
curl -L -o output.html http://localhost:3000/download/a1b2c3d4
```

The response body is the file stream. HTTP 409 is returned if the task hasn't finished, and 404 if the task or its output cannot be found.

### `GET /formats`

Retrieve the list of supported source and target formats.

```bash
curl http://localhost:3000/formats
```

**Response**

```json
{
  "formats": {
    "source": ["markdown", "html", "docx", "pdf"],
    "target": ["markdown", "html", "docx", "pdf"]
  }
}
```

## Testing

Tests run against a simulated conversion (Pandoc is not invoked when `NODE_ENV=test`).

```bash
npm test
```

## Folder Structure

```
.
├── storage/
│   ├── converted/       # Target directory for converted files
│   └── uploads/         # Storage for uploaded source files
├── src/
│   ├── app.ts           # Express app factory
│   ├── index.ts         # Application entry point
│   ├── config/
│   ├── routes/
│   └── services/
└── tests/               # Automated tests
```

## Notes

- Tasks are maintained in memory. Restarting the server clears the task registry.
- Extend the `ConversionService` to persist tasks or integrate a job queue for production workloads.
- When `sourceFormat` is `pdf`, the service extracts text content via `unpdf` and feeds it to Pandoc as Markdown before creating the requested output.

### Deployment checklist

- **Install Pandoc on the target machine.** The service shells out to the `pandoc` executable for every conversion.
- **Set the `PANDOC_PATH` environment variable** if Pandoc is not on the default `PATH`. You can add it to the `.env` file or configure it at the process level.
- **Verify availability** by running `pandoc --version` (or the full path you configure) on the server before starting the Node.js process. The service will raise a clear error if it cannot spawn the executable.
