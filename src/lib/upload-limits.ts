export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const MAX_UPLOAD_LABEL = '5 MB'

export function isUploadTooLarge(file: Pick<File, 'size'>): boolean {
  return file.size > MAX_UPLOAD_BYTES
}
