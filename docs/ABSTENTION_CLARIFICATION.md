# Abstention and Clarification for Low-Confidence Parses

This document describes the abstention and clarification system for handling low-confidence parses in OpenLunum.

## Overview

The abstention and clarification system provides:
- Automatic detection of low-confidence parses
- Abstention (withholding output) when confidence is too low
- Clarification requests for ambiguous content
- Configurable confidence thresholds

## Confidence Levels

### High (≥ 0.9)
- Parser is very confident
- No abstention needed
- Safe to use in production

### Medium (≥ 0.7)
- Parser is reasonably confident
- Can be used with caution
- May benefit from additional validation

### Low (≥ 0.5)
- Parser is uncertain
- May need human review
- Consider abstention or clarification

### Abstain (< 0.5)
- Parser is very uncertain
- Withhold output
- Request clarification

## Confidence Scoring

The confidence score is calculated as a weighted average:

```typescript
confidence = parseConfidence * 0.5 +
             goodClauseRatio * 0.3 +
             lowAmbiguityRatio * 0.2
```

### Components

1. **Parse Confidence** (weight: 0.5)
   - Overall confidence from the parser
   - Primary factor in scoring

2. **Good Clause Ratio** (weight: 0.3)
   - Ratio of clauses with sufficient roles
   - Penalizes clauses with < 2 roles

3. **Low Ambiguity Ratio** (weight: 0.2)
   - Ratio of clauses without ambiguity indicators
   - Penalizes ambiguous content

## Clause-Level Confidence

Each clause is evaluated for:

### Predicate Clarity
- Empty predicate: -0.3
- Clear predicate: no penalty

### Role Coverage
- < 2 roles: -0.2
- 2+ roles: no penalty

### Complexity
- Negated + conditions: -0.1
- Simple: no penalty

## Abstention

### When to Abstain
1. Confidence level is 'abstain' (< 0.5)
2. Low confidence AND > 50% ambiguous clauses
3. Low confidence AND > 50% low-confidence clauses

### Abstention Output
```typescript
{
  shouldAbstain: true,
  confidenceLevel: 'abstain',
  confidenceScore: 0.4,
  abstentionReason: 'Confidence too low (50% threshold)'
}
```

## Clarification

### When to Request Clarification
1. Ambiguous clauses detected
2. Confidence is above abstention threshold
3. Parser can benefit from user input

### Clarification Output
```typescript
{
  type: 'ambiguity',
  question: 'The clause "statement" is ambiguous. Please clarify.',
  context: 'Parse confidence',
  options: ['Reduce conditions', 'Confirm negation']
}
```

## Usage Examples

### Basic Confidence Evaluation

```typescript
import { AbstentionClarificationEngine } from '@corpunum/lunum-eval';

const engine = new AbstentionClarificationEngine();

// Evaluate parse confidence
const result = engine.evaluateConfidence(record, clauses, 0.85);

if (result.shouldAbstain) {
  console.log('Aborting parse:', result.abstentionReason);
} else if (result.clarification) {
  console.log('Need clarification:', result.clarification.question);
}
```

### Configurable Thresholds

```typescript
const engine = new AbstentionClarificationEngine({
  thresholds: {
    high: 0.95,
    medium: 0.8,
    low: 0.6
  }
});
```

### Integration with Parse Pipeline

```typescript
// Parse
const parseResult = parser.parse(text);

// Evaluate confidence
const confidence = engine.createParseResult(
  parseResult.sem,
  parseResult.clauses,
  parseResult.confidence
);

// Handle result
if (confidence.confidence.shouldAbstain) {
  return { status: 'abstained', reason: confidence.confidence.abstentionReason };
}

if (confidence.confidence.clarification) {
  return { 
    status: 'clarification_needed',
    clarification: confidence.confidence.clarification
  };
}

// Proceed with parse
return { status: 'success', sem: confidence.sem };
```

## Configuration

### Default Thresholds

```typescript
{
  high: 0.9,   // ≥ 90% confidence
  medium: 0.7, // ≥ 70% confidence
  low: 0.5     // ≥ 50% confidence
}
```

### Custom Thresholds

```typescript
// More conservative
engine.setThresholds({ high: 0.95, medium: 0.85, low: 0.75 });

// More aggressive
engine.setThresholds({ high: 0.85, medium: 0.65, low: 0.45 });
```

## Best Practices

### 1. Threshold Selection
- Start with defaults (0.9/0.7/0.5)
- Adjust based on domain requirements
- Monitor abstention rates
- Set higher for critical applications

### 2. Clarification Handling
- Provide user-friendly questions
- Offer clear options
- Log clarification requests
- Track resolution rates

### 3. Abstention Policies
- Define what happens on abstention
- Consider fallback strategies
- Monitor abstention frequency
- Review low-confidence patterns

### 4. Monitoring
- Track confidence distributions
- Alert on unusual abstention rates
- Review clarification requests
- Update thresholds periodically

## Integration Points

### With Realization
- Pass confidence to realization engine
- Abstain from realization if parse is uncertain
- Include clarification in realization context

### With Policy
- Use confidence for policy decisions
- High confidence: auto-approve
- Low confidence: require review
- Abstain: flag for manual handling

### With Context
- Include confidence in context messages
- Flag low-confidence items
- Enable context-aware decisions

## Future Enhancements

### Planned Features
- ML-based confidence estimation
- Domain-specific thresholds
- Automatic threshold tuning
- Confidence visualization
- Historical confidence tracking

### Integrations
- MCP server tools
- CLI confidence check
- Web UI for exploration
- Dashboard integration