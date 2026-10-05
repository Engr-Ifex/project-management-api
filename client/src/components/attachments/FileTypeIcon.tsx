import {
  File,
  FileArchive,
  FileCsv,
  FileDoc,
  FileImage,
  FilePdf,
  FilePpt,
  FileText,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { downloadBlob } from '@/lib/api';
import { KIND_TONE, fileKind } from '@/lib/attachments';
import type { FileKind } from '@/lib/attachments';
import { cn } from '@/lib/utils/cn';

const ICONS: Record<FileKind, typeof File> = {
  image: FileImage,
  pdf: FilePdf,
  document: FileDoc,
  spreadsheet: FileCsv,
  presentation: FilePpt,
  archive: FileArchive,
  text: FileText,
  other: File,
};

/**
 * An icon that says what kind of file this is.
 *
 * The type is also spelled out for assistive tech, because the icon is the only
 * carrier of the information — the filename alone does not say "spreadsheet".
 */
export const FileTypeIcon = ({
  filename,
  className,
}: {
  filename: string;
  className?: string;
}) => {
  const kind = fileKind(filename);
  const Icon = ICONS[kind];

  return (
    <span className={cn('shrink-0', KIND_TONE[kind], className)} title={kind}>
      <Icon aria-hidden className="size-3.5" />
      <span className="sr-only">{kind}</span>
    </span>
  );
};

/**
 * Fetches an authenticated attachment and exposes it as an object URL.
 *
 * Attachments are behind the session cookie, so `<img src="/api/...">` gets a
 * 401 — the bytes have to be fetched with credentials first. The URL is revoked
 * on unmount *and* whenever the path changes: a blob URL keeps its whole file in
 * memory for the lifetime of the document, and a table of images would otherwise
 * accumulate one per row forever.
 */
export const useAttachmentBlobUrl = (path: string, enabled: boolean) => {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let revoked = false;
    let revoke: (() => void) | undefined;

    void (async () => {
      try {
        const result = await downloadBlob(path);

        if (revoked) {
          result.revoke();

          return;
        }

        revoke = result.revoke;
        setUrl(result.url);
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      revoked = true;
      revoke?.();
      setUrl(undefined);
    };
  }, [path, enabled]);

  return { url, failed };
};

/**
 * A thumbnail for an image attachment, and nothing at all for anything else.
 *
 * Rendering a placeholder for a non-image would promise a preview that can never
 * arrive, so the caller gets `null` and keeps its own icon.
 */
export const ImagePreview = ({
  path,
  filename,
  className,
}: {
  path: string;
  filename: string;
  className?: string;
}) => {
  const { url, failed } = useAttachmentBlobUrl(path, true);

  if (failed) return null;

  if (!url) {
    return <span className={cn('block animate-pulse rounded bg-ink-100', className)} />;
  }

  return (
    <img
      src={url}
      alt={`Preview of ${filename}`}
      className={cn('rounded object-cover', className)}
    />
  );
};
