# Product Spec

## Problem

The project needs to turn patient timeline data into usable handoff summaries without losing clinical context or introducing noisy output.

## Primary Users

- nurse or clinician reviewing shift handoff data
- product owner validating handoff quality
- developer or AI agent improving summary logic

## Core Outcomes

- generate longitudinal patient summaries from daily snapshots
- produce narrative SBAR output
- surface persistent concerns, watch items, and carryover work
- keep regression behavior stable as rules evolve

## Non-Goals

- full EMR replacement
- direct clinical decision authority
- dependence on always-on external FHIR connectivity for local validation
- use with real patient data in a public repository
- production clinical deployment

## Quality Requirements

- summaries should suppress raw FHIR suffix noise
- care-frame output should focus on clinically relevant current management
- carryover items should stay action-oriented
- test coverage must remain runnable through `npm test`
