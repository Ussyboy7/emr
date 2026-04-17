# EMR Repository Cleanup Plan

## Current Status
- **Total .md files:** 84 (way too many!)
- **Total .sh scripts:** 70+ (many are debug/dev scripts)
- **Repository size:** Bloated with development artifacts

## Cleanup Categories

### 🟢 KEEP (Production Essential - 7 files)
**Core Documentation:**
- EMR_USER_QUICK_START_GUIDE.md - User training
- EMR_ADMINISTRATION_GUIDE.md - System admin procedures
- EMR_DEPLOYMENT_GUIDE.md - Production deployment guide
- EMR_SUPPORT_MAINTENANCE.md - Support framework
- EMR_GO_LIVE_CHECKLIST.md - Go-live procedures
- EMR_TESTING_VALIDATION_PLAN.md - Testing strategy
- EMR_UAT_GUIDE.md - User acceptance testing

**README Files:**
- README.md - Main project README
- backend/README.md - Backend documentation
- frontend/README.md - Frontend documentation

### 🟡 KEEP (Operational Scripts - 9 files)
**Production Scripts:**
- backup_database.sh - Automated backups
- restore_backup.sh - Disaster recovery
- verify_backup.sh - Backup validation
- monitor_system.sh - System health monitoring
- monitor_performance.sh - Performance tracking
- setup_security.sh - Security hardening
- test_emr_functionality.sh - Functional testing
- test_emr_security.sh - Security validation
- validate_go_live_readiness.sh - Go-live validation

### 🟠 REVIEW (Maybe Keep - 3 files)
- LOGIN_CREDENTIALS.md - Admin reference
- AUDIT_TRAIL_REVIEW.md - Security compliance
- API_DOCUMENTATION.md - If current and accurate

### 🔴 DELETE (Development/Progress - 65+ files)
**Mock Data Files (15+):**
- ALL_MOCK_DATA_*.md files
- MOCK_DATA_*.md files

**Fix/Progress Files (20+):**
- ALL_FIXES_IMPLEMENTATION.md
- VISIT_*.md files
- MEDICAL_RECORDS_*.md files
- INTEGRATION_*.md files
- CONNECTION_*.md files

**Development Scripts (40+):**
- All fix_*.sh scripts
- All debug_*.sh scripts
- All phase*_*.sh scripts
- All check_*status.sh scripts (except monitor_system.sh)
- All emergency_*.sh scripts

**Outdated Docs (10+):**
- EMR_DEPLOYMENT_FINAL_GUIDE.md (superseded)
- DEPLOYMENT_STEPS.md (old)
- DNS_FIX.md (resolved)
- COMPREHENSIVE_FIX_SUMMARY.md (development)

## Cleanup Actions

### Phase 1: Create Archive
```bash
# Create archive directory for historical reference
mkdir archive_development_files
mv MOCK_DATA_*.md archive_development_files/
mv VISIT_*.md archive_development_files/
mv fix_*.sh archive_development_files/
# ... move all development files
```

### Phase 2: Delete Unnecessary Files
```bash
# Remove development artifacts
rm ALL_FIXES_IMPLEMENTATION.md
rm INTEGRATION_*.md
rm CONNECTION_*.md
rm phase*.sh
rm debug_*.sh
rm emergency_*.sh
# ... remove all non-essential files
```

### Phase 3: Organize Remaining Files
```bash
# Create docs/ directory structure
mkdir -p docs/{user,admin,testing,deployment}
mv EMR_USER_* docs/user/
mv EMR_ADMIN* docs/admin/
mv EMR_TESTING* EMR_UAT* docs/testing/
mv EMR_DEPLOYMENT* EMR_GO_LIVE* docs/deployment/
mv EMR_SUPPORT* docs/admin/
```

### Phase 4: Update .gitignore
```
# Add archive directory to .gitignore
echo "archive_development_files/" >> .gitignore
```

## Expected Result
- **Markdown files:** 84 → 15 (83% reduction)
- **Script files:** 70+ → 12 (80%+ reduction)
- **Clean repository** with only production-relevant files
- **Archive folder** for historical reference if needed

## Benefits
- ✅ **Easier navigation** for production team
- ✅ **Reduced confusion** from outdated docs
- ✅ **Faster repository operations** (clone, search, etc.)
- ✅ **Professional appearance** for production system
- ✅ **Historical archive** preserved if needed