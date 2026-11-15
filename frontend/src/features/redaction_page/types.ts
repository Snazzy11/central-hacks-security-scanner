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
  summary: FileSummary | null;
}

export interface UploadedFileList {
  batch_id: string;
  count: number;
  files: UploadedFile[];
}

// see backend/app/orchestrator/report.py
export interface FileSummary {
  total: number;
  unique: number;
  by_type: Record<string, number>; // most first
  message: string;
  words_scanned: number;
  elapsed_ms: number;
}
