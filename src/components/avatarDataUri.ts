/**
 * Turn the engine's avatar SVG markup into a `data:` URI for an <img>.
 *
 * Why: an SVG loaded through <img> runs in "image mode". Scripts, event
 * handlers and external loads are all disabled, so the markup can never
 * become XSS, even if untrusted text (e.g. a merchant name) ever ends up
 * inside the SVG. This replaces `dangerouslySetInnerHTML`.
 *
 * `encodeURIComponent` keeps the URI valid and safe inside an attribute.
 */
export function avatarDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
