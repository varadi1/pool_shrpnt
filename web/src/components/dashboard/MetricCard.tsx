import { Card, CardHeader, Text, makeStyles, tokens, Spinner } from '@fluentui/react-components';
import type { ReactNode } from 'react';

const useStyles = makeStyles({
  card: {
    height: '120px',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    paddingBottom: '8px',
  },
  content: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px 16px',
  },
  value: {
    fontSize: '2rem',
    fontWeight: tokens.fontWeightBold,
    lineHeight: 1,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  icon: {
    fontSize: '2rem',
    color: tokens.colorNeutralForeground3,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
  warning: {
    color: tokens.colorPaletteYellowForeground1,
  },
  success: {
    color: tokens.colorPaletteGreenForeground1,
  },
});

interface MetricCardProps {
  title: string;
  value?: number | string;
  icon?: ReactNode;
  loading?: boolean;
  error?: boolean;
  status?: 'normal' | 'warning' | 'error' | 'success';
  subtitle?: string;
}

export const MetricCard = ({ 
  title, 
  value, 
  icon, 
  loading = false, 
  error = false,
  status = 'normal',
  subtitle 
}: MetricCardProps) => {
  const styles = useStyles();

  const getValueClass = () => {
    if (error || status === 'error') return `${styles.value} ${styles.error}`;
    if (status === 'warning') return `${styles.value} ${styles.warning}`;
    if (status === 'success') return `${styles.value} ${styles.success}`;
    return styles.value;
  };

  const getAriaLabel = () => {
    if (loading) return `${title}: Betöltés`;
    if (error) return `${title}: Hiba`;
    const statusText = status !== 'normal' ? `, ${status}` : '';
    const subtitleText = subtitle ? `, ${subtitle}` : '';
    return `${title}: ${value ?? 'No data'}${statusText}${subtitleText}`;
  };

  return (
    <Card 
      className={styles.card}
      role="article"
      aria-label={getAriaLabel()}
    >
      <CardHeader
        header={<Text weight="semibold" as="h2">{title}</Text>}
        description={subtitle}
        className={styles.header}
      />
      <div className={styles.content} aria-live="polite" aria-atomic="true">
        {loading ? (
          <div className={styles.loading} role="status" aria-label="Betöltés">
            <Spinner size="small" />
          </div>
        ) : error ? (
          <Text className={styles.error} role="alert">Hiba</Text>
        ) : (
          <>
            <Text as="div" className={getValueClass()} aria-label={`Value: ${value ?? 'No data'}`}>
              {value ?? '-'}
            </Text>
            {icon && <div className={styles.icon} aria-hidden="true">{icon}</div>}
          </>
        )}
      </div>
    </Card>
  );
};