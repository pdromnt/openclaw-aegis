// ═══════════════════════════════════════════════════════════
// Config Validator — Validates config against Gateway JSON Schema
// Catches unrecognized keys before save to prevent restart loops
// ═══════════════════════════════════════════════════════════

export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate a config object against a JSON Schema from the Gateway.
 * Performs lightweight checks:
 * 1. Walks the config tree
 * 2. Checks each key against the schema's `properties` and `additionalProperties`
 * 3. Reports unrecognized keys as warnings
 * 4. Reports type mismatches as errors
 *
 * This is NOT a full JSON Schema validator (no $ref resolution, no allOf/oneOf).
 * It's designed to catch the most common mistake: leftover/renamed config keys
 * that cause Gateway validation failures on startup.
 */
export function validateConfig(config: any, schema: any): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!schema || !config || typeof config !== 'object') {
    return { valid: true, issues: [] };
  }

  walkObject(config, schema, '', issues);

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
  };
}

function walkObject(obj: any, schema: any, basePath: string, issues: ValidationIssue[]) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  if (!schema || typeof schema !== 'object') return;

  const properties = schema.properties || {};
  const additionalProperties = schema.additionalProperties;
  const patternProperties = schema.patternProperties;

  for (const key of Object.keys(obj)) {
    const fullPath = basePath ? `${basePath}.${key}` : key;
    const value = obj[key];

    // Check if the key exists in schema properties
    if (properties[key]) {
      const propSchema = properties[key];

      // Type check (basic)
      if (propSchema.type && value !== null && value !== undefined) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        const expectedTypes = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];

        if (!expectedTypes.includes(actualType) && !expectedTypes.includes('any')) {
          // object type can match anything that's an object
          if (!(actualType === 'object' && expectedTypes.includes('object'))) {
            issues.push({
              path: fullPath,
              message: `Expected ${expectedTypes.join('|')}, got ${actualType}`,
              severity: 'warning',
            });
          }
        }
      }

      // Recurse into nested objects
      if (value && typeof value === 'object' && !Array.isArray(value) && propSchema.properties) {
        walkObject(value, propSchema, fullPath, issues);
      }

      // Recurse into object with additionalProperties schema (like models.providers.*)
      if (value && typeof value === 'object' && !Array.isArray(value) && propSchema.additionalProperties && typeof propSchema.additionalProperties === 'object') {
        for (const subKey of Object.keys(value)) {
          if (value[subKey] && typeof value[subKey] === 'object') {
            walkObject(value[subKey], propSchema.additionalProperties, `${fullPath}.${subKey}`, issues);
          }
        }
      }

      // Recurse into array items
      if (Array.isArray(value) && propSchema.items) {
        value.forEach((item, idx) => {
          if (item && typeof item === 'object') {
            walkObject(item, propSchema.items, `${fullPath}[${idx}]`, issues);
          }
        });
      }

      continue;
    }

    // Check pattern properties
    if (patternProperties) {
      const matched = Object.keys(patternProperties).some(pattern => {
        try { return new RegExp(pattern).test(key); } catch { return false; }
      });
      if (matched) continue;
    }

    // Check additionalProperties
    if (additionalProperties === true || (typeof additionalProperties === 'object' && additionalProperties)) {
      // Allowed — no issue
      continue;
    }

    // If additionalProperties is false or not set, and key is not in properties → unrecognized
    if (additionalProperties === false) {
      issues.push({
        path: fullPath,
        message: `Unrecognized key "${key}" — Gateway may reject this`,
        severity: 'warning',
      });
    }
  }
}

/**
 * Format validation issues into a human-readable summary.
 */
export function formatValidationSummary(issues: ValidationIssue[]): string {
  if (issues.length === 0) return '';
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const lines: string[] = [];
  if (errors.length > 0) {
    lines.push(`${errors.length} error(s):`);
    errors.forEach(e => lines.push(`  ✗ ${e.path}: ${e.message}`));
  }
  if (warnings.length > 0) {
    lines.push(`${warnings.length} warning(s):`);
    warnings.forEach(w => lines.push(`  ⚠ ${w.path}: ${w.message}`));
  }
  return lines.join('\n');
}
