# ADR-0020 — CalibrationProfile Stored Per-Trip

**Date:** 2026-05-18  
**Status:** Accepted  
**Deciders:** Eng team  
**Supersedes:** —

---

## Context

D2 decision: Where to store `CalibrationProfile` — per-traveller or per-trip?

Options considered:
1. **Per-traveller**: Single row in `travellers` or a `traveller_calibration` table
2. **Per-trip**: Row in `calibration_profiles` keyed by `trip_id`

---

## Decision

Store `CalibrationProfile` **per-trip** with `trip_id` as primary key.

Rationale:
- A traveller may want different curation ratios for different trip contexts (beach trip vs
  cultural trip)
- Per-trip allows "reset to default" naturally: new trip starts with `CalibrationProfile.default()`
- Trip deletion (`ON DELETE CASCADE`) automatically cleans up calibration data
- Aligns with the existing data model where Trip is the primary planning unit

---

## Consequences

- **+** Natural isolation — calibration changes for trip A don't affect trip B
- **+** Simpler cascade: `ON DELETE CASCADE` from `trips` table
- **+** New trips always start with default 0.5:0.5 ratio
- **-** If a traveller consistently wants a specific ratio, they must adjust each new trip
- **Future:** A traveller-level default preference could be added in v2 as an opt-in
