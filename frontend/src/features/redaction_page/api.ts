export interface UploadResponse {
  filename: string;
  original_filename: string;
  content_type: string;
  size: number;
  location: string;
}

export async function uploadRedactionFile(
  file: File,
): Promise<UploadResponse> {
  const formData = new FormData();

  formData.append('file', file);

  const response = await fetch('/api/redact/single', {
    method: 'POST',
    body: formData,
    // Add your authentication headers here if needed.
    // Do NOT manually set Content-Type.
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);

    throw new Error(
      error?.detail ?? 'Failed to upload file',
    );
  }

  return response.json();
}
