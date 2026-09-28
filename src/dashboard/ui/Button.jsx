import './ui.css';

/**
 * A button of the dashboard. `variant`: 'primary' (the screen's main action, in the accent
 * colour), 'secondary' (default) or 'danger' (destructive, never filled).
 * @param {{variant?: 'primary'|'secondary'|'danger', type?: string}} props
 */
export function Button({ variant = 'secondary', type = 'button', className = '', ...props }) {
  return <button type={type} className={`dash-button dash-button--${variant} ${className}`.trim()} {...props} />;
}
