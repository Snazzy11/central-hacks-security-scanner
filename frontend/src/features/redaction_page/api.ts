import { api, request } from '@/lib/api';

import type { Capabilities, RedactionOptions, UploadedFile, UploadedFileList } from './types';

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

// get accepted types from api
export const fetchCapabilities = () => api<Capabilities>('/redact/capabilities');

export const fetchBatch = (batchId: string) => api<UploadedFileList>(`/redact/batches/${batchId}`);

/** Fetch the redacted copy (needs the auth header, so a plain link won't work) and save it. */
export async function downloadFile(file: UploadedFile) {
  const blob = await (await request(`/redact/${file.id}/download`)).blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = file.original_filename.replace(/(\.[^.]*)$/, '.redacted$1');
  link.click();
  URL.revokeObjectURL(link.href);
}
