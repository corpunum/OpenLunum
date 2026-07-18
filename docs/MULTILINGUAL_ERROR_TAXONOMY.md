# Multilingual Parsing Error Taxonomy

This document defines a comprehensive taxonomy for parsing errors in multilingual contexts, organized around key semantic categories that commonly cause parsing failures.

## Error Categories

### 1. Entity-Related Failures
Errors in identifying and classifying entities in semantic parsing.

#### Subcategories:
- **Entity Recognition Errors**: Failure to identify valid entities
- **Entity Type Misclassification**: Incorrect classification of entity types
- **Entity Ambiguity**: Multiple possible entity interpretations
- **Entity Scope Issues**: Incorrect boundaries of entity mentions

#### Examples:
- Missing proper nouns in English/Greek text
- Incorrect identification of temporal expressions as entities
- Confusion between person and organization entities

### 2. Role-Related Failures  
Errors in assigning semantic roles to arguments.

#### Subcategories:
- **Role Assignment Errors**: Incorrect role assignment to arguments
- **Missing Roles**: Required roles not identified
- **Excess Roles**: Unnecessary roles assigned
- **Role Confusion**: Confusing similar role types

#### Examples:
- Assigning "agent" role to patient in passive constructions
- Missing "theme" role in motion verbs
- Confusing "recipient" and "object" roles

### 3. Negation-Related Failures
Errors in handling negation and negative expressions.

#### Subcategories:
- **Negation Detection**: Failure to identify negation markers
- **Scope Ambiguity**: Unclear scope of negation
- **Negation Direction**: Incorrect interpretation of negation direction
- **Negation Context**: Missing contextual information for negation

#### Examples:
- Missing "not" in negated clauses
- Misinterpreting "never" as "sometimes"
- Confusing scope of negation in complex sentences

### 4. Condition-Related Failures
Errors in handling conditional expressions and hypothetical scenarios.

#### Subcategories:
- **Conditional Detection**: Missing conditional markers
- **Condition Structure**: Incorrect parsing of conditionals
- **Hypothetical Parsing**: Misunderstanding of "if" vs "suppose" 
- **Temporal Condition**: Confusing conditional with temporal relationships

#### Examples:
- Missing "if" in conditional clauses
- Incorrectly parsing "unless" as "if not"
- Confusing "suppose" with "assuming"

### 5. Quantity-Related Failures
Errors in parsing quantitative information.

#### Subcategories:
- **Quantity Recognition**: Missing numerical expressions
- **Unit Confusion**: Incorrect unit interpretation
- **Range Misinterpretation**: Wrong understanding of ranges
- **Precision Loss**: Loss of quantitative precision

#### Examples:
- Missing "three" in "three dogs"
- Confusing "between 5 and 10" with "5 to 10"
- Misinterpreting "approximately" as exact value

### 6. Time-Related Failures
Errors in parsing temporal information.

#### Subcategories:
- **Temporal Expression**: Missing or incorrect temporal markers
- **Time Relations**: Incorrect temporal relationships
- **Duration Parsing**: Wrong handling of durations
- **Reference Time**: Missing or incorrect reference time

#### Examples:
- Missing "yesterday" in time expressions
- Confusing "before" and "after" temporal relations
- Misinterpreting "for two hours" as "two hours"

### 7. Ambiguity-Related Failures
Errors caused by multiple valid interpretations.

#### Subcategories:
- **Syntactic Ambiguity**: Structural ambiguity in sentence structure
- **Semantic Ambiguity**: Multiple valid semantic interpretations
- **Lexical Ambiguity**: Words with multiple meanings
- **Anaphora Resolution**: Missing or incorrect pronoun resolution

#### Examples:
- "I saw the man with the telescope" (ambiguous instrument vs. person)
- "Time flies like an arrow" (ambiguous subject/verb)
- "The chicken is ready to eat" (ambiguous subject)

## Taxonomy Usage

This taxonomy serves multiple purposes in the OpenLunum ecosystem:

1. **Error Analysis**: Categorizing parsing failures for system improvement
2. **Quality Metrics**: Tracking error types across different languages
3. **Training Data**: Creating labeled examples for error correction
4. **Debugging Tools**: Helping developers diagnose parsing issues
5. **Performance Monitoring**: Tracking error reduction over time

## Implementation Guidelines

### Consistency
Each error should be classified under exactly one primary category, with secondary categories as needed.

### Granularity
Taxonomy levels should be detailed enough for meaningful analysis but not so granular as to be unwieldy.

### Multilingual Applicability
Each category should be applicable across multiple supported languages with appropriate linguistic considerations.

### Documentation
Each category should have clear examples and classification criteria for consistent application.

## Future Extensions

### Additional Categories
As parsing systems mature, consider adding:
- **Prepositional Phrase Ambiguity**
- **Coordination Errors**
- **Passive Voice Parsing**
- **Modal Verb Interpretation**

### Machine Learning Integration
Future work could include:
- Automated error classification using ML models
- Error pattern recognition and prediction
- Confidence scoring for error categorization

## Example Error Classification

**Input**: "The dog didn't eat the food yesterday"

**Error Classification**:
- Primary: Negation-Related Failure
- Secondary: Time-Related Failure
- Specific: Negation Detection (missing "didn't" scope)
- Specific: Temporal Expression (missing "yesterday")

This classification enables targeted improvements in parsing algorithms for these specific failure modes.