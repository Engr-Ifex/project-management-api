import { useEffect } from 'react';

/**
 * Sets the document title for a page.
 *
 * Small, but it is the difference between a usable browser history and a list of
 * identical tabs. The suffix is added here so no page has to remember it.
 */
export const useDocumentTitle = (title?: string): void => {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · Project Management` : 'Project Management';
    return () => {
      document.title = previous;
    };
  }, [title]);
};
