# Safety Validation — ISO 26262 Techniques

## Safety Goal Verification

### Safety Goal Definition
A safety goal is a top-level safety requirement derived from HARA (Hazard Analysis and Risk Assessment).
Format: "The {system} shall {action} to avoid {hazardous event} in {operational situation}"

Example: "The AEB system shall not apply unintended full braking to avoid collision with following vehicles when driving on highway at speeds > 30 km/h" — ASIL C

### Verification Approach for Safety Goals
1. **HARA review**: Verify ASIL assignment is justified by S × E × C analysis
2. **Safety goal derivation**: Each FTTI (Fault Tolerant Time Interval) must be covered
3. **Functional safety requirement tracing**: All FSRs trace to a safety goal
4. **Technical safety requirement tracing**: All TSRs trace to FSRs

## Fail-Safe State Testing

### Safe State Requirements
A safe state is a state where the risk has been reduced to an acceptable level. Different from normal operation.

**FTTI (Fault Tolerant Time Interval)**: Time from fault occurrence to hazardous event if no action is taken. System MUST detect fault and enter safe state within FTTI.

**FDTI (Fault Detection Time Interval)**: Time from fault to detection
**FRTI (Fault Reaction Time Interval)**: Time from detection to safe state
**Constraint**: FDTI + FRTI ≤ FTTI

### Safe State Test Procedure
1. Inject fault (hardware or software)
2. Start timer T = 0
3. Verify fault detected at T ≤ FDTI_max
4. Verify safe state entered at T ≤ FTTI_max
5. Verify safe state outputs: actuators in safe position, warning active
6. Verify no hazardous output during transition
7. Verify safe state maintained until cleared by authorized action

### Safe State Verification Checklist
- [ ] Actuators moved to safe position (brakes released, throttle closed)
- [ ] Warning indicator activated (amber/red)
- [ ] DTC stored with correct failure type
- [ ] Safe state logged with timestamp
- [ ] System does not exit safe state without authorized reset
- [ ] Redundant path (if ASIL D) continues operation in degraded mode

## FMEA-Based Test Design

### Failure Mode Test Coverage
For each FMEA failure mode, at least one test case must verify:
1. Detection mechanism detects the failure
2. Correct DTC is stored
3. Correct safe-state transition occurs
4. No secondary failures are triggered

### Top FMEA Failure Modes for Automotive ECUs

**Sensor failures (60% of automotive faults)**
- Signal stuck high
- Signal stuck low
- Signal plausibility failure (out of range but within electrical limits)
- Signal noise/intermittent
- Sensor power supply failure

**Actuator failures**
- Open circuit (no actuation)
- Short to ground (full actuation stuck)
- Stuck at partial position

**Communication failures**
- Timeout (message not received)
- CRC error
- Counter sequence error
- Bus-off

**Software failures**
- Stack overflow
- Divide by zero
- Null pointer dereference
- Array out of bounds
- Integer overflow

## Diagnostic Coverage (DC) Requirements

ISO 26262 Part 5 defines diagnostic coverage as:
DC = λ_detected / λ_total

Where λ = failure rate.

| ASIL | Required DC (SPFM) | Required DC (LFM) |
|------|---------------------|---------------------|
| A    | ≥ 60%              | ≥ 60%              |
| B    | ≥ 90%              | ≥ 60%              |
| C    | ≥ 97%              | ≥ 80%              |
| D    | ≥ 99%              | ≥ 90%              |

SPFM = Single Point Fault Metric
LFM = Latent Fault Metric

Test must verify that diagnostic mechanisms achieve the required DC.

## Watchdog Testing

### Hardware Watchdog Test Procedure
1. Verify watchdog reset occurs if software loop does not service watchdog within timeout
2. Test: Block watchdog service task for timeout_period + 10ms
3. Verify: Hardware reset occurs within 10ms of timeout expiration
4. Verify: System restarts from defined safe initial state
5. Verify: DTC "Watchdog Reset" stored after restart

### Window Watchdog (ASIL D)
- Open window: Servicing watchdog before open window → fault
- Closed window: Servicing watchdog after closed window → fault
- Only valid: Service during open window period
- Test: Service too early → verify fault detected
- Test: Service too late → verify fault detected
- Test: Service in window → verify normal operation

## Redundancy Verification

### Dual-Channel Redundancy (Common for ASIL D)
Channel A (primary) and Channel B (monitoring) must:
1. Detect if Channel A fails → Channel B takes over OR system enters safe state
2. Detect if Channel B fails → DTC stored, warning given
3. Detect if both channels disagree → cross-comparison monitoring fault

### Cross-Comparison Monitoring Test
1. Inject fault in Channel A output (offset Channel A signal by 10%)
2. Verify cross-comparison detects discrepancy within T_cross_check_cycle
3. Verify DTC stored for cross-comparison failure
4. Verify system response (degrade or safe state) per specification

## Software Safety Mechanism Testing

### CRC/Checksum Verification
- Modify one bit in a CRC-protected memory region
- Verify CRC check detects modification within one check cycle
- Verify correct error response (NvM read failure DTC)

### RAM Test (March Test / MBIST)
- Verify RAM test detects single-bit error: inject bit flip in RAM
- Verify RAM test completes within startup timing budget
- Verify RAM test failure triggers safe-state before application runs

### ROM Test
- Verify ROM CRC check runs at startup and periodically
- Verify CRC mismatch triggers DTC and prevents normal operation

### Program Flow Monitoring
- Inject software that skips a safety-critical function
- Verify program flow monitor detects missing execution within one cycle

## Functional Safety Testing at System Level

### Hardware-in-the-Loop (HIL) Testing
- Simulate real vehicle signals using HIL simulator
- Inject hardware faults (pin shorts, opens) via HIL fault insertion unit
- Verify ECU response meets FTTI and safe-state requirements
- Automated regression: run all safety test cases after every software build

### Environmental Stress Screening
- Temperature cycling: −40°C to +125°C, 200 cycles
- Vibration: per IEC 60068-2-6, automotive profile
- Humidity: 85°C/85%RH for 500 hours
- Verify functional safety properties maintained after stress
