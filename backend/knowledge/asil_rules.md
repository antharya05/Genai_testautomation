# ASIL Classification Rules — ISO 26262

## ASIL Determination Criteria

ASIL is determined by three parameters (S × E × C):

### Severity (S)
- S0: No injuries
- S1: Light/moderate injuries (reversible)
- S2: Severe/life-threatening injuries (survival probable)
- S3: Life-threatening/fatal injuries (survival uncertain or fatal)

### Exposure (E)
- E0: Incredible probability
- E1: Very low probability (once per lifetime)
- E2: Low probability (few times per year)
- E3: Medium probability (monthly)
- E4: High probability (almost every driving scenario)

### Controllability (C)
- C0: Controllable in general (>99% of drivers)
- C1: Simply controllable (>90%)
- C2: Normally controllable (>75%)
- C3: Difficult to control (<75%)

## ASIL Levels and Test Coverage

### QM (Quality Management)
- No specific ISO 26262 safety measures required
- Standard automotive quality methods (APQP, PPAP) apply
- Test coverage: functional tests, regression tests
- No mandatory fault injection testing

### ASIL A
- Lowest safety integrity level requiring ISO 26262 measures
- Required: FMEA, safety goal derivation
- Software: MC/DC coverage (Modified Condition/Decision Coverage) — 60%
- Test types: functional, boundary value analysis
- Review: one independent reviewer
- Minimum test coverage: 80% statement coverage

### ASIL B
- Medium safety integrity level
- Required: FMEA, FTA, FMECA for complex systems
- Software: MC/DC coverage — 80%
- Test types: functional, boundary, negative, fault injection
- Review: two independent reviewers
- Hardware diagnostics: SPFM ≥ 90%, LFM ≥ 60%
- Minimum test coverage: 90% branch coverage

### ASIL C
- High safety integrity level
- Required: FMEA, FTA, HAZOP analysis
- Software: MC/DC coverage — 100% for safety functions
- Test types: functional, boundary, negative, fault injection, timing
- Hardware diagnostics: SPFM ≥ 97%, LFM ≥ 80%
- Minimum test coverage: 100% MC/DC for safety paths
- Mandatory: formal verification for safety-critical algorithms

### ASIL D
- Highest safety integrity level
- Required: FMEA, FTA, HAZOP, FMECA, DFMEA
- Software: MC/DC coverage — 100% all paths
- Test types: ALL types including timing, safety, recovery, stress
- Hardware diagnostics: SPFM ≥ 99%, LFM ≥ 90%, PMHF < 10^-8 per hour
- Mandatory: independent software development (tool class TC3)
- Mandatory: formal methods, back-to-back testing
- Watchdog: hardware watchdog with independent power domain

## ASIL Decomposition Rules

ASIL D can be decomposed into ASIL B + ASIL B (symmetric) or ASIL A + ASIL C (asymmetric).

Example: ASIL D brake function
- Path A (primary brake controller): ASIL C
- Path B (redundant/monitoring): ASIL B

After decomposition, both elements must be independently developed (no shared common cause failures).

Decomposition requirements:
- No common cause failures between decomposed elements
- Independence of failure modes
- Separate hardware channels
- Separate software development teams
- Independent validation

## Test Case Requirements by ASIL

For ASIL D requirements, every test case MUST:
1. Include specific timing requirements (response time, cycle time)
2. Include fault injection scenarios (sensor failure, bus fault, power loss)
3. Include safe-state verification (watchdog, safe-state transition)
4. Include recovery testing (system behavior after fault removal)
5. Include stress testing (maximum load, sustained operation)
6. Verify fail-safe behavior explicitly
7. Test degraded mode operation

For ASIL C requirements:
1. Include timing verification
2. Include fault injection for at least 2 fault types
3. Verify safe-state transition
4. Test error detection mechanisms (CRC, checksums, plausibility)

For ASIL B requirements:
1. Include at least one fault injection test
2. Include boundary value tests for all safety-relevant parameters
3. Verify error detection mechanisms

## Common ASIL Mistakes to Avoid in Test Design
- Assuming system works in safe state without explicitly testing the transition
- Not testing watchdog trigger and recovery
- Testing only nominal voltage without boundary voltage conditions
- Not testing concurrent fault scenarios (fault masking)
- Ignoring startup and shutdown sequences in safety analysis
