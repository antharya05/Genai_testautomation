# Timing Validation Requirements — Automotive Embedded Systems

## Response Time Requirements by System Class

### Powertrain Systems
- Engine control command response: ≤ 10ms from trigger to actuator
- Throttle response to driver demand: ≤ 20ms
- Injection timing accuracy: ±0.1° crankshaft angle
- Misfire detection: within one combustion cycle (< 25ms at idle)
- Knock detection and response: ≤ 8ms

### Braking Systems (ASIL C/D)
- AEB trigger to hydraulic brake pressure build: ≤ 150ms
- Electronic brake force distribution response: ≤ 30ms
- ABS intervention cycle: 5–15ms modulation cycle
- Brake-by-wire latency (safety-critical path): ≤ 20ms
- Parking brake engagement: ≤ 500ms
- Emergency brake assist activation: ≤ 50ms

### Steering Systems (EPS/SbW)
- EPS torque assist response: ≤ 5ms
- Steer-by-wire lateral control response: ≤ 30ms
- Steering angle sensor update rate: ≥ 100Hz (10ms cycle)
- Tie-rod force feedback latency: ≤ 20ms

### ADAS Systems
- Object detection update rate: ≤ 100ms (camera), ≤ 50ms (radar)
- Sensor fusion output rate: ≥ 25Hz (40ms cycle)
- AEB decision to brake trigger: ≤ 100ms
- Lane departure warning response: ≤ 500ms after lane crossing
- ACC speed adjustment: ≤ 200ms
- Pedestrian detection and classification: ≤ 200ms

### Body Control (ASIL A/B)
- Turn indicator response: ≤ 100ms
- Central locking response: ≤ 500ms
- Window lift command to motion: ≤ 200ms
- Airbag deployment: ≤ 30ms from crash detection
- Immobilizer check: ≤ 1000ms at startup

### Communication Timing
- CAN 2.0B nominal bit rate: 500kbps (max 1Mbps)
- CAN FD: up to 8Mbps data phase
- LIN bus cycle: 10ms–20ms
- FlexRay cycle: 1ms–20ms (typical 5ms)
- Automotive Ethernet (100Base-T1): 100Mbps
- SOME/IP service discovery timeout: 500ms

## Diagnostic Cycle Times
- OBD-II readiness monitor cycle: per drive cycle (typically 500ms–2min)
- DTC detection time: ≥ 2 consecutive failed cycles (debounce)
- DTC healing: ≥ 40 consecutive passed cycles
- Fault detection threshold: typically within 50ms of fault occurrence
- Safety monitor cycle time: ≤ 10ms for ASIL C/D
- E2E protection check cycle: every CAN message transmission

## Watchdog Requirements
- Hardware watchdog trigger time: configurable, typical 10ms–100ms
- Software watchdog service interval: ≤ 50% of watchdog timeout
- Watchdog response (reset): ≤ 10ms after timeout
- Independent watchdog for ASIL D: separate power domain, external IC

## Timing Test Patterns

### Response Time Verification
1. Establish steady-state conditions
2. Apply stimulus (input signal, command, event)
3. Measure time to output response using oscilloscope or HIL
4. Verify response within specified window: T_min ≤ T_response ≤ T_max
5. Repeat minimum 1000 times for statistical validity (ASIL D)

### Cycle Time Verification
1. Monitor output signal for 10 seconds minimum
2. Measure period between consecutive output updates
3. Verify: |T_actual - T_nominal| ≤ T_jitter_max
4. Check for missed cycles (output unchanged for > 2× nominal period)

### Timeout Verification
1. Remove/disconnect input signal
2. Start timer
3. Verify system enters safe state within T_timeout
4. Verify safe state is maintained until input restored
5. Verify recovery after input restoration

## Jitter Tolerances
- ASIL D timing functions: ±1ms jitter maximum
- ASIL C: ±5ms jitter maximum
- ASIL B: ±10ms jitter maximum
- QM/A communication: ±20ms jitter acceptable

## Common Timing Faults to Test
- Task overrun (task takes longer than its period)
- Scheduling preemption causing deadline miss
- Interrupt storm causing timing violation
- Memory access contention delaying real-time tasks
- Clock drift (crystal tolerance ±20ppm → 72ms/hour drift)
- Bus overload causing message delay
- Power supply fluctuation causing processor slowdown
