import { useCallback, useEffect, useState } from 'react';

import { notificationsApi } from '@/lib/api';

/**
 * The unread-notification count, polled.
 *
 * Polling rather than subscribing, because the API has no websocket and no SSE —
 * `GET /notifications/unread/count` is the only source. 60s is a deliberate
 * compromise: fast enough that a badge is not stale by the time it is noticed,
 * slow enough that a long-lived tab stays far inside the 1000-requests-per-15-
 * minutes budget.
 *
 * Failures are swallowed on purpose. A badge is decoration; a dropped poll must
 * not surface an error, and must not tear down the session — though if the
 * session *has* expired, the 401 is broadcast by the client and handled centrally.
 */
export const useUnreadCount = (intervalMs = 60_000): number => {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const data = await notificationsApi.unreadCount();
      setCount(data.count);
    } catch {
      // Intentionally ignored — see above.
    }
  }, []);

  useEffect(() => {
    void fetchCount();

    const timer = window.setInterval(() => void fetchCount(), intervalMs);
    return () => window.clearInterval(timer);
  }, [fetchCount, intervalMs]);

  return count;
};
