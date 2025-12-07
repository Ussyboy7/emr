# EMR Login Credentials

Demo user accounts have been created in the database. Use these credentials to log in:

## User Accounts

| Role | Username | Password |
|------|----------|----------|
| **System Administrator** | `admin` | `ChangeMe123!` |
| **Medical Doctor** | `doctor` | `ChangeMe123!` |
| **Nursing Officer** | `nurse` | `ChangeMe123!` |
| **Laboratory Scientist** | `labtech` | `ChangeMe123!` |
| **Pharmacist** | `pharmacist` | `ChangeMe123!` |
| **Radiologist** | `radiologist` | `ChangeMe123!` |
| **Medical Records Officer** | `records` | `ChangeMe123!` |

## Quick Login

You can use any of these accounts to log in to the EMR system at:
- Frontend: http://localhost:3001
- Backend API: http://localhost:8001/api

## To Reset/Create More Users

Run the seed command again:
```bash
cd backend
source .venv/bin/activate
python manage.py seed_demo_data
```

Or create a superuser manually:
```bash
cd backend
source .venv/bin/activate
python manage.py createsuperuser
```

