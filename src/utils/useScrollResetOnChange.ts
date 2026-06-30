import { DependencyList, useEffect } from 'react';

export function useScrollResetOnChange(deps: DependencyList) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const resetScrollPosition = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      document
        .querySelectorAll<HTMLElement>('.screen-shell, .screen-shell__frame')
        .forEach((element) => {
          element.scrollTop = 0;
        });
    };

    resetScrollPosition();
    requestAnimationFrame(resetScrollPosition);
  }, deps);
}
