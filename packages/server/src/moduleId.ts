// The id names the registry file (`<modules-dir>/<id>.json`) and the URL prefix
// `/api/modules/<id>/`, so it must never contain a path separator or dots.
export const MODULE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const MODULE_ID_RULE = 'start with a letter or digit and contain only letters, digits, "_" and "-"';
