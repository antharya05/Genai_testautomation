# AUTOSAR Architecture — Test Patterns and Validation

## AUTOSAR Layered Architecture

```
Application Layer (ASW)
    ├── Software Components (SWC)
    ├── Sensor/Actuator Components
    └── Service Components
─────────────────────────────────────
Runtime Environment (RTE)
    ├── Inter-ECU communication
    ├── Intra-ECU communication  
    └── OS interface
─────────────────────────────────────
Basic Software (BSW)
    ├── Services Layer
    │   ├── OS (OSEK/AUTOSAR OS)
    │   ├── Memory Services (NvM)
    │   ├── Communication Services (Com, PduR, CanIf)
    │   └── Diagnostic Services (Dcm, Dem, Det)
    ├── ECU Abstraction Layer (ECUAL)
    │   ├── I/O Hardware Abstraction
    │   ├── Communication Hardware Abstraction
    │   └── Memory Hardware Abstraction
    └── Microcontroller Abstraction Layer (MCAL)
        ├── ADC (Analog Digital Converter)
        ├── PWM (Pulse Width Modulation)
        ├── CAN / LIN / FlexRay / Eth driver
        └── SPI / I2C driver
```

## Software Component (SWC) Testing

### SWC Interface Testing
- Test all R-Ports (required interfaces) — inputs to SWC
- Test all P-Ports (provided interfaces) — outputs from SWC
- Verify data element consistency at each port
- Test init values at startup
- Test behavior when optional ports are unconnected

### Runnable Entity Testing
- Test each runnable triggered by:
  - TimingEvent: Verify execution every T_period ± T_jitter
  - DataReceivedEvent: Verify triggered within T_response of data arrival
  - InitEvent: Verify correct initialization sequence
  - ModeSwitchEvent: Verify correct response to mode change
- Verify runnable does not exceed Maximum Execution Time (MECT)

### Inter-SWC Communication via RTE
- Test sender/receiver communication: data flows from P-Port to R-Port
- Test client/server communication: function call completed within timeout
- Test queued communication: verify queue does not overflow under maximum load
- Test mode management: SWC responds correctly to mode changes (AUTOSAR Mode Manager)

## AUTOSAR OS Task Testing

### Task Scheduling
- Verify all tasks execute within their deadlines
- Test task activation at maximum load (all tasks activating simultaneously)
- Verify task termination (no task self-terminate violations)
- Test inter-task communication via OS Events and Message APIs

### OSEK OS Conformance
- Task state machine: suspended → ready → running → waiting
- Verify correct use of GetResource/ReleaseResource for shared data
- Priority ceiling protocol: verify no priority inversion
- Verify alarm callback timing accuracy

## Communication Stack Testing (CAN/AUTOSAR COM)

### COM Module
- Verify signal transmission cycle time matches AUTOSAR configuration
- Test signal grouping (PDU) composition and decomposition
- Test timeout monitoring for received signals
- Verify signal init values used before first reception
- Test filter algorithms for received signals

### PduR Routing
- Verify PDU routing table: each PDU routed to correct destination
- Test single-source/multi-destination routing (fan-out)
- Test gateway routing between CAN networks

### CanIf (CAN Interface)
- Verify Rx PDU filtering (acceptance filter matches CAN IDs)
- Test Tx confirmation callback timing
- Verify busoff handling and auto-recovery
- Test wake-up detection from CAN bus

### Diagnostic Communication (Dcm/Dem)
- UDS Service 0x22 (ReadDataByIdentifier): verify correct data returned
- UDS Service 0x2E (WriteDataByIdentifier): verify write protection enforced
- UDS Service 0x19 (ReadDTCInformation): verify DTC format and content
- UDS Service 0x14 (ClearDiagnosticInformation): verify DTC erasure
- UDS Service 0x27 (SecurityAccess): verify seed/key algorithm
- Dem (Diagnostic Event Manager): DTC detection, debounce, storage

## NvM (Non-Volatile Memory) Testing

### Write/Read Verification
- Write data to NvM block, reset ECU, verify data persists
- Test write cycle limits (EEPROM typically 100,000 cycles minimum)
- Test NvM block CRC verification
- Test redundant block storage (ASIL requirements)
- Verify default values on first startup (virgin block handling)

### NvM Fault Testing
- Simulate EEPROM write failure: verify error handling
- Test NvM block corruption detection: verify CRC mismatch handled
- Verify NvM write queuing under high load

## AUTOSAR Mode Management

### Application Modes
- Run mode: Normal ECU operation
- Sleep/Standby: Reduced power mode
- Shutdown: Safe power-down sequence
- Post-Run: Tasks completed before power removed

### Mode Switch Testing
- Verify correct mode transitions (no illegal transitions)
- Verify all SWCs receive mode notification
- Verify mode-specific behavior (e.g., different runnable periods in sleep)
- Verify mode transition timing (no deadlock in transition)

## End-to-End (E2E) Protection

### E2E Profile 1 (AUTOSAR standard)
- Counter: 4 bits, wraps 0→15→0
- CRC: 8-bit CRC over data + counter
- Test: verify counter increments each transmission
- Test: verify CRC mismatch detected within 1 message period
- Test: verify counter jump (gap > 1) detected and reported

### E2E Profile 5 (32-bit data protection)
- CRC: 32-bit CRC
- Test scenarios: bit flip, byte swap, replay attack (same message resent)

## Common AUTOSAR Test Findings
- RTE buffer overflow when sender produces faster than receiver consumes
- Task overrun in integrated system vs. isolated SWC test
- NvM write failure not handled gracefully at end of write cycle life
- Mode switch timeout when SWC does not acknowledge mode change
- COM signal timeout value misconfigured (too short → false timeouts)
