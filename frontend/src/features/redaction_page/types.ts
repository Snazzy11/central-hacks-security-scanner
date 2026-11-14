export interface UploadedFile {
  id: number;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  mime_type: string | null;
  size: number;
  sha256: string;
  status: string;
  created_at: string;
}

export interface UploadedFileList {
  count: number;
  files: UploadedFile[];
}
