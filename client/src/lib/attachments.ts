/*
 * Attachment presentation.
 *
 * Every attachment used to render the same paperclip, which makes a list of
 * files unreadable at a glance — the one thing a file list is for. The kind is
 * derived from the extension, and only from the extension: the server validates
 * content by magic bytes, but the *client* has nothing but the name until it
 * downloads the file, and pretending otherwise would mean fetching every row.
 */

export type FileKind = 'image' | 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'archive' | 'text' | 'other';

const EXTENSIONS: Record<FileKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'],
  pdf: ['pdf'],
  document: ['doc', 'docx', 'odt', 'rtf'],
  spreadsheet: ['xls', 'xlsx', 'csv', 'ods'],
  presentation: ['ppt', 'pptx', 'odp'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz'],
  text: ['txt', 'md', 'log', 'json', 'yml', 'yaml'],
  other: [],
};

/** The extension, lowercased and without the dot. `''` when there is none. */
export const fileExtension = (filename: string): string => {
  const dot = filename.lastIndexOf('.');

  if (dot <= 0 || dot === filename.length - 1) return '';

  return filename.slice(dot + 1).toLowerCase();
};

export const fileKind = (filename: string): FileKind => {
  const extension = fileExtension(filename);

  for (const [kind, extensions] of Object.entries(EXTENSIONS) as [FileKind, string[]][]) {
    if (extensions.includes(extension)) return kind;
  }

  return 'other';
};

/** Only images can be previewed inline; everything else would need a viewer. */
export const isPreviewable = (filename: string): boolean => fileKind(filename) === 'image';

/**
 * The colour a file kind is tinted with. Deliberately a small, fixed palette
 * rather than a colour per extension — the icon already carries the exact type,
 * and eight hues in one column is noise.
 */
export const KIND_TONE: Record<FileKind, string> = {
  image: 'text-accent-600',
  pdf: 'text-danger-600',
  document: 'text-info-600',
  spreadsheet: 'text-success-600',
  presentation: 'text-warning-600',
  archive: 'text-body-muted',
  text: 'text-body-muted',
  other: 'text-body-subtle',
};
