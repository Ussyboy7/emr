# Facility Order Routing and Sample Accessioning

## Decision

Medical facilities are represented by `organization.Clinic`. A clinical lab or radiology order retains one encounter-level order record, while each lab test or radiology study may be routed independently to the originating facility, Bode Thomas, or an external provider.

## Workflow

Orders first appear in the originating facility's triage queue. Staff route each line locally, internally, or externally. Routing decisions record the actor, timestamp, prior destination, new destination, and reason. Destination worklists show both the origin and current processing facility.

## Lab Accessioning

A `LabSampleBatch` represents one physical collection event. Tests collected together share a collection-facility accession number such as `HQ-26-0001`, even when their processing destinations differ. Existing Bode Thomas accession numbers remain readable and are not rewritten.

## Compatibility

Existing external lab and radiology dispatch records remain the audit trail for outbound batches. Existing order-level fields remain as compatibility fallbacks while new routing state is stored at test/study level. Ambiguous legacy data is reported during backfill rather than guessed.

## Scope

The implementation includes backend models, migrations, origin resolution, routing APIs, facility-specific collection IDs, origin/destination worklists, external line dispatch, backfill tooling, tests, and workflow documentation.
