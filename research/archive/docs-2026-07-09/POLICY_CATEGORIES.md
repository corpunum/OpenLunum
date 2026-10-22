# Policy Category Taxonomy for Semantic Content

This document defines the comprehensive taxonomy for categorizing semantic content based on policy-driven criteria, including category, risk level, and confidence scoring.

## Overview

Policy classification in OpenLunum enables systematic evaluation of semantic content for downstream processing decisions. This taxonomy provides a structured approach to categorizing content by type, assessing risk, and determining confidence in classification.

## Category Taxonomy

### Core Categories

The following categories define the primary types of semantic content:

#### 1. **Preference** (`preference`)
User preferences and choices that influence behavior.

**Examples:**
- "I prefer English over French"
- "Show me results from the last 7 days"
- "Use dark theme"

**Characteristics:**
- Subjective but explicit
- Typically low risk
- High confidence when clearly stated

#### 2. **Simple Fact** (`simple_fact`)
Verifiable, objective statements about the world.

**Examples:**
- "Paris is the capital of France"
- "Water boils at 100°C at sea level"
- "The Earth orbits the Sun"

**Characteristics:**
- Objective and verifiable
- Low to medium risk (depends on domain)
- High confidence when well-documented

#### 3. **Tool Event** (`tool_event`)
Events triggered by or related to tool usage.

**Examples:**
- "File created by editor"
- "Command executed: git commit"
- "Package installed via npm"

**Characteristics:**
- System-generated or user-initiated
- Medium risk (depends on action)
- High confidence from system logs

#### 4. **Project State** (`project_state`)
Information about the current state of a project or system.

**Examples:**
- "Build passed"
- "3 failing tests"
- "Deployment successful"

**Characteristics:**
- Stateful and temporal
- Medium risk
- High confidence from system status

#### 5. **Retrieval Rule** (`retrieval_rule`)
Rules governing information retrieval and access.

**Examples:**
- "Return results sorted by relevance"
- "Include only high-confidence matches"
- "Limit to first 10 results"

**Characteristics:**
- Instructional and procedural
- Low risk
- High confidence when explicit

#### 6. **System Fact** (`system_fact`)
Facts about the system itself or its operation.

**Examples:**
- "Lunum version 0.2.0"
- "Token count: 150"
- "Fingerprint: lfp:0.1:sha256:..."

**Characteristics:**
- System-specific and technical
- Low risk
- Very high confidence

#### 7. **Benchmark Result** (`benchmark_result`)
Results from testing or evaluation.

**Examples:**
- "Accuracy: 95%"
- "Latency: 50ms"
- "Recall: 0.92"

**Characteristics:**
- Quantitative and evaluative
- Low risk
- High confidence from measurement

### Restricted Categories

These categories require special handling and are only processed in natural (non-semantic) mode:

#### 1. **Conditional Instruction** (`conditional_instruction`)
Instructions that depend on certain conditions being met.

**Examples:**
- "If the user asks, show them X"
- "When deployed, enable feature Y"
- "Assuming version 2, do Z"

**Characteristics:**
- Context-dependent
- Medium risk
- Variable confidence

#### 2. **Safety Constraint** (`safety_constraint`)
Constraints related to safety or security.

**Examples:**
- "Do not expose private keys"
- "Limit data retention to 30 days"
- "Require authentication for all requests"

**Character characteristics:**
- Protective and prescriptive
- High risk if violated
- High confidence when explicit

#### 3. **Safety Event** (`safety_event`)
Events related to safety or security incidents.

**Examples:**
- "Authentication failed 5 times"
- "Rate limit exceeded"
- "Unauthorized access detected"

**Characteristics:**
- Incident-driven
- High risk
- High confidence from monitoring

#### 4. **Exact Quote** (`exact_quote`)
Direct quotes from sources.

**Examples:**
- "To be or not to be"
- "42 is the answer"
- "Hello World"

**Characteristics:**
- Literal and verbatim
- Low risk
- Very high confidence

#### 5. **Code** (`code`)
Program code or code-like content.

**Examples:**
- `function hello() { return "world"; }`
- `SELECT * FROM users WHERE active = true`
- `<div class="container"></div>`

**Characteristics:**
- Executable or structural
- Medium risk
- High confidence from syntax

#### 6. **Command** (`command`)
Executable commands.

**Examples:**
- `sudo rm -rf /tmp/data`
- `git push origin main`
- `npm install express`

**Characteristics:**
- Action-oriented
- Medium to high risk
- High confidence from format

#### 7. **File Path** (`file_path`)
Paths to files or directories.

**Examples:**
- `/home/user/documents/file.txt`
- `C:\Windows\System32`
- `./src/components/Button.tsx`

**Characteristics:**
- Location-specific
- Low to medium risk
- High confidence from structure

#### 8. **URL** (`url`)
Uniform Resource Locators.

**Examples:**
- `https://example.com/page`
- `http://localhost:3000`
- `ftp://files.example.com`

**Characteristics:**
- Network addresses
- Low risk
- Very high confidence from format

#### 9. **Legal Text** (`legal_text`)
Legal language and documentation.

**Examples:**
- Contract terms
- Terms of service
- Regulatory language

**Characteristics:**
- Formal and precise
- High risk if misinterpreted
- Variable confidence

#### 10. **Medical Text** (`medical_text`)
Medical terminology and documentation.

**Examples:**
- Diagnosis descriptions
- Treatment plans
- Prescription information

**Characteristics:**
- Domain-specific
- High risk if misinterpreted
- Variable confidence

#### 11. **Social Nuance** (`social_nuance`)
Cultural or social contextual information.

**Examples:**
- "This is informal"
- "Culturally sensitive topic"
- "Audience-appropriate language"

**Characteristics:**
- Context-dependent
- Medium risk
- Variable confidence

#### 12. **Ambiguous** (`ambiguous`)
Content with unclear or multiple interpretations.

**Examples:**
- "The bank" (river or financial?)
- "Time flies like an arrow"
- "I saw the man with the telescope"

**Characteristics:**
- Unclear meaning
- Medium to high risk
- Low to medium confidence

#### 13. **Complex Modality** (`complex_modality`)
Content with nuanced modal expressions.

**Examples:**
- "It's possible but unlikely"
- "She might have done it"
- "Perhaps we should reconsider"

**Characteristics:**
- Nuanced meaning
- Medium risk
- Variable confidence

## Risk Assessment

Risk levels determine the caution needed when processing content:

### **Low Risk** (`low`)
- Content unlikely to cause issues if processed incorrectly
- Examples: preferences, simple facts, system information
- Safe to include in most contexts

### **Medium Risk** (`medium`)
- Content that could cause minor issues if misinterpreted
- Examples: tool events, project state, conditional instructions
- Requires careful context consideration

### **High Risk** (`high`)
- Content that could cause significant issues if misinterpreted
- Examples: safety constraints, legal text, medical text
- Requires expert review or explicit handling

### **Unknown Risk** (`unknown`)
- Content where risk level cannot be determined
- Examples: new or novel content types
- Requires cautious processing

## Confidence Scoring

Confidence is expressed as a number from 0 to 1, indicating certainty in classification:

### **High Confidence** (`≥ 0.90`)
- Classification is very certain
- Examples: exact quotes, URLs, code blocks
- Safe to proceed without additional verification

### **Medium Confidence** (`0.70 - 0.89`)
- Classification is reasonably certain
- Examples: preferences, simple facts
- Safe to proceed but with awareness of uncertainty

### **Low Confidence** (`< 0.70`)
- Classification is uncertain
- Examples: ambiguous content, social nuances
- Recommend additional verification or human review

## Classification Rules

The following rules determine eligibility and processing:

### Eligible Categories (direct processing)
- `preference`
- `simple_fact`
- `tool_event`
- `project_state`
- `retrieval_rule`
- `system_fact`
- `benchmark_result`

### Natural-Only Categories (require natural context)
- `conditional_instruction`
- `safety_constraint`
- `safety_event`
- `exact_quote`
- `code`
- `command`
- `file_path`
- `url`
- `legal_text`
- `medical_text`
- `social_nuance`
- `ambiguous`
- `complex_modality`

### Risk-Based Filtering

When risk is not `low`, additional scrutiny is required:
1. Verify semantic validity
2. Check confidence level
3. Assess context appropriateness
4. Document reasons for inclusion or exclusion

### Confidence Thresholds

- **Minimum confidence**: `0.90` for automatic inclusion
- **Conditional inclusion**: `0.70 - 0.89` with documented reasons
- **Exclude**: `< 0.70` unless explicitly authorized

## Implementation Notes

### Integration with Policy Engine

Policy classification integrates with the existing `classifyEligibility()` function:

```typescript
// Example usage
const decision = classifyEligibility({
  category: 'simple_fact',
  risk: 'low',
  confidence: 0.95,
  sourceText: 'The sky is blue',
  semantic: true
});

// Result: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.95, reasons: [] }
```

### Extending the Taxonomy

To add new categories:
1. Define the category name and description
2. Determine if it's eligible or natural-only
3. Assign typical risk level
4. Define confidence expectations
5. Update the allowlist/restriction sets in `policy.ts`
6. Add examples and documentation

### Multilingual Considerations

When applying this taxonomy across languages:
- Ensure category names have equivalent expressions
- Verify risk assessment applies cross-culturally
- Check confidence scoring is language-agnostic
- Document language-specific classification patterns

## Examples

### Example 1: Simple Fact
```
Input: "The capital of France is Paris"
Category: simple_fact
Risk: low
Confidence: 0.98
Eligible: true
Reasons: []
```

### Example 2: Safety Constraint
```
Input: "Do not expose API keys in logs"
Category: safety_constraint
Risk: high
Confidence: 0.92
Eligible: false (natural-only)
Reasons: ['natural_only_category_safety_constraint']
```

### Example 3: Ambiguous Content
```
Input: "I saw the man with the telescope"
Category: ambiguous
Risk: medium
Confidence: 0.65
Eligible: false (natural-only + low confidence)
Reasons: ['natural_only_category_ambiguous', 'confidence_below_0.90']
```

## Summary

This taxonomy provides a comprehensive framework for:
- Categorizing semantic content by type
- Assessing risk levels for different content
- Scoring confidence in classification
- Determining eligibility for processing
- Supporting systematic policy-driven decisions

The taxonomy supports both human and automated classification while maintaining consistency across different processing contexts.