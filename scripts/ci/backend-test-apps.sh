#!/usr/bin/env bash
# Canonical Django test app list — keep in sync with Makefile test-backend target.
set -euo pipefail

BACKEND_TEST_APPS=(
  accounts
  analytics.tests
  appointments
  audit.tests
  consultation
  common
  dashboard.tests
  eyecare
  hr.tests
  laboratory
  notifications
  nursing
  organization.tests
  patients
  permissions
  pharmacy
  physiotherapy
  radiology
  reports.tests
  support.tests
  wards
)

printf '%s\n' "${BACKEND_TEST_APPS[@]}"
