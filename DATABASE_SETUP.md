# 🗄️ Database Setup Guide

## Next Steps: Database Setup & Migration

Now that all frontend pages are connected to the backend APIs, we need to:

1. **Set up PostgreSQL database**
2. **Create and run migrations**
3. **Seed demo data**
4. **Test the full stack**

---

## 📋 **Step 1: Install PostgreSQL**

### macOS:
```bash
brew install postgresql@15
brew services start postgresql@15
```

### Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Windows:
Download from: https://www.postgresql.org/download/windows/

---

## 📋 **Step 2: Create Database**

```bash
# Connect to PostgreSQL
psql postgres

# Create database and user
CREATE DATABASE emr_db;
CREATE USER emr_user WITH PASSWORD 'emr_password';
GRANT ALL PRIVILEGES ON DATABASE emr_db TO emr_user;
\q
```

---

## 📋 **Step 3: Configure Environment Variables**

Create `.env` file in `emr/backend/`:

```env
# Database
DB_NAME=emr_db
DB_USER=emr_user
DB_PASSWORD=emr_password
DB_HOST=localhost
DB_PORT=5432

# Django
DJANGO_SECRET_KEY=your-secret-key-here-change-in-production
DJANGO_DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
CSRF_TRUSTED_ORIGINS=http://localhost:8001,http://127.0.0.1:8001,http://localhost:3001,http://127.0.0.1:3001

# JWT
JWT_ACCESS_MINUTES=60
JWT_REFRESH_DAYS=7

# Timezone
TIME_ZONE=Africa/Lagos
```

---

## 📋 **Step 4: Install Python Dependencies**

```bash
cd emr/backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

---

## 📋 **Step 5: Create Migrations**

```bash
cd emr/backend
python manage.py makemigrations
```

This will create migration files for all apps:
- accounts
- patients
- laboratory
- pharmacy
- radiology
- consultation
- nursing
- audit
- notifications
- permissions
- dashboard
- appointments
- reports
- organization
- common

---

## 📋 **Step 6: Run Migrations**

```bash
python manage.py migrate
```

This creates all database tables.

---

## 📋 **Step 7: Create Superuser**

```bash
python manage.py createsuperuser
```

Enter:
- Username: admin
- Email: admin@example.com
- Password: (choose a secure password)

---

## 📋 **Step 8: Seed Demo Data**

```bash
python manage.py seed_demo_data
```

This will create:
- Demo users (doctors, nurses, pharmacists, lab techs)
- Demo patients
- Demo lab templates
- Demo medications
- Demo prescriptions
- Demo lab orders
- Demo radiology orders
- And more...

**To reset and reseed:**
```bash
python manage.py seed_demo_data --reset
```

---

## 📋 **Step 9: Start Backend Server**

```bash
python manage.py runserver 8001
```

Backend will run on: http://localhost:8001

---

## 📋 **Step 10: Test the Full Stack**

1. **Frontend**: http://localhost:3001 (already running)
2. **Backend API**: http://localhost:8001/api/v1/
3. **Django Admin**: http://localhost:8001/admin/

### Test Login:
- Use the superuser credentials you created
- Or use demo user credentials from seed data

---

## 🧪 **Quick Test Commands**

### Check database connection:
```bash
python manage.py dbshell
```

### Check migrations status:
```bash
python manage.py showmigrations
```

### Create a test user:
```bash
python manage.py shell
>>> from accounts.models import User
>>> User.objects.create_user('testuser', 'test@example.com', 'password123')
```

---

## 📊 **Database Schema Overview**

The database includes tables for:

- **Users & Authentication**: `accounts_user`, `accounts_user_groups`
- **Patients**: `patients_patient`, `patients_visit`, `patients_vitalreading`
- **Laboratory**: `lab_templates`, `lab_orders`, `lab_tests`, `lab_results`
- **Pharmacy**: `medications`, `medication_inventory`, `prescriptions`, `prescription_items`, `dispenses`
- **Radiology**: `radiology_orders`, `radiology_studies`, `radiology_reports`
- **Consultation**: `consultation_rooms`, `consultation_sessions`, `consultation_queues`
- **Nursing**: `nursing_orders`
- **Audit**: `activity_logs`
- **Notifications**: `notifications`, `notification_preferences`
- **Organization**: `clinics`, `departments`, `rooms`
- **Appointments**: `appointments`, `appointment_slots`
- **Reports**: `report_templates`, `generated_reports`

---

## 🚨 **Troubleshooting**

### Database connection error:
- Check PostgreSQL is running: `brew services list` (macOS) or `sudo systemctl status postgresql` (Linux)
- Verify credentials in `.env` file
- Check database exists: `psql -l`

### Migration errors:
- Delete migration files (except `__init__.py`) and recreate: `python manage.py makemigrations`
- Reset database: `dropdb emr_db && createdb emr_db` then run migrations again

### Port already in use:
- Change port: `python manage.py runserver 8002`
- Or kill process: `lsof -ti:8001 | xargs kill -9`

---

## ✅ **Success Checklist**

- [ ] PostgreSQL installed and running
- [ ] Database `emr_db` created
- [ ] `.env` file configured
- [ ] Python dependencies installed
- [ ] Migrations created (`makemigrations`)
- [ ] Migrations applied (`migrate`)
- [ ] Superuser created
- [ ] Demo data seeded
- [ ] Backend server running on port 8001
- [ ] Frontend server running on port 3001
- [ ] Can access Django admin
- [ ] Can login and see data in frontend

---

## 🎯 **After Database Setup**

Once the database is set up and seeded:

1. **Test all pages** - Navigate through all 11 connected pages
2. **Test CRUD operations** - Create, read, update, delete data
3. **Test workflows** - Lab orders → collection → processing → results → verification
4. **Test authentication** - Login, logout, token refresh
5. **Check API endpoints** - Use Django admin or API browser

---

**Ready to set up the database?** Follow the steps above! 🚀

