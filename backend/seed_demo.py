"""
Demo data seeding script.

Run from backend/ before a demo:
    python seed_demo.py

Clears all projects, runs, requirements, and test cases, then populates
the database with 3 curated automotive projects (AEB, BMS, LKA) containing
realistic requirements, test cases, review statuses, and coverage metrics.
"""

import os
import sys
import uuid
from datetime import datetime, timedelta

# Ensure backend/ is on sys.path so imports resolve the same way as main.py
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from database import Base, SessionLocal, engine
import db_models  # noqa: F401 ? registers all ORM tables
from db_models import AppConfig, Project, ProviderKey, Requirement, Run, TestCaseDB

# -- Fixed project IDs so the seeded state is reproducible ------------------

AEB_ID = "aeb00000-demo-0000-0000-000000000001"
BMS_ID = "bms00000-demo-0000-0000-000000000002"
LKA_ID = "lka00000-demo-0000-0000-000000000003"

NOW = datetime.utcnow()


def _run_id() -> str:
    return str(uuid.uuid4())


def _tc_id() -> str:
    return str(uuid.uuid4())


# ???????????????????????????????????????????????????????????????????????????
# REQUIREMENTS DATA
# ???????????????????????????????????????????????????????????????????????????

AEB_REQUIREMENTS = [
    ("REQ-AEB-001", "The AEB system shall detect stationary and moving obstacles within the vehicle path at velocities between 5 km/h and 130 km/h using a combination of radar and camera sensors."),
    ("REQ-AEB-002", "The system shall initiate emergency braking within 600 ms of confirmed obstacle detection, achieving a minimum deceleration of 8 m/s? under dry road conditions."),
    ("REQ-AEB-003", "The AEB system shall not activate under false positive conditions including road debris smaller than 100 mm, overhead structures, and oncoming vehicles in adjacent lanes."),
    ("REQ-AEB-004", "When time-to-collision is less than 1.5 seconds the system shall reduce vehicle speed by a minimum of 40% before impact, provided road surface ? ? 0.4."),
    ("REQ-AEB-005", "The AEB system and all safety-critical software components shall be developed and validated in accordance with ISO 26262 ASIL-D requirements."),
    ("REQ-AEB-006", "The system shall provide a visual and audible pre-collision warning to the driver at least 2.5 seconds before predicted impact when TTC < 3.5 seconds."),
]

BMS_REQUIREMENTS = [
    ("REQ-BMS-001", "The BMS shall monitor individual cell voltages with a measurement accuracy of ?5 mV across the full temperature range of -40?C to +85?C."),
    ("REQ-BMS-002", "The system shall inhibit charging operations when any individual cell temperature exceeds 45?C or falls below -10?C and resume autonomously when conditions return to safe range."),
    ("REQ-BMS-003", "The BMS shall perform passive cell balancing to maintain cell voltage deviation within 20 mV during the constant-voltage charging phase."),
    ("REQ-BMS-004", "Upon detection of a short circuit condition the system shall open the main contactor and enter safe state within 10 ms, isolating the pack from the vehicle bus."),
    ("REQ-BMS-005", "The BMS shall estimate and report state of charge (SoC) with an accuracy of ?2% under all operating conditions using a Coulomb counting algorithm with Kalman filter correction."),
    ("REQ-BMS-006", "The system shall log all fault events with timestamps to non-volatile memory retaining a minimum of 500 fault records across power cycles."),
]

LKA_REQUIREMENTS = [
    ("REQ-LKA-001", "The LKA system shall detect lane markings (solid white, dashed white, solid yellow) with a confidence level above 85% under daylight conditions and above 70% under low-light or wet road conditions."),
    ("REQ-LKA-002", "Upon detection of unintentional lane departure the system shall apply corrective steering torque within 200 ms, limited to 3 Nm to maintain driver override authority."),
    ("REQ-LKA-003", "The LKA system shall disengage immediately and return steering authority to the driver when the system detects driver torque input exceeding 1.5 Nm for more than 200 ms."),
    ("REQ-LKA-004", "The system shall remain operational in adverse weather conditions including moderate rain (up to 50 mm/hr), light fog (visibility > 100 m), and light snow accumulation on road surface."),
    ("REQ-LKA-005", "The LKA system shall not engage below 60 km/h or above 180 km/h and shall disengage gracefully with driver notification when vehicle speed exits the operational envelope."),
    ("REQ-LKA-006", "The system shall store the last 60 seconds of lane departure events and steering interventions in a ring buffer accessible via the diagnostic interface (ISO 15765-2)."),
]


# ???????????????????????????????????????????????????????????????????????????
# TEST CASE DATA
# ???????????????????????????????????????????????????????????????????????????

def _aeb_test_cases(run_id: str) -> list[dict]:
    return [
        # REQ-AEB-001
        {
            "run_id": run_id, "test_id": "TC_001", "requirement_id": "REQ-AEB-001",
            "title": "AEB Detection ? Stationary obstacle at 5 km/h (lower boundary)",
            "asil": "D", "test_type": "boundary",
            "preconditions": ["Vehicle travelling at 5 km/h on dry straight road", "Radar and camera sensors operational", "AEB system enabled"],
            "steps": ["Position stationary 500 kg barrier 30 m ahead", "Maintain 5 km/h approach speed with no driver braking input", "Record sensor output and system activation timestamp"],
            "expected_results": ["Obstacle detected within 25 m", "AEB activation within 600 ms of detection", "Vehicle speed reduced to 0 before contact"],
            "source_requirement_text": AEB_REQUIREMENTS[0][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "Verified with HIL test bench. Results consistent.", "reviewed_at": (NOW - timedelta(days=1)).isoformat(),
        },
        {
            "run_id": run_id, "test_id": "TC_002", "requirement_id": "REQ-AEB-001",
            "title": "AEB Detection ? Moving obstacle at 130 km/h (upper boundary)",
            "asil": "D", "test_type": "boundary",
            "preconditions": ["Vehicle travelling at 130 km/h on motorway", "Lead vehicle decelerating at 0.5 g", "Radar sensor range set to maximum (150 m)"],
            "steps": ["Set ego vehicle speed to 130 km/h", "Program lead vehicle to decelerate from 130 km/h to 60 km/h at 0.5 g", "Monitor sensor detection range and AEB trigger point"],
            "expected_results": ["Obstacle detected at ? 80 m range", "Pre-collision warning issued at TTC ? 3.5 s", "AEB activates if driver does not respond within 1 s of warning"],
            "source_requirement_text": AEB_REQUIREMENTS[0][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "Track test completed 2024-11. Pass.", "reviewed_at": (NOW - timedelta(days=1)).isoformat(),
        },
        # REQ-AEB-002
        {
            "run_id": run_id, "test_id": "TC_003", "requirement_id": "REQ-AEB-002",
            "title": "AEB Braking Latency ? 600 ms activation requirement",
            "asil": "D", "test_type": "timing",
            "preconditions": ["Vehicle at 50 km/h on dry road (? = 0.9)", "Obstacle confirmed detected by sensor fusion module", "High-speed data logger running at 1 kHz"],
            "steps": ["Trigger obstacle detection event via test harness at T=0", "Measure time from detection confirmation to brake actuator engagement", "Record deceleration profile with inertial measurement unit"],
            "expected_results": ["Brake actuator engages within 600 ms (T ? 600 ms)", "Deceleration reaches 8 m/s? within 200 ms of actuator engagement", "No spurious brake events in the 500 ms window before trigger"],
            "source_requirement_text": AEB_REQUIREMENTS[1][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "", "reviewed_at": (NOW - timedelta(hours=6)).isoformat(),
        },
        # REQ-AEB-003
        {
            "run_id": run_id, "test_id": "TC_004", "requirement_id": "REQ-AEB-003",
            "title": "AEB False Positive ? Overhead bridge structure rejection",
            "asil": "C", "test_type": "negative",
            "preconditions": ["Vehicle travelling at 80 km/h", "Camera and radar fully operational", "Overhead bridge with clearance of 4.2 m on test route"],
            "steps": ["Drive vehicle under overhead bridge at 80 km/h", "Monitor AEB activation signal continuously", "Repeat 10 times across different approach angles"],
            "expected_results": ["AEB does not activate during any of the 10 passes", "No pre-collision warning issued", "Sensor fusion log shows bridge correctly classified as non-obstacle"],
            "source_requirement_text": AEB_REQUIREMENTS[2][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "needs_revision", "review_note": "Test only covers 4.2 m clearance. Need to add 3.8 m and 5.0 m variants to cover envelope.", "reviewed_at": (NOW - timedelta(hours=3)).isoformat(),
        },
        {
            "run_id": run_id, "test_id": "TC_005", "requirement_id": "REQ-AEB-003",
            "title": "AEB False Positive ? Oncoming vehicle in adjacent lane",
            "asil": "C", "test_type": "negative",
            "preconditions": ["Two-lane road with 3.5 m lane width", "Oncoming vehicle at 70 km/h closing speed", "Ego vehicle at 80 km/h"],
            "steps": ["Set up oncoming vehicle in left lane at lateral offset > 3.0 m", "Approach at combined closing speed of 150 km/h", "Monitor AEB output for activation"],
            "expected_results": ["AEB system does not activate", "Radar discriminates oncoming vehicle from path-relevant obstacles", "Event log shows correct lateral classification"],
            "source_requirement_text": AEB_REQUIREMENTS[2][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "", "reviewed_at": (NOW - timedelta(hours=2)).isoformat(),
        },
        # REQ-AEB-004
        {
            "run_id": run_id, "test_id": "TC_006", "requirement_id": "REQ-AEB-004",
            "title": "AEB Speed Reduction ? 40% minimum at TTC < 1.5 s on dry road",
            "asil": "D", "test_type": "functional",
            "preconditions": ["Vehicle at 72 km/h (20 m/s)", "TTC to stationary obstacle = 1.4 s", "Road surface ? = 0.85"],
            "steps": ["Configure obstacle at distance = 28 m with vehicle at 20 m/s", "Disable driver braking input", "Allow AEB to execute full braking cycle", "Measure vehicle speed at point of contact"],
            "expected_results": ["Vehicle speed at contact ? 43.2 km/h (60% of initial 72 km/h)", "Braking force maintained until speed threshold met", "No ABS instability detected"],
            "source_requirement_text": AEB_REQUIREMENTS[3][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "Passed 5/5 runs. Avg speed reduction: 44.1%.", "reviewed_at": (NOW - timedelta(hours=5)).isoformat(),
        },
        # REQ-AEB-005
        {
            "run_id": run_id, "test_id": "TC_007", "requirement_id": "REQ-AEB-005",
            "title": "AEB ISO 26262 ASIL-D ? Single point fault containment",
            "asil": "D", "test_type": "fault_injection",
            "preconditions": ["AEB ECU connected to fault injection harness", "Vehicle stationary in safe test environment", "All safety monitors active"],
            "steps": ["Inject single-bit fault into radar sensor CAN message at T=0", "Monitor AEB system response and fault isolation", "Verify system transitions to safe state within defined latency", "Check diagnostic trouble code (DTC) logging"],
            "expected_results": ["System detects fault within 10 ms", "AEB function disabled gracefully with driver warning", "Vehicle controllability maintained", "DTC P1A47 logged with timestamp"],
            "source_requirement_text": AEB_REQUIREMENTS[4][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "pending", "review_note": "", "reviewed_at": None,
        },
        # REQ-AEB-006
        {
            "run_id": run_id, "test_id": "TC_008", "requirement_id": "REQ-AEB-006",
            "title": "AEB Warning Timing ? Audible and visual alert at TTC ? 3.5 s",
            "asil": "C", "test_type": "timing",
            "preconditions": ["Vehicle at 100 km/h", "Stationary obstacle at 100 m", "HMI display and speaker operational"],
            "steps": ["Approach obstacle at 100 km/h (TTC ? 3.6 s at detection)", "Monitor instrument cluster and speaker output", "Record exact timestamp of first warning relative to TTC calculation"],
            "expected_results": ["Visual warning (amber icon) activates when TTC ? 3.5 s", "Audible beep sequence starts simultaneously (? 50 ms after visual)", "Warning persists until TTC > 4.0 s or AEB activates"],
            "source_requirement_text": AEB_REQUIREMENTS[5][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "pending", "review_note": "", "reviewed_at": None,
        },
        # Recovery test
        {
            "run_id": run_id, "test_id": "TC_009", "requirement_id": "REQ-AEB-002",
            "title": "AEB System Recovery ? Re-enable after driver override",
            "asil": "C", "test_type": "recovery",
            "preconditions": ["AEB system active", "Previous AEB activation completed 5 seconds ago", "Vehicle speed > 10 km/h"],
            "steps": ["Allow AEB activation and vehicle deceleration", "Driver applies gas pedal to indicate intentional override", "Wait 5 seconds", "Verify AEB system re-arms automatically"],
            "expected_results": ["AEB system re-enables without driver action after 5 s", "System status indicator returns to active (green)", "Next obstacle detection triggers normal AEB response"],
            "source_requirement_text": AEB_REQUIREMENTS[1][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "", "reviewed_at": (NOW - timedelta(hours=4)).isoformat(),
        },
    ]


def _bms_test_cases(run_id: str) -> list[dict]:
    return [
        # REQ-BMS-001
        {
            "run_id": run_id, "test_id": "TC_001", "requirement_id": "REQ-BMS-001",
            "title": "BMS Voltage Accuracy ? ?5 mV at -40?C (lower temperature boundary)",
            "asil": "C", "test_type": "boundary",
            "preconditions": ["BMS under test in thermal chamber set to -40?C", "Reference precision voltmeter connected (accuracy ?1 mV)", "Cells stabilised at temperature for 30 minutes"],
            "steps": ["Apply reference voltage of 3.200 V to cell input terminal", "Record BMS displayed voltage over 100 samples", "Calculate mean absolute error against reference"],
            "expected_results": ["All 100 samples within ?5 mV of 3.200 V reference", "Mean absolute error ? 3 mV", "No sample outliers beyond ?8 mV"],
            "source_requirement_text": BMS_REQUIREMENTS[0][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "Passed in thermal chamber. Log attached.", "reviewed_at": (NOW - timedelta(days=2)).isoformat(),
        },
        {
            "run_id": run_id, "test_id": "TC_002", "requirement_id": "REQ-BMS-001",
            "title": "BMS Voltage Accuracy ? ?5 mV at +85?C (upper temperature boundary)",
            "asil": "C", "test_type": "boundary",
            "preconditions": ["BMS in thermal chamber at +85?C", "Cells stabilised for 30 minutes at temperature", "Reference voltmeter connected"],
            "steps": ["Apply 4.150 V reference voltage to each cell channel sequentially", "Record 100 voltage samples per channel", "Compute error statistics per channel"],
            "expected_results": ["All channels: mean absolute error ? 5 mV", "No cross-channel interference detected", "ADC gain drift within specification at 85?C"],
            "source_requirement_text": BMS_REQUIREMENTS[0][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "", "reviewed_at": (NOW - timedelta(days=1, hours=6)).isoformat(),
        },
        # REQ-BMS-002
        {
            "run_id": run_id, "test_id": "TC_003", "requirement_id": "REQ-BMS-002",
            "title": "BMS Charge Inhibit ? Overtemperature cutoff at 45?C",
            "asil": "C", "test_type": "functional",
            "preconditions": ["BMS connected to CC/CV charger", "Cell temperatures at 40?C (within normal range)", "Charging in progress at 1C rate"],
            "steps": ["Ramp thermal chamber from 40?C to 46?C at 1?C/min", "Monitor charger output current and BMS charge enable signal", "Record exact temperature at which BMS disables charging"],
            "expected_results": ["Charging inhibited at or before 45?C cell temperature", "Charger current drops to 0 A within 500 ms of inhibit signal", "BMS broadcasts fault code 0x23 on CAN bus"],
            "source_requirement_text": BMS_REQUIREMENTS[1][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "Inhibit triggers at 44.8?C consistently. Good margin.", "reviewed_at": (NOW - timedelta(days=1)).isoformat(),
        },
        {
            "run_id": run_id, "test_id": "TC_004", "requirement_id": "REQ-BMS-002",
            "title": "BMS Charge Resume ? Autonomous re-enable after temperature recovery",
            "asil": "B", "test_type": "recovery",
            "preconditions": ["BMS in charge-inhibited state due to overtemperature", "Cell temperature now cooling from 46?C"],
            "steps": ["Allow thermal chamber to cool at natural rate", "Monitor BMS charge enable signal and temperature reading", "Record temperature at which charging resumes"],
            "expected_results": ["Charging automatically resumes when temperature drops below 43?C (2?C hysteresis)", "Resume latency ? 2 seconds after threshold crossing", "No user intervention required"],
            "source_requirement_text": BMS_REQUIREMENTS[1][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "pending", "review_note": "", "reviewed_at": None,
        },
        # REQ-BMS-003
        {
            "run_id": run_id, "test_id": "TC_005", "requirement_id": "REQ-BMS-003",
            "title": "BMS Cell Balancing ? Voltage deviation ? 20 mV during CV phase",
            "asil": "B", "test_type": "functional",
            "preconditions": ["Pack with 16 cells pre-conditioned to 50 mV imbalance (range 3.950 V ? 4.000 V)", "Charging in CC phase transitioning to CV at 4.1 V"],
            "steps": ["Begin CV phase charging at 4.1 V / 0.5C max", "Sample all 16 cell voltages every 5 seconds", "Allow balancing to run for 45 minutes", "Compute max cell voltage deviation at 45-minute mark"],
            "expected_results": ["Cell voltage deviation ? 20 mV at end of test", "No cell voltage exceeds 4.200 V", "Balancing dissipation within thermal limits"],
            "source_requirement_text": BMS_REQUIREMENTS[2][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "Final deviation: 12 mV. Balancing effective.", "reviewed_at": (NOW - timedelta(hours=8)).isoformat(),
        },
        # REQ-BMS-004
        {
            "run_id": run_id, "test_id": "TC_006", "requirement_id": "REQ-BMS-004",
            "title": "BMS Short Circuit Protection ? Main contactor opens within 10 ms",
            "asil": "D", "test_type": "fault_injection",
            "preconditions": ["BMS in normal operating state, pack delivering 100 A", "High-speed oscilloscope triggered on current spike", "Safety barriers and PPE in place"],
            "steps": ["Apply controlled external short across pack positive and negative terminals via test relay", "Measure time from short detection to main contactor open via oscilloscope", "Inspect contactor arc suppression"],
            "expected_results": ["Main contactor opens within 10 ms of short detection", "Current waveform shows clean cutoff without oscillation", "BMS enters safe state and logs DTC 0x41"],
            "source_requirement_text": BMS_REQUIREMENTS[3][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "Measured: 7.2 ms average. ASIL-D requirement met.", "reviewed_at": (NOW - timedelta(days=1, hours=2)).isoformat(),
        },
        # REQ-BMS-005
        {
            "run_id": run_id, "test_id": "TC_007", "requirement_id": "REQ-BMS-005",
            "title": "BMS SoC Accuracy ? ?2% estimation across full charge/discharge cycle",
            "asil": "B", "test_type": "functional",
            "preconditions": ["Pack fully charged to 100% SoC (verified by OCV method)", "Reference Coulomb counter calibrated (?0.1% accuracy)", "Temperature held constant at 25?C"],
            "steps": ["Discharge pack at 0.5C to 20% SoC", "Compare BMS SoC against reference Coulomb counter every 10 minutes", "Charge pack at 0.5C back to 100% SoC", "Compare again at 10-minute intervals"],
            "expected_results": ["BMS SoC within ?2% of reference at all sample points", "No step-change error > 1% between consecutive samples", "Final 100% SoC reading within ?1%"],
            "source_requirement_text": BMS_REQUIREMENTS[4][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "needs_revision", "review_note": "At 60% SoC error was 2.3% ? marginally outside spec. Needs re-test after Kalman filter tuning.", "reviewed_at": (NOW - timedelta(hours=5)).isoformat(),
        },
        # REQ-BMS-006
        {
            "run_id": run_id, "test_id": "TC_008", "requirement_id": "REQ-BMS-006",
            "title": "BMS Fault Logging ? 500 event capacity across power cycles",
            "asil": "A", "test_type": "functional",
            "preconditions": ["BMS connected to diagnostic interface (ISO 15765-2)", "NVRAM cleared to initial state", "Fault injection harness ready"],
            "steps": ["Inject 510 distinct fault events via harness, one per second", "Power cycle BMS after 255th event", "Read fault log via OBD interface after 510 events", "Verify ring buffer wrapping behaviour"],
            "expected_results": ["500 most recent events available after 510 injections", "All events retain correct timestamp and fault code after power cycle", "Events 1?10 overwritten by ring buffer wrap ? not events 11?510"],
            "source_requirement_text": BMS_REQUIREMENTS[5][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "pending", "review_note": "", "reviewed_at": None,
        },
    ]


def _lka_test_cases(run_id: str) -> list[dict]:
    return [
        # REQ-LKA-001
        {
            "run_id": run_id, "test_id": "TC_001", "requirement_id": "REQ-LKA-001",
            "title": "LKA Lane Detection Confidence ? Solid white marking at 85% threshold (daylight)",
            "asil": "B", "test_type": "functional",
            "preconditions": ["Vehicle on marked test track under daylight conditions (lux > 10,000)", "Front camera calibrated", "Lane detection confidence output available on diagnostic bus"],
            "steps": ["Drive at 80 km/h along solid white lane markings for 5 km", "Sample lane detection confidence from CAN bus at 10 Hz", "Compute percentage of samples meeting 85% threshold"],
            "expected_results": ["? 95% of samples report confidence ? 85%", "No confidence drops below 60% for more than 200 ms continuously", "LKA remains engaged throughout the route"],
            "source_requirement_text": LKA_REQUIREMENTS[0][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "98.2% of samples above 85%. Excellent. Approved.", "reviewed_at": (NOW - timedelta(days=1)).isoformat(),
        },
        {
            "run_id": run_id, "test_id": "TC_002", "requirement_id": "REQ-LKA-001",
            "title": "LKA Lane Detection Confidence ? Dashed white marking under low-light (70% threshold)",
            "asil": "B", "test_type": "boundary",
            "preconditions": ["Test conducted at civil twilight (lux 50?200)", "Road surface dry, dashed white markings", "Vehicle speed 70 km/h"],
            "steps": ["Drive 3 km route with dashed white lane markings under low-light conditions", "Record confidence samples at 10 Hz", "Compare against 70% threshold"],
            "expected_results": ["? 90% of samples report confidence ? 70%", "LKA disengages gracefully if confidence drops below threshold for > 500 ms", "Driver warning issued upon disengagement"],
            "source_requirement_text": LKA_REQUIREMENTS[0][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "", "reviewed_at": (NOW - timedelta(hours=18)).isoformat(),
        },
        # REQ-LKA-002
        {
            "run_id": run_id, "test_id": "TC_003", "requirement_id": "REQ-LKA-002",
            "title": "LKA Corrective Steering ? 200 ms response latency at lane departure",
            "asil": "B", "test_type": "timing",
            "preconditions": ["Vehicle at 100 km/h, hands-off steering in lane centre", "Lane departure simulator active (hardware-in-the-loop)", "Steering torque sensor at 1 kHz sample rate"],
            "steps": ["Simulate lateral drift of 0.3 m toward lane edge at T=0", "Measure elapsed time until corrective torque exceeds 0.5 Nm", "Repeat 20 times and compute statistical distribution"],
            "expected_results": ["Corrective torque applied within 200 ms in all 20 runs", "Mean response time ? 150 ms", "Applied torque does not exceed 3 Nm in any run"],
            "source_requirement_text": LKA_REQUIREMENTS[1][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "Mean latency: 112 ms. All 20 runs within spec.", "reviewed_at": (NOW - timedelta(hours=10)).isoformat(),
        },
        # REQ-LKA-003
        {
            "run_id": run_id, "test_id": "TC_004", "requirement_id": "REQ-LKA-003",
            "title": "LKA Driver Override ? Immediate disengagement on 1.5 Nm torque for 200 ms",
            "asil": "B", "test_type": "functional",
            "preconditions": ["LKA system actively applying corrective steering", "Steering torque sensor calibrated", "Driver simulator applying controlled torque input"],
            "steps": ["Engage LKA with active lane correction in progress", "Apply driver torque of 1.6 Nm at T=0 and hold for 210 ms", "Measure LKA disengagement timestamp", "Verify steering authority returned to driver"],
            "expected_results": ["LKA disengages within 50 ms of 200 ms torque threshold", "LKA assist torque drops to 0 Nm within 100 ms of disengagement", "Instrument cluster shows LKA inactive indicator"],
            "source_requirement_text": LKA_REQUIREMENTS[2][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "Override detection working correctly. Re-engagement delay acceptable.", "reviewed_at": (NOW - timedelta(hours=7)).isoformat(),
        },
        {
            "run_id": run_id, "test_id": "TC_005", "requirement_id": "REQ-LKA-003",
            "title": "LKA Driver Override ? No disengagement below 1.5 Nm threshold",
            "asil": "B", "test_type": "negative",
            "preconditions": ["LKA active with corrective torque applied", "Driver torque input at 1.4 Nm (below override threshold)"],
            "steps": ["Apply 1.4 Nm driver torque for 500 ms", "Monitor LKA engagement status", "Verify LKA continues to apply corrective steering"],
            "expected_results": ["LKA remains engaged throughout 500 ms period", "System does not issue false override event", "Corrective torque continues as calculated"],
            "source_requirement_text": LKA_REQUIREMENTS[2][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "pending", "review_note": "", "reviewed_at": None,
        },
        # REQ-LKA-004
        {
            "run_id": run_id, "test_id": "TC_006", "requirement_id": "REQ-LKA-004",
            "title": "LKA Adverse Weather ? Operability in moderate rain (50 mm/hr)",
            "asil": "A", "test_type": "functional",
            "preconditions": ["Controlled rain simulation facility", "Rain intensity 50 mm/hr", "Test track with standard lane markings (not fresh)"],
            "steps": ["Activate rain simulation at 50 mm/hr", "Drive at 80 km/h for 2 km", "Record LKA engagement continuity and lane confidence values"],
            "expected_results": ["LKA remains operational (engaged) for ? 90% of the route", "Lane confidence ? 70% for ? 85% of samples", "No false lane departure events triggered by rain artefacts"],
            "source_requirement_text": LKA_REQUIREMENTS[3][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "needs_revision", "review_note": "LKA disengaged 3 times during heavy spray from truck. Need to investigate camera wash effectiveness.", "reviewed_at": (NOW - timedelta(hours=4)).isoformat(),
        },
        # REQ-LKA-005
        {
            "run_id": run_id, "test_id": "TC_007", "requirement_id": "REQ-LKA-005",
            "title": "LKA Speed Envelope ? No engagement below 60 km/h",
            "asil": "A", "test_type": "boundary",
            "preconditions": ["Vehicle on marked test track at 55 km/h", "LKA enable button pressed by driver"],
            "steps": ["Attempt to engage LKA at 55 km/h via button press", "Increase speed to 60 km/h and attempt engagement", "Record engagement status at each speed"],
            "expected_results": ["LKA does not engage at 55 km/h ? visual indicator shows speed too low", "LKA engages at 60 km/h or above", "No LKA torque output below 60 km/h under any condition"],
            "source_requirement_text": LKA_REQUIREMENTS[4][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "Speed threshold correct. Below 60 correctly rejected.", "reviewed_at": (NOW - timedelta(hours=12)).isoformat(),
        },
        {
            "run_id": run_id, "test_id": "TC_008", "requirement_id": "REQ-LKA-005",
            "title": "LKA Speed Envelope ? Graceful disengagement above 180 km/h",
            "asil": "A", "test_type": "boundary",
            "preconditions": ["LKA active at 175 km/h", "Vehicle approaching 180 km/h speed limit of LKA operation"],
            "steps": ["Accelerate from 175 to 185 km/h with LKA active", "Monitor LKA status during speed transition", "Verify disengagement and driver notification"],
            "expected_results": ["LKA begins graceful disengagement at 179 km/h (1 km/h buffer)", "Corrective torque ramps to 0 Nm over 500 ms", "Driver receives speed-range warning on instrument cluster"],
            "source_requirement_text": LKA_REQUIREMENTS[4][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "approved", "review_note": "", "reviewed_at": (NOW - timedelta(hours=9)).isoformat(),
        },
        # REQ-LKA-006
        {
            "run_id": run_id, "test_id": "TC_009", "requirement_id": "REQ-LKA-006",
            "title": "LKA Event Logging ? 60-second ring buffer accessible via ISO 15765-2",
            "asil": "QM", "test_type": "functional",
            "preconditions": ["Vehicle connected to OBD-II diagnostic tool (ISO 15765-2 compliant)", "LKA active for at least 2 minutes", "6 lane departure events triggered in the last 90 seconds"],
            "steps": ["Request LKA event log via diagnostic service 0x22 / DID 0xF1A0", "Parse returned buffer for departure events", "Verify timestamps and steering intervention data for last 60 seconds"],
            "expected_results": ["All departure events from the last 60 seconds present in log", "Events older than 60 seconds absent (ring buffer wrap confirmed)", "Each event record contains: timestamp (ms), lateral offset (cm), intervention torque (Nm)"],
            "source_requirement_text": LKA_REQUIREMENTS[5][1], "model_version": "claude-sonnet-4-6", "prompt_version": "v2",
            "validation_status": "valid", "review_status": "pending", "review_note": "", "reviewed_at": None,
        },
    ]


# ???????????????????????????????????????????????????????????????????????????
# SEEDING LOGIC
# ???????????????????????????????????????????????????????????????????????????

def _coverage_counts(test_cases: list[dict]) -> dict:
    counts: dict[str, int] = {}
    for tc in test_cases:
        t = tc.get("test_type", "functional")
        counts[t] = counts.get(t, 0) + 1
    return counts


def seed():
    print("=== Demo Seed ===================================================")
    print("Creating tables if they don't exist...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # -- 0. Ensure review columns exist ------------------------
        from sqlalchemy import text as sa_text
        for col_def in [
            "review_status VARCHAR(20) DEFAULT 'pending'",
            "review_note TEXT",
            "reviewed_at VARCHAR(50)",
        ]:
            try:
                db.execute(sa_text(f"ALTER TABLE test_cases ADD COLUMN {col_def}"))
                db.commit()
            except Exception:
                db.rollback()

        # -- 1. Clear all existing data ----------------------------
        print("Clearing existing data...")
        db.query(TestCaseDB).delete()
        db.query(Requirement).delete()
        db.query(Run).delete()
        db.query(Project).delete()
        db.commit()
        print("  [OK] All tables cleared")

        # -- 2. Seed projects + runs + test cases ------------------
        projects_data = [
            {
                "id": AEB_ID,
                "name": "AEB System Validation",
                "description": "Autonomous Emergency Braking ? ISO 26262 ASIL-D validation suite for radar+camera fusion pipeline",
                "requirements": AEB_REQUIREMENTS,
                "tc_factory": _aeb_test_cases,
                "run_offsets_days": [9, 2],
            },
            {
                "id": BMS_ID,
                "name": "BMS Safety Testing",
                "description": "Battery Management System ? cell monitoring, balancing, and protection validation for 400V EV pack",
                "requirements": BMS_REQUIREMENTS,
                "tc_factory": _bms_test_cases,
                "run_offsets_days": [12, 3],
            },
            {
                "id": LKA_ID,
                "name": "LKA Feature Verification",
                "description": "Lane Keeping Assist ? camera-based lane detection and corrective steering verification",
                "requirements": LKA_REQUIREMENTS,
                "tc_factory": _lka_test_cases,
                "run_offsets_days": [7, 1],
            },
        ]

        for pdata in projects_data:
            created_at = NOW - timedelta(days=max(pdata["run_offsets_days"]) + 2)
            last_run_at = NOW - timedelta(days=min(pdata["run_offsets_days"]))

            project = Project(
                id=pdata["id"],
                name=pdata["name"],
                description=pdata["description"],
                created_at=created_at,
                updated_at=last_run_at,
                last_run_at=last_run_at,
            )
            db.add(project)
            db.flush()
            print(f"\n  Project: {pdata['name']}")

            for i, offset_days in enumerate(pdata["run_offsets_days"]):
                run_id = _run_id()
                run_created = NOW - timedelta(days=offset_days, hours=2)
                run_completed = run_created + timedelta(minutes=4, seconds=30)

                test_cases = pdata["tc_factory"](run_id)
                counts = _coverage_counts(test_cases)

                run = Run(
                    id=run_id,
                    project_id=pdata["id"],
                    status="complete",
                    provider="anthropic",
                    model="claude-sonnet-4-6",
                    requirement_count=len(pdata["requirements"]),
                    test_case_count=len(test_cases),
                    rag_enabled=True,
                    prompt_version="v2",
                    created_at=run_created,
                    completed_at=run_completed,
                    functional_count=counts.get("functional", 0),
                    boundary_count=counts.get("boundary", 0),
                    negative_count=counts.get("negative", 0),
                    fault_injection_count=counts.get("fault_injection", 0),
                    timing_count=counts.get("timing", 0),
                    recovery_count=counts.get("recovery", 0),
                    safety_count=counts.get("safety", 0),
                )
                db.add(run)

                for pos, (req_id, req_text) in enumerate(pdata["requirements"]):
                    db.add(Requirement(
                        id=str(uuid.uuid4()),
                        run_id=run_id,
                        text=req_text,
                        requirement_id=req_id,
                        position=pos,
                    ))

                for tc in test_cases:
                    db.add(TestCaseDB(
                        id=_tc_id(),
                        run_id=tc["run_id"],
                        test_id=tc["test_id"],
                        requirement_id=tc["requirement_id"],
                        title=tc["title"],
                        asil=tc["asil"],
                        test_type=tc["test_type"],
                        preconditions=tc["preconditions"],
                        steps=tc["steps"],
                        expected_results=tc["expected_results"],
                        source_requirement_text=tc["source_requirement_text"],
                        generation_timestamp=run_completed.isoformat(),
                        model_version=tc["model_version"],
                        prompt_version=tc["prompt_version"],
                        retry_count=0,
                        validation_status=tc["validation_status"],
                        rag_sources=["ISO_26262_Part6.pdf", "automotive_test_patterns.pdf"],
                        rag_top_score=0.91,
                        review_status=tc["review_status"],
                        review_note=tc.get("review_note", ""),
                        reviewed_at=tc.get("reviewed_at"),
                    ))

                run_label = "initial" if i == 0 else "latest"
                print(f"    Run {i+1} ({run_label}): {len(test_cases)} test cases, {len(pdata['requirements'])} reqs")

        db.commit()
        print(f"\n  [OK] Seeded {len(projects_data)} projects successfully")

        # -- 3. Summary --------------------------------------------
        total_tcs = db.query(TestCaseDB).count()
        total_runs = db.query(Run).count()
        print(f"\n=== Summary =============================================")
        print(f"  Projects  : {len(projects_data)}")
        print(f"  Runs      : {total_runs}")
        print(f"  Test cases: {total_tcs}")
        print(f"==================================================")
        print("  Demo database is ready.\n")

    except Exception as e:
        db.rollback()
        print(f"\n  [FAIL] Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
