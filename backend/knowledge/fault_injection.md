# Fault Injection Testing — Automotive Systems

## Purpose and Scope
Fault injection testing verifies that a system correctly handles hardware and software faults. Required by ISO 26262 for ASIL B and above. The system must either:
1. Correct the fault (error correction)
2. Detect and report the fault (error detection)
3. Enter a safe state (fail-safe response)

## Hardware Fault Types

### Power Supply Faults
- Undervoltage: Supply below V_min (typically <9V for 12V systems, <22V for 48V systems)
- Overvoltage: Supply above V_max (typically >16V for 12V systems)
- Power surge: Short-duration voltage spike > 2× nominal (load dump: up to 100V, 400ms)
- Power interruption: Complete loss of supply for 50ms–2000ms
- Slow power ramp-down: Supply decreases at 0.1V/ms (battery discharge simulation)
- Reverse polarity: Negative voltage applied (should not destroy hardware)
- Ripple: 100mVpp AC ripple superimposed on DC supply

### Sensor/Input Faults
- Short circuit to ground (SCG): Signal line connected to GND
- Short circuit to battery (SCB): Signal line connected to VBAT
- Open circuit (OC): Signal line disconnected
- Out-of-range high: Signal above valid range maximum
- Out-of-range low: Signal below valid range minimum
- Stuck-at value: Signal frozen at one value
- Intermittent fault: Signal oscillates between valid/invalid (50ms period)
- Cross-wiring: Two signals swapped
- Excessive noise: Signal-to-noise ratio reduced to 20dB

### Communication Faults (CAN/LIN/FlexRay)
- Bus-off condition: CAN controller enters bus-off state
- CRC error: Corrupted message CRC
- Message timeout: Expected message not received within deadline
- Bit stuffing error: Invalid bus state sequence
- Node failure: Complete loss of a CAN node
- Bus termination removed: Reflection causing signal integrity issues
- Message ID collision: Two nodes transmitting same CAN ID
- Babbling idiot: Node transmits continuously without arbitration

### Actuator/Output Faults
- Output short to ground
- Output open circuit (load disconnected)
- Output short to battery
- Actuator stuck (mechanical jam)
- Driver overtemperature (thermal shutdown)
- Overcurrent condition

## Software Fault Injection

### Memory Corruption
- RAM bit flip (single-bit error): Flip one bit in critical variable
- RAM byte corruption: Replace byte with random value
- Stack overflow: Fill stack to maximum
- Heap exhaustion: Allocate memory until allocation fails
- Stack underflow: Return from function with corrupted return address
- Data corruption in safety-relevant buffer

### Task/Scheduling Faults
- Task blocked: Critical task unable to run for 2× its period
- Task overrun: Force task to exceed execution time budget
- Interrupt storm: Trigger 1000 interrupts per millisecond
- Watchdog intentional miss: Prevent watchdog service for > timeout period
- Priority inversion: Low-priority task holding resource needed by high-priority task

### Communication Software Faults
- E2E check failure injection: Corrupt E2E counter
- Signal timeout injection: Stop sending a safety-critical signal
- Sequence counter wrap: Test wrap-around handling at 255→0

## Fault Injection Test Procedure

### Standard Procedure (ASIL B/C/D)
1. **Baseline**: Verify system operates correctly without fault
2. **Fault injection**: Apply specific fault condition
3. **Detection verification**: Verify fault is detected within T_detection_max
4. **Response verification**: Verify system response matches specified safe behavior
5. **Fault removal**: Remove fault condition
6. **Recovery verification**: Verify system recovers within T_recovery_max
7. **State verification**: Verify no permanent damage or latent faults

### Pass Criteria
- Fault detected within specified detection time
- System transitions to correct safe state (not arbitrary state)
- No unintended reactions (spurious outputs, uncontrolled actuation)
- DTCs stored in non-volatile memory
- System recovers correctly after fault removal
- No secondary faults triggered by fault response

## Detection Time Requirements by System
- Safety-critical sensor fault (ASIL D): ≤ 10ms detection
- CAN message timeout (ASIL C): ≤ 2× message cycle time
- Power undervoltage (ASIL B+): ≤ 50ms
- Actuator driver fault: ≤ 100ms
- Software watchdog missed kick: ≤ watchdog_timeout + 10ms

## Safe States by System Type

### Braking System
Safe state: Maintain last valid brake pressure + activate warning
Fail-operational: Reduced brake capability with driver warning

### Steering System  
Safe state: Disable torque assistance + alert driver (return to manual steering)
ASIL D: Fail-operational for steer-by-wire (redundant actuator)

### Powertrain
Safe state: Torque reduction to idle, gear hold, engine warning lamp
ASIL D Engine: Torque output limited to prevent runaway

### Body Control
Safe state: Deactivate non-safety functions, maintain lighting

## Fault Masking Analysis
Test combinations of simultaneous faults (ASIL D requirement):
- Primary sensor fault + secondary sensor fault simultaneously
- Power fault + communication fault simultaneously
- Verify no fault masking (both faults detected independently)
