# Production operations (quick reference)

**Full runbook:** [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md)

All environments use:

```bash
./scripts/production/env-manager.sh <command>   # production
./scripts/staging/env-manager.sh <command>      # staging
./scripts/local/env-manager.sh <command>        # local
```

## Common commands

```bash
./scripts/production/env-manager.sh start
./scripts/production/env-manager.sh status
./scripts/production/env-manager.sh health
./scripts/production/env-manager.sh deploy
./scripts/production/env-manager.sh backup-status
./scripts/production/env-manager.sh logs backend --follow
```

See `./scripts/production/env-manager.sh help` for the full list.

## Documentation index

[docs/README.md](docs/README.md)
