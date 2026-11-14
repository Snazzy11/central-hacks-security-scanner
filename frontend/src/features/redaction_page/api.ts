import { api } from '@/lib/api';

import type { RedactionOptions, UploadedFileList } from './types';

// Keep these in sync with MAX_FILES / MAX_TOTAL_SIZE in backend/app/api/routes/redact.py
export const MAX_FILES = 20;
export const MAX_TOTAL_SIZE = 50 * 1024 ** 2;

export function uploadFiles({ files, detectionMode, outputMode }: RedactionOptions & { files: File[] }) {
  const body = new FormData();
  body.append('detection_mode', detectionMode);
  body.append('output_mode', outputMode);
  for (const file of files) body.append('files', file);
  return api<UploadedFileList>('/redact/multiple', { method: 'POST', body });
}
