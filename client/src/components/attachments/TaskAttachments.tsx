import { DownloadSimple, Trash, UploadSimple } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { FileTypeIcon, ImagePreview } from '@/components/attachments/FileTypeIcon';
import { Button, ConfirmDialog, ErrorState, SkeletonList } from '@/components/ui';
import type { Attachment } from '@/lib/api';
import { attachmentsApi, downloadBlob, refName } from '@/lib/api';
import { isPreviewable } from '@/lib/attachments';
import { ALLOWED_ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_BYTES } from '@/lib/constants';
import { useAsync, useMutation } from '@/lib/hooks';
import { extensionOf, formatBytes } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * Attachments on a single task.
 *
 * `listForTask`/`uploadToTask` existed from the start and were never called —
 * a file could only ever be attached to the whole project, which is the wrong
 * granularity for "the screenshot in this bug report".
 *
 * Deletion goes through the **project**-scoped endpoint, which is the only one
 * the API exposes: it looks the attachment up by id within the project, so a
 * task attachment is removed by the same call.
 *
 * Downloads are authenticated, so they follow the same blob dance as the project
 * tab — a plain link would 401.
 */
export const TaskAttachments = ({
  taskId,
  canUpload,
}: {
  taskId: string;
  canUpload: boolean;
}) => {
  const { workspaceId, projectId } = useTaskScope();
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, error, loading, reload } = useAsync(
    () => attachmentsApi.listForTask(workspaceId, projectId, taskId, { limit: 50 }),
    [workspaceId, projectId, taskId]
  );

  const upload = useMutation((file: File) =>
    attachmentsApi.uploadToTask(workspaceId, projectId, taskId, file, setProgress)
  );
  const remove = useMutation((attachmentId: string) =>
    attachmentsApi.remove(workspaceId, projectId, attachmentId)
  );

  const attachments = data?.attachments ?? [];

  const onFileChosen = async (file: File | undefined) => {
    setLocalError(undefined);
    setProgress(undefined);
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setLocalError(`"${file.name}" is ${formatBytes(file.size)}. The limit is 10 MB.`);
      return;
    }

    if (
      !ALLOWED_ATTACHMENT_EXTENSIONS.includes(
        extensionOf(file.name) as (typeof ALLOWED_ATTACHMENT_EXTENSIONS)[number]
      )
    ) {
      setLocalError(`".${extensionOf(file.name)}" is not an allowed file type.`);
      return;
    }

    const outcome = await upload.run(file);
    if (outcome.ok) reload();

    setProgress(undefined);
    if (fileInput.current) fileInput.current.value = '';
  };

  const onDownload = async (attachment: Attachment) => {
    setLocalError(undefined);

    try {
      const { url, revoke } = await downloadBlob(
        attachmentsApi.downloadPath(workspaceId, projectId, attachment._id)
      );

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.originalFilename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      revoke();
    } catch {
      setLocalError('That file could not be downloaded.');
    }
  };

  if (error) {
    return (
      <ErrorState title="Could not load attachments" description={error.message} onRetry={reload} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canUpload && (
        <>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(event) => void onFileChosen(event.target.files?.[0])}
          />

          <div>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<UploadSimple aria-hidden />}
              loading={upload.loading}
              onClick={() => fileInput.current?.click()}
            >
              Attach a file
            </Button>
          </div>
        </>
      )}

      {(localError ?? upload.error?.message) && (
        <p role="alert" className="text-xs text-danger-700">
          {localError ?? upload.error?.message}
        </p>
      )}

      {progress !== undefined && (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100"
          >
            <div
              className="h-full rounded-full bg-accent-500 transition-[width] duration-150 ease-standard"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-2xs text-body-subtle" data-numeric>
            Uploading… {progress}%
          </p>
        </div>
      )}

      {loading && <SkeletonList rows={2} />}

      {!loading && attachments.length === 0 && (
        <p className="text-sm text-body-subtle">No files on this task yet.</p>
      )}

      {!loading && attachments.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-subtle">
          {attachments.map((attachment) => (
            <li key={attachment._id} className="flex items-center gap-3 py-2">
              {isPreviewable(attachment.originalFilename) ? (
                <ImagePreview
                  path={attachmentsApi.downloadPath(workspaceId, projectId, attachment._id)}
                  filename={attachment.originalFilename}
                  className="size-8 shrink-0 border border-line"
                />
              ) : (
                <FileTypeIcon filename={attachment.originalFilename} />
              )}

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-body">{attachment.originalFilename}</span>
                <span className="text-2xs text-body-subtle" data-numeric>
                  {formatBytes(attachment.size)} · {refName(attachment.uploader, '—')}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Download ${attachment.originalFilename}`}
                  iconLeft={<DownloadSimple aria-hidden />}
                  onClick={() => void onDownload(attachment)}
                />

                {canUpload && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${attachment.originalFilename}`}
                    iconLeft={<Trash aria-hidden />}
                    onClick={() => setPendingDelete(attachment)}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this file?"
        description={`"${pendingDelete?.originalFilename ?? ''}" will be removed permanently.`}
        confirmLabel="Delete file"
        tone="danger"
        loading={remove.loading}
        onConfirm={() => {
          const attachment = pendingDelete;
          if (!attachment) return;
          void remove.run(attachment._id).then((outcome) => {
            if (outcome.ok) {
              setPendingDelete(null);
              reload();
            }
          });
        }}
      />
    </div>
  );
};

/**
 * The task detail knows the workspace from context; the project id is in the
 * URL. Read in one place so the two id sources cannot drift apart.
 */
const useTaskScope = () => {
  const { workspaceId } = useWorkspace();
  const { projectId = '' } = useParams<{ projectId: string }>();

  return { workspaceId, projectId };
};
