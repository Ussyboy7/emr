# How to Seed Demo Data on Staging Instance

This guide explains how to run the seed demo data command on the staging server.

## Prerequisites

- SSH access to staging server: `ssh devsecops@172.16.0.46`
- Access to the EMR application directory: `/srv/emr`

## Method 1: Using Docker (Recommended)

If your staging instance runs in Docker containers:

### Step 1: SSH to Staging Server

```bash
ssh devsecops@172.16.0.46
cd /srv/emr
```

### Step 2: Run Seed Command in Backend Container

```bash
# If using docker-compose (correct filename is docker-compose.stag.yml)
docker-compose -f docker-compose.stag.yml exec backend python manage.py seed_demo_data

# Or if using docker directly (container name from docker-compose.stag.yml)
docker exec -it emr-backend-stag python manage.py seed_demo_data
```

### Step 3: Reset Existing Data (Optional)

If you want to clear existing demo data before seeding:

```bash
# With reset flag (correct filename is docker-compose.stag.yml)
docker-compose -f docker-compose.stag.yml exec backend python manage.py seed_demo_data --reset

# Or with docker directly (container name from docker-compose.stag.yml)
docker exec -it emr-backend-stag python manage.py seed_demo_data --reset
```

## Method 2: Direct Python Execution

If you have direct access to the Python environment on the server:

### Step 1: SSH to Staging Server

```bash
ssh devsecops@172.16.0.46
cd /srv/emr/backend
```

### Step 2: Activate Virtual Environment (if using one)

```bash
# If using virtual environment
source .venv/bin/activate  # or venv/bin/activate

# Or if using system Python, skip this step
```

### Step 3: Run Seed Command

```bash
# Basic seeding (keeps existing data)
python manage.py seed_demo_data

# Reset and seed (clears existing demo data first)
python manage.py seed_demo_data --reset
```

## What the Command Does

The `seed_demo_data` command creates:

1. **Organization Structure**
   - Bode Thomas Clinic
   - All functional departments (Medical Records, Nursing, Consultation, Laboratory, Pharmacy, Radiology)
   - Consultation rooms (Consulting Room 1-4, CMO, AGM, GM, Eye, Physio, Diamond, SS)

2. **Roles & Permissions**
   - System roles (Admin, Doctor, Nurse, Lab Tech, Pharmacist, Radiologist, Records)
   - Custom roles with predefined permissions

3. **Demo Users**
   - Admin user: `admin` / `ChangeMe123!`
   - Doctor: `doctor` / `ChangeMe123!`
   - Nurse: `nurse` / `ChangeMe123!`
   - Lab Tech: `labtech` / `ChangeMe123!`
   - Pharmacist: `pharmacist` / `ChangeMe123!`
   - Radiologist: `radiologist` / `ChangeMe123!`
   - All users assigned to Bode Thomas Clinic and appropriate departments

4. **Demo Patients**
   - 5 sample patients with complete medical records
   - Visits, vitals, medical history

5. **Lab Data**
   - Lab templates
   - Lab orders and test results

6. **Pharmacy Data**
   - Medications and inventory
   - Prescriptions

7. **Radiology Data**
   - Radiology orders and studies

8. **Consultation Data**
   - Consultation sessions
   - Queue items

9. **Nursing Data**
   - Nursing orders

10. **Notifications**
    - Sample notifications for users

## Command Options

### Basic Usage
```bash
python manage.py seed_demo_data
```
- Adds demo data to existing database
- Does not delete existing data
- Safe to run multiple times (uses `get_or_create`)

### With Reset Flag
```bash
python manage.py seed_demo_data --reset
```
- **WARNING**: Deletes all existing demo data first
- Clears: patients, visits, lab orders, prescriptions, radiology orders, consultation data, nursing orders, notifications
- Then creates fresh demo data
- Use with caution on staging!

## Verification

After running the command, you should see:

```
✅ Demo data seeding complete!

Login credentials:
  Admin: admin / ChangeMe123!
  Doctor: doctor / ChangeMe123!
  Nurse: nurse / ChangeMe123!
  Lab Tech: labtech / ChangeMe123!
  Pharmacist: pharmacist / ChangeMe123!
  Radiologist: radiologist / ChangeMe123!
```

## Troubleshooting

### Issue: Command not found or file doesn't exist
```bash
# Check if docker-compose file exists
ls -la /srv/emr/docker-compose.stag.yml

# If file doesn't exist, check what docker-compose files are available
ls -la /srv/emr/docker-compose*.yml

# Make sure you're in the correct directory
cd /srv/emr

# Check if containers are running
docker ps | grep emr

# If using Docker, make sure backend container is running
docker ps | grep emr-backend-stag
```

### Issue: Database connection error
```bash
# Check database is running
docker ps | grep postgres

# Check environment variables (find the actual backend container name first)
docker ps | grep backend
docker exec -it <backend-container-name> env | grep DB_
```

### Issue: Permission errors
```bash
# Make sure you have write access to database
# Check database user permissions in Django settings
```

## Best Practices

1. **Backup First**: Before using `--reset`, backup your database
   ```bash
# Backup database (using correct container name from docker-compose.stag.yml)
docker exec emr-postgres-stag pg_dump -U emradmin emr_db_stag > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Test First**: Run without `--reset` first to see what gets created

3. **Check Logs**: Monitor the output for any errors or warnings

4. **Verify Data**: After seeding, log in and verify the data appears correctly

## Example Full Workflow

```bash
# 1. SSH to server
ssh devsecops@172.16.0.46

# 2. Navigate to project
cd /srv/emr

# 3. Backup database (optional but recommended)
docker exec emr-postgres-stag pg_dump -U emradmin emr_db_stag > backup_$(date +%Y%m%d_%H%M%S).sql

# 4. Run seed command with reset
docker-compose -f docker-compose.stag.yml exec backend python manage.py seed_demo_data --reset

# 5. Verify output shows success message

# 6. Test login with one of the demo users
# Go to staging frontend URL and login with: admin / ChangeMe123!
```

## Notes

- The command uses Django transactions, so if it fails partway through, all changes are rolled back
- Demo users have weak passwords (`ChangeMe123!`) - change them in production!
- The command is idempotent (safe to run multiple times) when used without `--reset`
- With `--reset`, it will delete and recreate all demo data

