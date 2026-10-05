import { DownloadSimple, Trash, UploadSimple } from '@phosphor-icons/react';
import { useRef, useState } from 'react';

import { FileTypeIcon, ImagePreview } from '@/components/attachments/FileTypeIcon';
import {
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  ErrorState,
  Pagination,
  Table,
  TableSkeletonRows,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import type { Attachment, Project } from '@/lib/api';
import { attachmentsApi, downloadBlob, refName } from '@/lib/api';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
} from '@/lib/constants';
import { extensionOf, formatBytes } from '@/lib/utils';
import { isPreviewable } from '@/lib/attachments';
import { useAsync, useMutation } from '@/lib/hooks';
import { useProjectRole, useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * Project attachments.
 *
 * Two things the API forces on this screen:
 *
 * 1. **Downloads are authenticated.** An `<img src>` or a plain link gets a 401,
 *    so a download has to be fetched with credentials, turned into a blob URL,
 *    and clicked programmatically. The blob URL is revoked immediately after —
 *    leaving them alive leaks the whole file into memory for the tab's lifetime.
 * 2. **Content is signature-checked, not just the extension.** A renamed file is
 *    rejected server-side. The client can only check the extension and the size,
 *    so the upload can still fail for a disguised file — and that failure is
 *    surfaced rather than swallowed.
 */
export const AttachmentsTab = ({ project }: { project: Project }) => {
  const { workspaceId } = useWorkspace();
  const { projectRole } = useProjectRole(project.members);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, error, loading, reload } = useAsync(
    () => attachmentsApi.listForProject(workspaceId, project._id, { page, limit }),
    [workspaceId, project._id, page, limit]
  );

  const upload = useMutation((file: File) =>
    attachmentsApi.uploadToProject(workspaceId, project._id, file, setProgress)
  );
  const remove = useMutation((attachmentId: string) =>
    attachmentsApi.remove(workspaceId, project._id, attachmentId)
  );

  const attachments = data?.attachments ?? [];
  const pagination = data?.pagination;
  const canUpload = projectRole !== 'viewer';

  const onFileChosen = async (file: File | undefined) => {
    setLocalError(undefined);
    setProgress(undefined);
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setLocalError(`"${file.name}" is ${formatBytes(file.size)}. The limit is 10 MB.`);
      return;
    }

    if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(
        extensionOf(file.name) as (typeof ALLOWED_ATTACHMENT_EXTENSIONS)[number]
      )) {
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
        attachmentsApi.downloadPath(workspaceId, project._id, attachment._id)
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
    <>
      <Card>
        <CardBody className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-body">Attachments</h2>
              <p className="text-xs text-body-subtle">
                Up to 10 MB per file, one at a time. Downloads require your session.
              </p>
            </div>

            {canUpload && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  className="hidden"
                  onChange={(event) => void onFileChosen(event.target.files?.[0])}
                />

                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<UploadSimple aria-hidden />}
                  loading={upload.loading}
                  onClick={() => fileInput.current?.click()}
                >
                  Upload file
                </Button>
              </>
            )}
          </div>

          {(localError ?? upload.error?.message) && (
            <p role="alert" className="text-xs text-danger-700">
              {localError ?? upload.error?.message}
            </p>
          )}

          {/*
            A 10 MB upload on a slow connection is long enough that a spinner
            alone reads as "hung". The percentage comes from XHR's upload
            progress, not from a timer.
          */}
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

          {/*
            The skeleton renders `<tr>`s, so it has to live inside a real table —
            on its own it is a `<tr>` with no table ancestor, which React reports
            as invalid nesting.
          */}
          {loading && (
            <div className="overflow-hidden rounded-md border border-line">
              <TableWrapper>
                <Table>
                  <TBody>
                    <TableSkeletonRows rows={3} columns={4} />
                  </TBody>
                </Table>
              </TableWrapper>
            </div>
          )}

          {!loading && attachments.length === 0 && (
            <p className="py-8 text-center text-sm text-body-muted">No files attached yet.</p>
          )}

          {!loading && attachments.length > 0 && (
            <div className="overflow-hidden rounded-md border border-line">
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>File</TH>
                      <TH>Uploaded by</TH>
                      <TH numeric>Size</TH>
                      <TH>
                        <span className="sr-only">Actions</span>
                      </TH>
                    </TR>
                  </THead>

                  <TBody>
                    {attachments.map((attachment) => (
                      <TR key={attachment._id}>
                        <TD primary>
                          <span className="flex items-center gap-2">
                            {/*
                              An image shows itself — a thumbnail says "this is a
                              picture" faster than any icon, and the preview is
                              fetched through the authenticated path like any
                              other download. Everything else gets a type icon.
                            */}
                            {isPreviewable(attachment.originalFilename) ? (
                              <ImagePreview
                                path={attachmentsApi.downloadPath(
                                  workspaceId,
                                  project._id,
                                  attachment._id
                                )}
                                filename={attachment.originalFilename}
                                className="size-8 shrink-0 border border-line"
                              />
                            ) : (
                              <FileTypeIcon filename={attachment.originalFilename} />
                            )}

                            <span className="truncate">{attachment.originalFilename}</span>
                          </span>
                        </TD>

                        <TD>{refName(attachment.uploader, '—')}</TD>

                        <TD numeric>{formatBytes(attachment.size)}</TD>

                        <TD>
                          <span className="flex items-center justify-end gap-1">
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
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            </div>
          )}

          {pagination && pagination.total > 0 && (
            <Pagination
              {...pagination}
              onPageChange={setPage}
              onLimitChange={(next) => {
                setLimit(next);
                setPage(1);
              }}
            />
          )}
        </CardBody>
      </Card>

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
    </>
  );
};
