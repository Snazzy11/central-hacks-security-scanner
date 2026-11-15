export type DetectionMode = 'script' | 'ai';
export type OutputMode = 'redact' | 'replace';

export type FileStatus = 'processing' | 'completed' | 'failed';

export interface RedactionOptions {
  detectionMode: DetectionMode;
  outputMode: OutputMode;
}

export interface UploadedFile {
  id: number;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  mime_type: string | null;
  size: number;
  batch_id: string;
  sha256: string;
  detection_mode: DetectionMode;
  output_mode: OutputMode;
  status: FileStatus;
  created_at: string;
  summary: FileSummary | null; // set once completed
}

export interface UploadedFileList {
  batch_id: string;
  count: number;
  files: UploadedFile[];
}

/** What the backend found in a file (counts only, no PII). See backend/app/orchestrator/report.py */
export interface FileSummary {
  total: number; // every occurrence
  unique: number; // distinct values
  by_type: Record<string, number>; // entity type -> occurrences, most first
  message: string;
  words_scanned: number;
  elapsed_ms: number;
}
