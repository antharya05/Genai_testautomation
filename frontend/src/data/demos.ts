import type { DemoScenario } from "../types";

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "adas-aeb",
    name: "ADAS — Automatic Emergency Braking",
    description: "ISO 26262 ASIL-D requirements for AEB detection and braking response",
    icon: "🚗",
    asilLevel: "D",
    requirements: [
      "REQ_AEB_001: The AEB system shall detect obstacles using front-facing radar and camera fusion within a detection range of 0–150 meters. Upon obstacle detection, the system shall issue a brake command within 150ms. The system is classified as ASIL-D.",
      "REQ_AEB_002: The AEB system shall activate full autonomous braking when Time-To-Collision (TTC) drops below 1.5 seconds and the ego vehicle speed is above 10 km/h. The system shall decelerate at a minimum of 8 m/s². ASIL-D.",
      "REQ_AEB_003: If the primary radar sensor reports a fault (signal loss > 100ms), the AEB ECU shall transition to a degraded mode, issue a driver warning, and disable autonomous braking. The system shall log the fault with timestamp on the CAN bus. ASIL-C.",
      "REQ_AEB_004: The AEB system shall be disabled when the driver applies more than 30% brake pedal pressure, interpreted as intentional driver override. ASIL-B.",
      "REQ_AEB_005: The AEB warning chime and visual alert shall activate no later than 2.5 seconds before the predicted collision time. ASIL-A.",
    ],
  },
  {
    id: "bms",
    name: "Battery Management System",
    description: "ASIL-B/C BMS safety and monitoring requirements for EV platforms",
    icon: "🔋",
    asilLevel: "C",
    requirements: [
      "REQ_BMS_001: The BMS shall monitor individual cell voltages at a sampling rate of 10 Hz. Cell voltage must remain within 2.5V–4.25V. If any cell exceeds 4.3V or drops below 2.4V, the BMS shall open the main contactor within 50ms. ASIL-C.",
      "REQ_BMS_002: The BMS shall estimate State of Charge (SoC) using a Coulomb-counting algorithm with a maximum error of ±3% across 0–100% SoC and temperatures of −20°C to +60°C. ASIL-B.",
      "REQ_BMS_003: The BMS shall detect thermal runaway conditions when any cell temperature exceeds 80°C and rate of temperature rise exceeds 2°C/second. Upon detection, the system shall disconnect the pack within 200ms and trigger a CAN alert on frame ID 0x300. ASIL-D.",
      "REQ_BMS_004: The BMS shall balance cells when the voltage differential between the highest and lowest cell exceeds 50mV, using passive balancing. Balancing shall not occur when SoC is below 20%. ASIL-A.",
      "REQ_BMS_005: If BMS communication on the CAN bus is lost for more than 500ms, the vehicle shall enter a safe shutdown mode and apply the parking brake. ASIL-C.",
    ],
  },
  {
    id: "bcm",
    name: "Body Control Module",
    description: "BCM requirements for lighting, power windows, and access control",
    icon: "🚘",
    asilLevel: "A",
    requirements: [
      "REQ_BCM_001: The BCM shall control all exterior lighting including headlamps, tail lamps, turn signals, and hazard lights via LIN bus commands. Headlamp activation shall complete within 20ms of ignition ON signal. QM.",
      "REQ_BCM_002: The BCM shall manage power window operation for all four windows. Each window motor shall be protected by a 15A fuse and shall stop automatically if motor current exceeds 12A for more than 500ms (anti-pinch). ASIL-A.",
      "REQ_BCM_003: The BCM shall authenticate the key fob using a rolling code algorithm. Authentication shall complete within 300ms of button press. After 5 consecutive failed authentication attempts, the BCM shall lock out for 30 seconds. QM.",
      "REQ_BCM_004: The BCM shall monitor all door, hood, and trunk contact sensors at 50ms intervals. If any door is open while vehicle speed exceeds 5 km/h, a warning chime shall sound every 3 seconds. ASIL-A.",
      "REQ_BCM_005: The BCM shall supply 12V to all accessory circuits when ignition is in ACC position. Total accessory load shall not exceed 25A. If current draw exceeds 30A for more than 200ms, the BCM shall disable the accessory relay and log the event. ASIL-B.",
    ],
  },
];
