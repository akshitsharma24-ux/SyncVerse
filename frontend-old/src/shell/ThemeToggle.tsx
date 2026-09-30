/** Sun/moon button that switches between the light and dark theme. Used in the entry page nav and the workspace top bar. */
import { toggleTheme, useTheme } from '../theme';
import { Icon } from './icons';

export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      className="btn btn-outline btn-sm"
      style={{ width: 32, padding: 0 }}
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      data-testid="theme-toggle"
      data-theme-now={theme}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
    </button>
  );
}
