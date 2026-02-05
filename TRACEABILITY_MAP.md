# TRACEABILITY_MAP — huddle
**Purpose:** Cross-link operational docs to exact `APP_MASTER_SPEC.md` sections for rebuild and audit traceability.

## Spec Anchors
- `APP_MASTER_SPEC.md#1-workspace--output-rules`
- `APP_MASTER_SPEC.md#2-system-architecture`
- `APP_MASTER_SPEC.md#3-environment--connectivity`
- `APP_MASTER_SPEC.md#4-data-model-canonical-contracts`
- `APP_MASTER_SPEC.md#5-feature-requirements-end-to-end`
- `APP_MASTER_SPEC.md#6-brand--visual-system`
- `APP_MASTER_SPEC.md#7-security--vulnerability-mitigation-zero-tolerance`
- `APP_MASTER_SPEC.md#8-performance-requirements`
- `APP_MASTER_SPEC.md#9-accessibility-a11y-standards`
- `APP_MASTER_SPEC.md#10-testing-strategy`
- `APP_MASTER_SPEC.md#11-cicd--deployment`
- `APP_MASTER_SPEC.md#12-operations--maintenance`
- `APP_MASTER_SPEC.md#13-release-verification-gate-all-yes-required`

## RUNBOOK Mapping
| RUNBOOK Section | APP_MASTER_SPEC Section |
|---|---|
| 1 Quick Start, 2 Environment Baseline | 1, 3.1, 3.2 |
| 3 Supabase Operations | 2.4, 3.1, 12.2 |
| 4 Local QA + UAT Commands | 10, 10.2, 10.3 |
| 5 Deployment | 11.1, 11.2 |
| 6 Monitoring and Alerting | 11.3 |
| 7 Incident Response, 8 Rollback | 12.1, 12.2 |
| 9 Release Gate | 13 |

## SECURITY Mapping
| SECURITY Section | APP_MASTER_SPEC Section |
|---|---|
| 1 Threat Model | 7 |
| 2 Mandatory Security Controls | 4.4, 5.2, 5.5, 5.6, 7 |
| 3 App Security Baselines | 7, 9 |
| 4 Logging/Monitoring | 11.3 |
| 5 Security Testing | 10, 10.3 |
| 6 Incident Response | 12 |
| 7 Compliance/Data Governance | 1.3, 7, 9 |

## TEST_PLAN Mapping
| TEST_PLAN Section | APP_MASTER_SPEC Section |
|---|---|
| 1 Test Strategy, 2 Tooling | 10.1 |
| 3 Persona Matrix | 10.2 |
| 4 Mandatory Functional Scenarios | 5.1–5.10, 4, 6 |
| 5 Non-Functional Requirements | 8, 9, 2.5 |
| 6 CI Gates | 11.1 |
| 7 Evidence Requirements | 13 |
| 8 Exit Criteria | 13 |

## BRANCH_PROTECTION Mapping
| BRANCH_PROTECTION Section | APP_MASTER_SPEC Section |
|---|---|
| 2 Rule Target, 3 Mandatory Rule Config | 11.1, 11.2 |
| 4 Required Status Checks | 10, 11 |
| 5 Merge Policy | 11.2 |
| 6 Verification Procedure | 13 |
| 7 Operational Notes | 1.3, 12.2 |

## CI Workflow Mapping
| `.github/workflows/ci.yml` Job/Step | APP_MASTER_SPEC Section |
|---|---|
| `build-test` | 10.1, 11.1, 13 |
| `e2e-smoke` | 10.2, 10.3, 13 |
| `migration-sanity` | 12.2, 13 |
| localhost hardcode guard | 3.2 |

## Change Control
- Any mapping change must update:
  - `SPEC_CHANGELOG.md`
  - affected doc(s)
  - this traceability map.
