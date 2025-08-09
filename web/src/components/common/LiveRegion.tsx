import { useEffect, useRef } from 'react';
import { makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

interface LiveRegionProps {
  message?: string;
  politeness?: 'polite' | 'assertive';
  clearDelay?: number;
}

export const LiveRegion = ({ 
  message, 
  politeness = 'polite',
  clearDelay = 1000 
}: LiveRegionProps) => {
  const styles = useStyles();
  const regionRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (message && regionRef.current) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Announce the message
      regionRef.current.textContent = message;

      // Clear the message after delay
      timeoutRef.current = setTimeout(() => {
        if (regionRef.current) {
          regionRef.current.textContent = '';
        }
      }, clearDelay);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [message, clearDelay]);

  return (
    <div
      ref={regionRef}
      className={styles.visuallyHidden}
      role="status"
      aria-live={politeness}
      aria-atomic="true"
    />
  );
};

// Hook for announcing messages
export const useAnnounce = () => {
  const announcerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!announcerRef.current) {
      const announcer = document.createElement('div');
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.style.position = 'absolute';
      announcer.style.width = '1px';
      announcer.style.height = '1px';
      announcer.style.padding = '0';
      announcer.style.margin = '-1px';
      announcer.style.overflow = 'hidden';
      announcer.style.clip = 'rect(0,0,0,0)';
      announcer.style.whiteSpace = 'nowrap';
      announcer.style.border = '0';
      document.body.appendChild(announcer);
      announcerRef.current = announcer;
    }

    return () => {
      if (announcerRef.current) {
        document.body.removeChild(announcerRef.current);
        announcerRef.current = null;
      }
    };
  }, []);

  const announce = (message: string, politeness: 'polite' | 'assertive' = 'polite') => {
    if (announcerRef.current) {
      announcerRef.current.setAttribute('aria-live', politeness);
      announcerRef.current.textContent = '';
      // Small delay to ensure screen readers detect the change
      setTimeout(() => {
        if (announcerRef.current) {
          announcerRef.current.textContent = message;
        }
      }, 100);
    }
  };

  return announce;
};