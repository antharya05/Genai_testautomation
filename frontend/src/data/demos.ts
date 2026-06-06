import type { DemoScenario } from "../types";

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "aeb-asil-d",
    name: "Autonomous Emergency Braking (AEB)",
    description: "TTC-based braking, radar + camera fusion, driver override handling, fault monitoring",
    icon: "🛑",
    asilLevel: "D",
    requirements: [
      "REQ_AEB_001: The AEB system shall activate autonomous emergency braking when the Time-To-Collision (TTC) drops below 1.5 seconds and ego vehicle speed exceeds 10 km/h. The system shall command a minimum deceleration of 8 m/s² within 150 ms of threshold breach. Classification: ASIL-D.",
      "REQ_AEB_002: The AEB system shall fuse radar and camera data using a Kalman-filter-based sensor fusion algorithm. The fused object model shall be updated at a minimum frequency of 50 Hz. A single-sensor failure shall not cause false braking activation. Classification: ASIL-D.",
      "REQ_AEB_003: The AEB system shall monitor primary radar sensor health at 10 ms intervals. If radar signal loss exceeds 100 ms, the system shall transition to degraded mode: disable autonomous braking, issue a CAN fault frame (ID 0x2A0), and activate the driver warning indicator within 200 ms. Classification: ASIL-C.",
      "REQ_AEB_004: The AEB system shall interpret a driver brake pedal input exceeding 30% of full travel as a driver override. Upon detection, autonomous braking shall be cancelled within 50 ms, and the AEB function shall remain inhibited for the current drive cycle. Classification: ASIL-B.",
      "REQ_AEB_005: The AEB system shall perform a self-test at ignition ON, verifying sensor connectivity, ECU checksum, and CAN bus integrity within 500 ms. Any detected fault shall be logged to non-volatile memory with timestamp, fault code, and sensor identifier. Classification: ASIL-C.",
    ],
  },
  {
    id: "acc-asil-c",
    name: "Adaptive Cruise Control (ACC)",
    description: "Distance control, speed adaptation, lead vehicle tracking, resume behavior",
    icon: "🚗",
    asilLevel: "C",
    requirements: [
      "REQ_ACC_001: The ACC system shall maintain a time headway to the lead vehicle of 1.0 s, 1.5 s, or 2.0 s as selected by the driver. The actual headway error shall not exceed ±0.2 s under steady-state following conditions on dry roads. Classification: ASIL-C.",
      "REQ_ACC_002: The ACC system shall adapt ego vehicle speed to the lead vehicle speed within the set speed limit. When the lead vehicle decelerates at a rate exceeding 3 m/s², the ACC controller shall apply a deceleration response within 300 ms. Classification: ASIL-C.",
      "REQ_ACC_003: The ACC system shall track the lead vehicle using radar sensor data with a range of 0–200 m and azimuth resolution of ±0.5°. If the lead vehicle changes lane and no new target is acquired within 1.0 s, the ACC shall resume set speed with a maximum acceleration of 1.5 m/s². Classification: ASIL-B.",
      "REQ_ACC_004: After an ACC pause event triggered by driver override (braking or steering > 45°), the ACC system shall not resume automatically. The driver shall explicitly activate the Resume function. Resume shall only be permitted at speeds above 30 km/h. Classification: ASIL-C.",
      "REQ_ACC_005: The ACC system shall be inhibited and the driver shall be notified when ambient visibility conditions are detected as insufficient by the rain/light sensor (luminance < 50 lux and wiper speed set to continuous). Classification: ASIL-A.",
    ],
  },
  {
    id: "lka-asil-b",
    name: "Lane Keeping Assist (LKA)",
    description: "Lane boundary detection, steering correction, driver intervention, camera degradation handling",
    icon: "🛣️",
    asilLevel: "B",
    requirements: [
      "REQ_LKA_001: The LKA system shall detect lane markings using a forward-facing monocular camera with a minimum detection range of 60 m at vehicle speeds above 60 km/h. Lane boundary confidence threshold for active steering intervention shall be 85% or higher. Classification: ASIL-B.",
      "REQ_LKA_002: The LKA system shall apply a corrective steering torque of 0.5–3.0 Nm when the predicted lateral deviation exceeds 0.3 m within 1.5 s. The steering correction shall be smooth, with a torque ramp rate not exceeding 2.0 Nm/s. Classification: ASIL-B.",
      "REQ_LKA_003: The LKA system shall classify a hands-off-wheel condition when steering torque sensor input is below 0.15 Nm for more than 10 seconds. The system shall issue a staged alert: visual warning at 10 s, audible chime at 12 s, and automatic deactivation of LKA at 15 s. Classification: ASIL-B.",
      "REQ_LKA_004: The LKA system shall detect camera sensor degradation (image blur, lens obstruction, or low contrast) and transition to a graceful degradation state. In this state, active steering corrections shall be disabled, and the driver shall receive a persistent status indicator on the cluster. Classification: ASIL-B.",
      "REQ_LKA_005: The LKA system shall not apply steering corrections when the driver activates the turn signal corresponding to the direction of the impending lane departure. Deactivation of correction shall occur within 100 ms of turn signal activation. Classification: ASIL-A.",
    ],
  },
  {
    id: "bms-asil-c",
    name: "Battery Management System (BMS)",
    description: "Cell voltage monitoring, thermal protection, fault isolation, charging safety",
    icon: "🔋",
    asilLevel: "C",
    requirements: [
      "REQ_BMS_001: The BMS shall monitor individual cell voltages at 10 Hz. Each cell shall remain within the operating window of 2.5 V to 4.25 V. If any cell voltage exceeds 4.3 V or falls below 2.4 V, the BMS shall open the main contactor within 50 ms and log a Cell Overvoltage or Undervoltage fault event. Classification: ASIL-C.",
      "REQ_BMS_002: The BMS shall detect thermal runaway precursor conditions when any cell temperature exceeds 75 °C and the rate of temperature rise exceeds 2 °C/s for more than 500 ms. Upon detection, the BMS shall disconnect the high-voltage bus, activate the vehicle hazard lights via CAN, and send a thermal alert on frame ID 0x300. Classification: ASIL-D.",
      "REQ_BMS_003: The BMS shall isolate faulty cell groups using solid-state contactors within 100 ms of detecting an internal short circuit (impedance < 1 mΩ). Isolation shall preserve at least 60% of nominal pack capacity for limp-home operation where possible. Classification: ASIL-C.",
      "REQ_BMS_004: During DC fast charging, the BMS shall enforce a maximum charge current of C/2 when any cell temperature exceeds 45 °C, and shall terminate charging when cell temperature exceeds 55 °C. The BMS shall communicate charge limits to the off-board charger via ISO 15118 CAN messages every 100 ms. Classification: ASIL-B.",
      "REQ_BMS_005: If CAN bus communication between the BMS and the Vehicle Control Unit is interrupted for more than 500 ms, the BMS shall enter safe state: open main contactor, activate hazard lights, and write a communication fault record to non-volatile memory with vehicle mileage and timestamp. Classification: ASIL-C.",
    ],
  },
  {
    id: "bsm-asil-a",
    name: "Blind Spot Monitoring (BSM)",
    description: "Object detection, side radar validation, driver warning generation, sensor fault behavior",
    icon: "👁️",
    asilLevel: "A",
    requirements: [
      "REQ_BSM_001: The BSM system shall detect vehicles in the blind spot zone (1.5 m to 6.0 m lateral, ±3 m longitudinal from rear axle) using short-range radar sensors on both sides of the vehicle. Detection shall be confirmed within 200 ms of object entry into the zone at relative speeds up to 50 km/h. Classification: ASIL-A.",
      "REQ_BSM_002: The BSM system shall validate radar target plausibility using a two-cycle confirmation filter: a detected object shall be classified as a valid blind-spot target only if detected in two consecutive 50 ms radar scans with position variance below 0.2 m. Classification: ASIL-A.",
      "REQ_BSM_003: The BSM system shall activate a visual warning indicator on the relevant door mirror within 250 ms of a valid blind-spot target detection. If the driver activates the turn signal toward the occupied blind spot, the BSM shall additionally trigger an audible chime of at least 65 dB(A) measured at the driver's ear position. Classification: ASIL-A.",
      "REQ_BSM_004: The BSM system shall perform a self-diagnostic cycle at each ignition ON and at 1-minute intervals during operation. If either radar sensor reports a blockage (SNR < 6 dB for more than 3 consecutive scans), the BSM function shall be deactivated, the driver notified via the instrument cluster, and a DTC stored in the diagnostic memory. Classification: ASIL-A.",
      "REQ_BSM_005: The BSM system shall suppress false target detection caused by stationary roadside barriers. A detected object shall not trigger a driver warning unless its relative longitudinal velocity with respect to the ego vehicle is greater than 2 km/h, indicating an overtaking or overtaken vehicle. Classification: QM.",
    ],
  },
];
