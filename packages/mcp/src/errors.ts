/**
 * MCP server error contracts
 *
 * Provides typed error responses with consistent error codes
 * for predictable client handling.
 */

// ── Error Code Enumeration ──────────────────────────────────────────

export enum McpErrorCode {
  // Client errors (4xx)
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  VALUE_OUT_OF_RANGE = 'VALUE_OUT_OF_RANGE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  
  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED'
}

// ── Error Contract Interface ────────────────────────────────────────

export interface McpError {
  code: McpErrorCode;
  message: string;
  field: string | undefined;
  details: Record<string, unknown> | undefined;
  validationErrors: ValidationIssue[] | undefined;
}

export interface ValidationIssue {
  field: string;
  message: string;
  received: unknown;
  expected: string;
}

// ── Error Factory ───────────────────────────────────────────────────

export function createMcpError(
  code: McpErrorCode,
  message: string,
  options: { field?: string; details?: Record<string, unknown>; validationErrors?: ValidationIssue[] } = {}
): McpError {
  return {
    code,
    message,
    field: options.field,
    details: options.details,
    validationErrors: options.validationErrors
  };
}

// ── Input Validation ────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
}

export class InputValidator {
  private issues: ValidationIssue[] = [];

  /**
   * Validate that a required field is present
   */
  required(field: string, value: unknown): this {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      this.issues.push({
        field,
        message: `Required field '${field}' is missing`,
        received: value,
        expected: 'non-empty value'
      });
    }
    return this;
  }

  /**
   * Validate field type
   */
  type(field: string, value: unknown, expectedType: string): this {
    if (value === undefined) return this; // Already checked by required()
    
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType) {
      this.issues.push({
        field,
        message: `Field '${field}' expected type '${expectedType}', got '${actualType}'`,
        received: actualType,
        expected: expectedType
      });
    }
    return this;
  }

  /**
   * Validate string length constraints
   */
  stringLength(field: string, value: string, options: { min?: number; max?: number }): this {
    if (typeof value !== 'string') return this;
    
    if (options.min !== undefined && value.length < options.min) {
      this.issues.push({
        field,
        message: `Field '${field}' length ${value.length} below minimum ${options.min}`,
        received: value.length,
        expected: `>= ${options.min}`
      });
    }
    if (options.max !== undefined && value.length > options.max) {
      this.issues.push({
        field,
        message: `Field '${field}' length ${value.length} exceeds maximum ${options.max}`,
        received: value.length,
        expected: `<= ${options.max}`
      });
    }
    return this;
  }

  /**
   * Validate numeric range
   */
  numberRange(field: string, value: number, options: { min?: number; max?: number }): this {
    if (typeof value !== 'number' || Number.isNaN(value)) return this;
    
    if (options.min !== undefined && value < options.min) {
      this.issues.push({
        field,
        message: `Field '${field}' value ${value} below minimum ${options.min}`,
        received: value,
        expected: `>= ${options.min}`
      });
    }
    if (options.max !== undefined && value > options.max) {
      this.issues.push({
        field,
        message: `Field '${field}' value ${value} exceeds maximum ${options.max}`,
        received: value,
        expected: `<= ${options.max}`
      });
    }
    return this;
  }

  /**
   * Validate enum values
   */
  enum(field: string, value: unknown, allowed: string[]): this {
    if (typeof value !== 'string') return this;
    if (!allowed.includes(value)) {
      this.issues.push({
        field,
        message: `Field '${field}' value '${value}' not in allowed values: ${allowed.join(', ')}`,
        received: value,
        expected: `one of ${allowed.join(', ')}`
      });
    }
    return this;
  }

  /**
   * Validate against a regex pattern
   */
  pattern(field: string, value: string, regex: RegExp, patternName?: string): this {
    if (typeof value !== 'string') return this;
    if (!regex.test(value)) {
      this.issues.push({
        field,
        message: `Field '${field}' value '${value}' does not match ${patternName || 'pattern'}`,
        received: value,
        expected: patternName ? `pattern ${patternName}` : 'matching pattern'
      });
    }
    return this;
  }

  /**
   * Get validation result
   */
  getResult(): ValidationResult {
    return {
      ok: this.issues.length === 0,
      errors: this.issues
    };
  }

  /**
   * Reset validator state
   */
  reset(): this {
    this.issues = [];
    return this;
  }

  /**
   * Validate input against a schema definition
   */
  static validate(
    input: Record<string, unknown>,
    schema: Record<string, {
      required?: boolean;
      type?: string;
      minLength?: number;
      maxLength?: number;
      min?: number;
      max?: number;
      enum?: string[];
      pattern?: string;
    }>
  ): ValidationResult {
    const validator = new InputValidator();
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = input[field];
      
      if (rules.required) {
        validator.required(field, value);
      }
      
      if (rules.type && value !== undefined) {
        validator.type(field, value, rules.type);
      }
      
      if (typeof value === 'string') {
        if (rules.minLength !== undefined) {
          validator.stringLength(field, value, { min: rules.minLength });
        }
        if (rules.maxLength !== undefined) {
          validator.stringLength(field, value, { max: rules.maxLength });
        }
      }
      
      if (typeof value === 'number' && !Number.isNaN(value)) {
        if (rules.min !== undefined) {
          validator.numberRange(field, value, { min: rules.min });
        }
        if (rules.max !== undefined) {
          validator.numberRange(field, value, { max: rules.max });
        }
      }
      
      if (rules.enum && typeof value === 'string') {
        validator.enum(field, value, rules.enum);
      }
      
      if (rules.pattern && typeof value === 'string') {
        validator.pattern(field, value, new RegExp(rules.pattern), rules.pattern);
      }
    }
    
    return validator.getResult();
  }
}

// ── Error Response Formatting ───────────────────────────────────────

export function mcpErrorToResponse(error: McpError): McpToolErrorResponse {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          field: error.field,
          details: error.details,
          validationErrors: error.validationErrors
        }
      }, null, 2)
    }],
    isError: true
  };
}

export interface McpToolErrorResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
}
