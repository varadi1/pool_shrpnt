import { makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  skipLink: {
    position: 'absolute',
    left: '-9999px',
    zIndex: 9999,
    padding: '8px 16px',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    textDecoration: 'none',
    borderRadius: tokens.borderRadiusMedium,
    ':focus': {
      left: '8px',
      top: '8px',
    },
  },
});

export const SkipNavigation = () => {
  const styles = useStyles();

  const handleSkipToMain = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.focus();
      mainContent.scrollIntoView();
    }
  };

  return (
    <a
      href="#main-content"
      className={styles.skipLink}
      onClick={handleSkipToMain}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleSkipToMain(e);
        }
      }}
    >
      Skip to main content
    </a>
  );
};