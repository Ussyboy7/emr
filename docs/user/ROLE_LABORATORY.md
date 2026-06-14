# Laboratory — User Guide

For lab staff processing orders, entering results, and verification.

**Quick start:** [EMR_USER_QUICK_START_GUIDE.md](EMR_USER_QUICK_START_GUIDE.md)

## Typical sidebar modules

- Laboratory dashboard
- Orders (pending / in progress)
- Verification
- Completed tests
- Analytics (if enabled)

## Daily tasks

| Task | Path |
|------|------|
| New work from consultations | Orders queue |
| Enter results | Open order → results entry |
| Verify / release | Verification queue |
| Historical lookup | Completed / search |

## Result entry

- Confirm **patient identity** and **visit** on every order.
- Use correct units and reference ranges.
- Attach PDF or instrument output when policy requires.
- Second-person verification where mandated.

## Instrument integration

Analyzer middleware (e.g. URIT) may auto-post results — see [integration docs](../../integration/urit5160/README.md). Manual entry still required when interface is down.

## Problems?

- **Order missing:** consultation may not have submitted; check visit status.
- **Cannot verify:** insufficient permissions or result incomplete.
- **Duplicate results:** do not delete without supervisor; use hold/reject per SOP.

Support: [EMR_SUPPORT_MAINTENANCE.md](../admin/EMR_SUPPORT_MAINTENANCE.md)
