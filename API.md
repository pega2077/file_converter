# File Converter Service API

This document describes the HTTP endpoints exposed by the file converter service. The service accepts document uploads, submits background conversion jobs powered by Pandoc, and allows clients to poll for completion and download the converted result.

- **Base URL (default)**: `http://localhost:3100`
- **Dependencies**: Pandoc must be installed and accessible on the host machine (via `PANDOC_PATH` or `PATH`).

## Authentication

No authentication is required by default. Add middleware in `src/app.ts` if auth is desired.

## Status Lifecycle

| Status       | Meaning                                                               |
|--------------|-----------------------------------------------------------------------|
| `pending`    | Task registered but not yet picked up for processing.                  |
| `processing` | Pandoc conversion is in progress.                                      |
| `completed`  | Conversion finished successfully; output file is ready for download.   |
| `failed`     | Conversion encountered an error. See `task.error` for details.         |

## Endpoints

### 1. Upload File

```
POST /upload
Content-Type: multipart/form-data
Field: file (required)
```

Uploads a single file that will later be converted. The file is stored under `storage/uploads/`.

**Sample Request**

```bash
curl -X POST http://localhost:3100/upload \
  -F "file=@/absolute/path/to/sample.md"
```

**Successful Response (201)**

```json
{
  "message": "File uploaded successfully.",
  "file": {
    "originalName": "sample.md",
    "storedName": "1695662550000-2f5aa3a8-85f4-46ce-8b36-6f14eac823b5.md",
    "mimeType": "text/markdown",
    "size": 128,
    "path": "uploads/1695662550000-2f5aa3a8-85f4-46ce-8b36-6f14eac823b5.md"
  }
}
```

### 2. Create Conversion Task

```
POST /convert
Content-Type: application/json
```

Registers a conversion job for Pandoc to execute. The service schedules the work asynchronously and immediately returns task metadata. The `sourcePath` must be the relative path returned by the upload endpoint (e.g., `uploads/<filename>`).

**Request Body**

| Field           | Type   | Required | Description                                                                 |
|-----------------|--------|----------|-----------------------------------------------------------------------------|
| `sourcePath`    | string | ✅        | Relative path under `storage/` (e.g., `uploads/<filename>` from `/upload`). |
| `sourceFormat`  | string | ✅        | Pandoc input format (e.g., `markdown`, `docx`, `html`).                     |
| `targetFormat`  | string | ✅        | Pandoc output format (e.g., `pdf`, `html`, `docx`).                         |
| `sourceFilename`| string | ❌        | Optional override for the original filename shown in task metadata.         |

**Sample Request**

```bash
curl -X POST http://localhost:3100/convert \
  -H "Content-Type: application/json" \
  -d '{
        "sourcePath": "uploads/1695662550000-2f5aa3a8-85f4-46ce-8b36-6f14eac823b5.md",
        "sourceFormat": "markdown",
        "targetFormat": "html"
      }'
```

**Accepted Response (202)**

```json
{
  "message": "Conversion task created successfully.",
  "task": {
    "id": "1c3f4ff9-2c8c-4d22-9d47-3d72b95ce3f2",
    "sourcePath": "uploads/1695662550000-2f5aa3a8-85f4-46ce-8b36-6f14eac823b5.md",
    "sourceFormat": "markdown",
    "targetFormat": "html",
    "sourceFilename": "sample.md",
    "status": "pending",
    "createdAt": "2025-09-25T08:00:00.000Z",
    "updatedAt": "2025-09-25T08:00:00.000Z"
  }
}
```

### 3. Query Task Status

```
GET /tasks/{taskId}
```

Retrieves the latest state of a conversion task. When `status` becomes `completed`, both a relative `outputPath` and an HTTP `downloadUrl` are provided.

**Sample Request**

```bash
curl http://localhost:3100/tasks/1c3f4ff9-2c8c-4d22-9d47-3d72b95ce3f2
```

**Successful Response (200)**

```json
{
  "task": {
    "id": "1c3f4ff9-2c8c-4d22-9d47-3d72b95ce3f2",
    "status": "completed",
    "sourcePath": "uploads/1695662550000-2f5aa3a8-85f4-46ce-8b36-6f14eac823b5.md",
    "sourceFormat": "markdown",
    "targetFormat": "html",
    "sourceFilename": "sample.md",
    "outputPath": "sample-1c3f4ff9-2c8c-4d22-9d47-3d72b95ce3f2.html",
    "error": null,
    "createdAt": "2025-09-25T08:00:00.000Z",
    "updatedAt": "2025-09-25T08:00:10.000Z",
  "downloadUrl": "http://localhost:3100/download/1c3f4ff9-2c8c-4d22-9d47-3d72b95ce3f2"
  }
}
```

**Error Responses**

- `404 Not Found` – Task ID does not exist.

### 4. Download Converted File

```
GET /download/{taskId}
```

Streams the converted file associated with the given task ID. Returns HTTP 409 if the task is not yet completed, or 404 if the task or output file cannot be located.

**Sample Request**

```bash
curl -L -o sample.html http://localhost:3100/download/1c3f4ff9-2c8c-4d22-9d47-3d72b95ce3f2
```

### 5. Health Check *(optional)*

```
GET /health
```

Returns service liveness information.

```json
{ "status": "ok" }
```

## End-to-End Workflow

1. **Upload** the source document via `POST /upload` and capture `file.path`.
2. **Submit** a conversion task via `POST /convert`, providing the captured `file.path`.
3. **Poll** `GET /tasks/{taskId}` until status is `completed` or `failed`.
4. **Download** the converted asset using the returned `downloadUrl` (`GET /download/{taskId}`).

## Windows Command Prompts

- **PowerShell**: the JSON examples above work as-is because single quotes wrap the payload.
- **Command Prompt (`cmd.exe`)**: escape double quotes inside the `-d` argument, e.g.,
  ```cmd
  curl -X POST http://localhost:3100/convert -H "Content-Type: application/json" -d "{\"sourcePath\":\"C:/path/to/file.md\",\"sourceFormat\":\"markdown\",\"targetFormat\":\"html\"}"
  ```

## Notes

- During automated tests (`NODE_ENV=test`), Pandoc is not invoked; file copies simulate conversions.
- Task metadata is stored in memory. Restarting the service clears existing tasks and converted files.
