# Facility Order Routing and Sample Accessions

## Approved routing workflow

Medical facilities are `organization.Clinic` records. The facility attached to
the visit owns the incoming request. A laboratory or radiology order remains a
single encounter-level order; it is not duplicated when work is routed to a
different facility.

The origin is resolved in this order:

1. The order's `location_clinic`.
2. The linked visit's `location_clinic`.
3. An explicit external clinic on a manually entered request.

If no facility can be resolved, staff must send the order to HQ triage. Staff
must not infer a facility from a user's active clinic, a free-text clinic name,
or a default processing destination.

## Per-line routing

The originating facility triages every lab test and radiology study. Each line
may be routed independently to:

- The originating facility for local processing.
- An internal processing facility such as Bode Thomas.
- An external provider selected for that line.

Worklists show both `Origin` and `Processing`. A routing decision records the
actor, time, previous destination, new destination, and reason. The original
order and patient encounter remain unchanged.

## Collection and processing

The collection facility is where the physical sample is collected. The
processing facility is where the test is performed. They may differ, and one
physical collection can contain tests sent to several processing destinations.
Radiology studies follow the same independent destination rule, although there
is no shared physical sample batch.

## Accession numbering

`LabSampleBatch` represents one collection event. Tests collected together
share one accession in the form `<FACILITY-CODE>-YY-NNNN`, for example
`HQ-26-0001`. The facility code is taken from the collection clinic, not
hardcoded to Bode Thomas. A later collection creates a different batch and
accession.

Legacy accessions, including `BT-YY-NNNN`, are compatibility identifiers and
must never be rewritten. Run the backfill command in dry-run mode first:

```sh
python manage.py backfill_sample_batches --dry-run
```

Only an explicitly approved apply run writes batches:

```sh
python manage.py backfill_sample_batches --apply
```

The command reports `created`, `preserved`, `skipped`, and `ambiguous` counts.
Records without a safe collection facility, conflicting legacy accessions, or
an accession already belonging to another order are reported as ambiguous and
are not guessed.

## External referrals

Route only the selected test/study lines to an external provider. The existing
referral dispatch record is the outbound audit trail and must retain the
original order and accession. Do not create a replacement clinical order.
External routes require a named destination and a reason. Results received
from the provider are entered against the original line and return to the
original encounter history.

## HQ triage operator steps

1. Open the HQ/origin triage queue and confirm patient, visit, and `Origin`.
2. Review each lab test and radiology study separately.
3. Select local, internal processing, or external routing for each line.
4. For external work, select the provider and record the referral reason.
5. For laboratory work, collect the selected tests together when physically
   appropriate and confirm the collection facility and shared accession.
6. Confirm destination worklists show only the assigned lines and retain the
   original origin.
7. Review routing history and dispatch records before closing the triage task.

When origin or collection facility data is missing, stop and escalate to the
HQ triage owner. Never route by guessing from a staff member's location or a
legacy free-text value.
