import { texts } from '../../../../config/texts.config.js';
import { previewSrc } from '../../lib/preview.js';
import './site.css';

const t = texts.admin.site;

/**
 * The real site, reading the draft, in a frame. `page` picks the page of the site shown
 * (changing it loads that page); `full` makes the frame as tall as the space it has.
 * @param {{frameRef: object, page: string, full?: boolean, className?: string}} props
 */
export function PreviewFrame({ frameRef, page, full = false, className = '' }) {
  return (
    <iframe ref={frameRef} src={previewSrc(page)} title={t.previewTitle}
      className={`dash-preview${full ? ' dash-preview--full' : ''} ${className}`.trim()} />
  );
}
