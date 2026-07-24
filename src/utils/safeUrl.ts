/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * URL/attribute sanitization helpers.
 *
 * React escapes text content, but it does NOT block dangerous URL schemes
 * inside `href`/`src` attributes — `javascript:`, `vbscript:` and unexpected
 * `data:`/`blob:` payloads can execute or smuggle content. Any URL that comes
 * from user/admin input (product image URLs, webhook URLs, links, phone-derived
 * deep links) must pass through these helpers before reaching the DOM.
 */

const SAFE_LINK_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * Returns a URL safe to use in an anchor `href`, or '' if it is unsafe.
 * Allows only http(s)/mailto/tel and protocol-relative/relative paths.
 */
export function safeHref(raw: string | undefined | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';

  // Relative or root-relative paths and anchors are safe (no scheme).
  if (/^([/#?]|\.\/|\.\.\/)/.test(value)) return value;

  // Protocol-relative (//host/...) — treat as https.
  if (value.startsWith('//')) return value;

  try {
    // Resolve against a base so scheme parsing is reliable.
    const url = new URL(value, 'https://placeholder.invalid');
    // If the parser kept the placeholder origin, the input was relative — allow.
    if (url.origin === 'https://placeholder.invalid' && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return value;
    }
    return SAFE_LINK_SCHEMES.includes(url.protocol.toLowerCase()) ? value : '';
  } catch {
    return '';
  }
}

/**
 * Returns a URL safe to use in an `<img src>`, or '' if it is unsafe.
 * Allows http(s), protocol-relative, relative paths, and inline image data URLs
 * (used by the product image uploader). Blocks `javascript:`, `data:text/html`,
 * SVG data URLs (which can carry script), and any other scheme.
 */
export function safeImageSrc(raw: string | undefined | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';

  // Inline image uploads: only raster image data URLs, never SVG/HTML.
  if (/^data:/i.test(value)) {
    return /^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon);base64,/i.test(value) ? value : '';
  }

  // Relative / root-relative / protocol-relative paths are safe.
  if (/^([/#?]|\.\/|\.\.\/|\/\/)/.test(value)) return value;

  try {
    const url = new URL(value, 'https://placeholder.invalid');
    if (url.origin === 'https://placeholder.invalid' && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return value;
    }
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : '';
  } catch {
    return '';
  }
}

/**
 * Returns an https(s)-only URL for use with window.open / external navigation,
 * or '' if unsafe. Use together with the 'noopener,noreferrer' window features.
 */
export function safeExternalUrl(raw: string | undefined | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

/** Opens an external URL only if it is http(s), always with noopener/noreferrer. */
export function openExternal(raw: string): void {
  const url = safeExternalUrl(raw);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
