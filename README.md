# NPA EMR (Electronic Medical Records)

A modern full-stack application for managing electronic medical records, built with Django REST Framework and React.

## 📁 Project Structure

```
emr/
├── backend/                      # Django REST Framework backend
│   ├── emr_backend/              # Django project settings (settings.py, urls.py, asgi.py, celery.py)
│   ├── accounts/                 # User auth (JWT)
│   ├── common/                   # Shared utilities + middleware
│   ├── organization/             # Organizational structure
│   ├── patients/                 # Patient records
│   ├── consultation/             # Clinical consultations
│   ├── laboratory/               # Lab module
│   ├── pharmacy/                 # Pharmacy module
│   ├── radiology/                # Radiology module
│   ├── physiotherapy/            # Physiotherapy module
│   ├── eyecare/                  # Eye care module
│   ├── nursing/                  # Nursing module
│   ├── wards/                    # Ward management
│   ├── appointments/             # Appointments
│   ├── audit/                    # Audit trail
│   ├── notifications/            # Notifications
│   ├── permissions/              # Role/page-level permissions
│   ├── reports/                  # Report generation
│   ├── dashboard/                # Dashboard data
│   ├── support/                  # Support/ticketing
│   ├── env/                      # Per-env dotenv files (local/stag/prod)
│   ├── scripts/                  # Backend-specific dev & DB scripts
│   ├── Dockerfile.prod           # Production backend image
│   ├── manage.py
│   └── requirements.txt
│
├── frontend/                     # Next.js 16 + React 18 frontend
│   ├── app/                      # App router pages
│   ├── components/               # UI components (shadcn/ui, Radix)
│   ├── lib/                      # Client utilities, API client
│   ├── hooks/                    # React hooks
│   ├── contexts/                 # React contexts
│   ├── public/                   # Static assets
│   ├── scripts/                  # Frontend-specific build utilities
│   ├── middleware.ts             # Route-level auth guard
│   ├── next.config.js
│   ├── Dockerfile.prod
│   └── package.json
│
├── scripts/                      # Operational / infrastructure scripts
│   ├── production/               # Prod manager, emergency, dashboard
│   ├── backup/                   # DB backup scripts (host + container)
│   ├── monitoring/               # System / performance monitors
│   ├── security/                 # Security & cron setup
│   ├── testing/                  # Go-live & security test scripts
│   └── start-*.sh / stop-*.sh    # Stack lifecycle helpers
│
├── nginx/                        # Nginx configuration (all environments)
│   ├── nginx.conf                # ← PROD: mounted by docker-compose.prod.yml
│   ├── local.conf
│   ├── stag.conf
│   └── prod.conf.reference       # Extended prod config (HSTS, auth limits)
│
├── docker-compose.local.yml      # Docker Compose — local
├── docker-compose.stag.yml       # Docker Compose — staging
├── docker-compose.prod.yml       # Docker Compose — production
│
├── docs/                         # Documentation and guides
├── backups/                      # Runtime backup output (git-ignored)
├── logs/                         # Runtime logs (git-ignored)
├── ssl/                          # SSL certs (git-ignored)
├── integration/                  # External device integrations (URIT5160, etc.)
├── infra/                        # Miscellaneous infra artefacts (status page, etc.)
├── Makefile                      # Build/dev tasks
├── PRODUCTION_OPERATIONS.md      # Production operations guide
└── README.md
```

## 🚀 Quick Start

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend will run at: http://localhost:3001

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment (create .env file)
# See backend/README.md for details

# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start development server
python manage.py runserver 8001
```

Backend will run at: http://localhost:8001

## 📋 Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL 14+
- Redis (for WebSocket support)

## 🔧 Configuration

### Frontend
- Port: 3001 (configured in `frontend/vite.config.ts`)
- API endpoint: Configure in your API client to point to `http://localhost:8001/api/`

### Backend
- Port: 8001 (configured in Django settings)
- Database: PostgreSQL (configure in `.env` file)
- CORS: Configured to allow requests from `http://localhost:3001`

## 📚 Documentation

- **Production Operations**: `PRODUCTION_OPERATIONS.md` - Complete production management guide
- Frontend: See `frontend/README.md` (if exists)
- Backend: See `backend/README.md`
- Pharmacy: `docs/PHARMACY_MEDICATION_STRENGTHS_AND_TOPICALS.md`
- Physiotherapy: `docs/PHYSIOTHERAPY_FLOW.md`
- Audit Checklist: `docs/ICT_EMR_AUDIT_CHECKLIST.md`
- Implementation Status: `docs/IMPLEMENTATION_STATUS.md`

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Django 4.2 + Django REST Framework + PostgreSQL + Redis + Channels

## 🚀 Production Deployment

After pushing code changes to GitHub:

```bash
# On production server, inside the repo checkout
./scripts/production/deploy.sh
```

`deploy.sh` takes a pre-deploy DB snapshot, runs `git pull`, rebuilds the containers, waits for the backend health check, and rolls back automatically on failure.

For detailed production operations, see `PRODUCTION_OPERATIONS.md`.

## 🔗 Related Projects

- `npa-ecm/` - Electronic Content Management system (similar structure)
- `npa-emr/` - Another EMR implementation

