# Automotive Test Case Design Patterns

## Equivalence Partitioning for Automotive Systems

### Principle
Divide input domain into partitions where system behavior is identical within partition.
Test one value per partition. For automotive, add boundary values.

### Example: Vehicle Speed Input (0–250 km/h)
- Invalid low: -1 km/h (below minimum — short to ground)
- Valid low boundary: 0 km/h (standstill)
- Valid nominal: 30 km/h, 80 km/h, 130 km/h (representative values)
- Valid high boundary: 250 km/h (maximum)
- Invalid high: 251 km/h (above sensor range — stuck high)

### Signal Partitions for Automotive Sensors

**Voltage-based sensors (0–5V range)**
- Short to ground: < 0.1V (invalid low)
- Valid low boundary: 0.1V (minimum valid, mapped to physical minimum)
- Nominal: 2.5V (mid-range)
- Valid high boundary: 4.9V (maximum valid)
- Short to battery: > 4.9V (invalid high)

**Current-based sensors (4–20mA)**
- Open circuit: 0 mA (wire break detection)
- Invalid low: 1–3.9 mA (below valid range)
- Valid minimum: 4 mA = physical minimum
- Valid maximum: 20 mA = physical maximum
- Short/overload: > 20.5 mA (invalid high)

## Boundary Value Analysis (BVA) Patterns

### Single Boundary
For limit L: test L-ε, L, L+ε (where ε = resolution/smallest increment)

### Automotive BVA Examples

**Battery voltage (9V–16V valid range, 12V nominal)**
- 8.9V: below undervoltage threshold → safe state
- 9.0V: exactly at threshold → test hysteresis behavior
- 9.1V: just above threshold → normal operation
- 15.9V: just below overvoltage → normal operation
- 16.0V: at overvoltage → protection activates
- 16.1V: above overvoltage → protection maintained

**Temperature (−40°C to +125°C operating range)**
- −41°C: below minimum → sensor fault or degraded mode
- −40°C: minimum valid → verify cold-start behavior
- +85°C: typical junction maximum for standard grade
- +125°C: maximum valid → verify thermal derating
- +126°C: above maximum → thermal shutdown

**CAN message counter (0–255)**
- 0: startup / first message
- 127→128: signed/unsigned boundary
- 254→255: pre-wraparound
- 255→0: wraparound — verify E2E counter handling

## State-Based Testing Patterns

### State Machine Coverage Requirements

For ASIL C/D, achieve:
- All states visited (state coverage)
- All transitions triggered (transition coverage)
- All transition guard conditions tested (predicate coverage)

### Typical ECU State Machine
```
INIT → STARTUP → NORMAL_OPERATION → (DEGRADED | SAFE_STATE | SHUTDOWN)
DEGRADED → NORMAL_OPERATION (fault resolved)
DEGRADED → SAFE_STATE (fault escalated)
SAFE_STATE → SHUTDOWN (key-off) or → INIT (reset)
```

Test sequences for complete state coverage:
1. INIT → STARTUP → NORMAL → verify nominal operation
2. NORMAL → DEGRADED → verify degraded behavior → NORMAL (recovery)
3. NORMAL → SAFE_STATE → verify safe state outputs → SHUTDOWN
4. DEGRADED → SAFE_STATE → verify escalation path

### Invalid Transition Testing
- Attempt transition SAFE_STATE → NORMAL without reset (must be rejected)
- Attempt transition INIT → SAFE_STATE (must follow defined path)
- Verify state persistence in NvM after power cycle

## Negative Testing Patterns

### Input Validation Tests
- NULL pointer input to function
- Zero-length array/buffer
- Maximum-length array/buffer (buffer overflow attempt)
- Special values: INT_MAX, INT_MIN, UINT_MAX, NaN (float), ±Infinity
- Concurrent calls from two tasks (thread safety)

### Protocol Violation Tests
- Out-of-sequence messages (step 3 before step 2)
- Duplicate message IDs
- Message too long / too short
- Invalid message content with valid checksum (post-CRC corruption)
- Request without prior authentication

### Timing Violation Tests
- Request before system initialization complete
- Request during software update
- Simultaneous requests from multiple sources

## Performance and Stress Test Patterns

### Sustained Load Testing
- Apply maximum input signal frequency for 4 hours minimum
- Verify no memory leaks (RAM usage stable)
- Verify no performance degradation (response times within spec)
- Verify NvM write counter not exceeded

### Soak Testing
- Ambient temperature cycling: −40°C to +85°C, 100 cycles
- Verify no cold-start failures
- Verify no high-temperature performance degradation

### Electrical Stress
- Apply 1000V/μs voltage transient (ESD simulation)
- Verify EMC immunity at automotive field strength levels

## Test Oracle Patterns (How to Determine Pass/Fail)

### Golden Reference Comparison
- Compare DUT output to reference model output (Model-in-the-Loop)
- Tolerance: typically ±1 LSB for ADC-derived values, ±1 bit for digital

### Specification-Based Verification
- Verify output matches specification: T_response < T_max
- Verify DTC stored with correct failure type byte
- Verify signal value within bounds: V_min ≤ V_actual ≤ V_max

### Back-to-Back Testing (ASIL D requirement)
- Run same test on two independent implementations
- Compare outputs: differences flag potential specification ambiguity

## Coverage-Driven Test Design

For ASIL D, test design must demonstrate:
- 100% requirement coverage (each REQ_xxx has ≥ 1 test)
- 100% safety goal coverage
- 100% FMEA failure mode coverage
- ≥ 90% MC/DC structural coverage
