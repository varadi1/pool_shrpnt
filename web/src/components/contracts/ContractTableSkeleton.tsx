import {
  Skeleton,
  SkeletonItem,
  makeStyles,
  tokens,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
  },
  header: {
    display: 'grid',
    gridTemplateColumns: '150px 200px 150px 100px 120px 120px 150px 100px',
    gap: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '150px 200px 150px 100px 120px 120px 150px 100px',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  cell: {
    height: '20px',
  },
  headerCell: {
    height: '16px',
  },
  '@media (max-width: 768px)': {
    header: {
      gridTemplateColumns: '1fr 1fr 80px',
    },
    row: {
      gridTemplateColumns: '1fr 1fr 80px',
    },
  },
});

interface ContractTableSkeletonProps {
  rows?: number;
}

export const ContractTableSkeleton: React.FC<ContractTableSkeletonProps> = ({ 
  rows = 10 
}) => {
  const styles = useStyles();

  return (
    <div className={styles.root} role="status" aria-label="Loading contracts...">
      <Skeleton>
        {/* Header */}
        <div className={styles.header}>
          <SkeletonItem className={styles.headerCell} />
          <SkeletonItem className={styles.headerCell} />
          <SkeletonItem className={styles.headerCell} />
          <SkeletonItem className={styles.headerCell} />
          <SkeletonItem className={styles.headerCell} />
          <SkeletonItem className={styles.headerCell} />
          <SkeletonItem className={styles.headerCell} />
          <SkeletonItem className={styles.headerCell} />
        </div>

        {/* Rows */}
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className={styles.row}>
            <SkeletonItem className={styles.cell} />
            <SkeletonItem className={styles.cell} />
            <SkeletonItem className={styles.cell} />
            <SkeletonItem className={styles.cell} />
            <SkeletonItem className={styles.cell} />
            <SkeletonItem className={styles.cell} />
            <SkeletonItem className={styles.cell} />
            <SkeletonItem className={styles.cell} />
          </div>
        ))}
      </Skeleton>
    </div>
  );
};