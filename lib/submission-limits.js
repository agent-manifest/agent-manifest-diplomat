// Admission limits for this public gateway, not requirements of the schema.
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_JSON_DEPTH = 32;

function declaredBodyTooLarge(req) {
  const length = req.headers?.['content-length'];
  return typeof length === 'string' && /^\d+$/.test(length) &&
    Number(length) > MAX_MANIFEST_BYTES;
}

function checkSubmission(manifest) {
  // Walk iteratively before JSON.stringify or schema validation: deeply nested
  // extension data can exhaust their call stacks even in a small request.
  const pending = [{ value: manifest, depth: 1 }];
  while (pending.length) {
    const { value, depth } = pending.pop();
    if (value === null || typeof value !== 'object') continue;
    if (depth > MAX_JSON_DEPTH) return 'Manifest nesting exceeds 32 levels';
    for (const child of Object.values(value)) {
      if (child !== null && typeof child === 'object') {
        pending.push({ value: child, depth: depth + 1 });
      }
    }
  }

  // Match the exact UTF-8 representation putFile persists, including indentation.
  // This also checks requests with no Content-Length (e.g. chunked transfers).
  if (Buffer.byteLength(JSON.stringify(manifest, null, 2), 'utf8') > MAX_MANIFEST_BYTES) {
    return 'Manifest exceeds the 65536-byte storage limit';
  }
  return null;
}

module.exports = { MAX_MANIFEST_BYTES, MAX_JSON_DEPTH, declaredBodyTooLarge, checkSubmission };
