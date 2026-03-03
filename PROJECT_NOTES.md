# Project Notes: Foundations TPH Calculator

## Purpose
Internal calculator for ICs to compute weighted TPH without pulling from external data sources.

## Current Site Name
- Foundations TPH Calculator

## Access Model
- Open access (no login/password gate)
- Internal-use banner shown on page:
  - "Internal use only - do not share this link outside Foundations."

## Time Input Modes
Users can calculate using any of these:
- Hours + Minutes
- Total Minutes
- Total Hours

## Workflows
The calculator includes these workflows:
- Backlog CAP
- Daily CAP
- eIDV Precision
- dIDV Precision
- Same Face
- eIDV
- dIDV
- IDV Web Based
- P2P Taxonomy
- Cash in Taxonomy
- P2P
- P2P FR
- Cash In Blocks Secondaries
- Instrument Link Blocks Secondaries
- Referrals/ Incentives Blocked
- Referrals/ Incentives Paid
- CCFR Secondaries
- CC General Secondaries
- Gov Funds Secondaries
- ACH Secondaries
- Wires
- PMD Secondaries
- $Pay

## Weight Logic
- The provided numbers are treated as **minutes per case**, not direct weights.
- Target is **12 TPH per hour**.
- Derived weight formula per workflow:
  - `weight = (minutes_per_case * 12) / 60`
- Weights are displayed read-only (locked).

## Minutes Per Case (Current)
`[10, 10, 10, 10, 10, 6, 7, 12, 12, 12, 10, 12, 10, 10, 8, 8, 16, 16, 6, 6, 8, 8, 14]`

## Calculation Formula
- Weighted TPH = Sum(Completed x Weight) / Hours Worked

## Reset Behavior
Reset clears only IC-entered calculator inputs:
- Time entry fields
- Completed counts
- Per-row weighted units display

Reset does **not** change:
- Locked workflow weights
- Calculation history table (history remains)

## History / Export
- History table logs each calculation (time, raw tasks, weighted units, hours, weighted TPH)
- CSV export button downloads calculation history

## Publish Notes
- Repo: https://github.com/snavarrete70/tph-calculator
- GitHub push required PAT authentication (not account password)
- GitHub Pages URL format includes username unless custom domain is configured

## Local Project Path
- `/Users/snavarrete/Documents/gh/tph-calculator`
