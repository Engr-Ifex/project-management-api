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
 *
 * `refresh` exists because a poll interval is the wrong latency for an action
 * the user just took: marking a notification read must move the badge now, not
 * up to a minute later.
 */
export const useUnreadCount = (intervalMs = 60_000) => {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await notificationsApi.unreadCount();
      setCount(data.count);
    } catch {
      // Intentionally ignored — see above.
    }
  }, []);

  useEffect(() => {
    void refresh();

    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, intervalMs]);

  return { count, refresh };
};
