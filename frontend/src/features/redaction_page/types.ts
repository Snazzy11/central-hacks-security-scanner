export type DetectionMode = 'script' | 'ai';
export type OutputMode = 'redact' | 'replace';

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
  sha256: string;
  detection_mode: DetectionMode;
  output_mode: OutputMode;
  status: string;
  created_at: string;
}

export interface UploadedFileList {
  count: number;
  files: UploadedFile[];
}
