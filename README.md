# NPA EMR (Electronic Medical Records)

A modern full-stack application for managing electronic medical records, built with Django REST Framework and React.

## 📁 Project Structure

```
emr/
├── backend/              # Django REST Framework backend
│   ├── emr_backend/      # Django project settings
│   ├── accounts/         # User authentication
│   ├── common/           # Shared utilities
│   ├── organization/     # Organizational structure
│   ├── correspondence/   # Correspondence management
│   ├── pharmacy/         # Pharmacy module
│   ├── manage.py
│   └── requirements.txt
│
├── frontend/             # React + Vite frontend application
│   ├── src/             # Source code
│   ├── public/          # Static assets
│   ├── package.json
│   └── vite.config.ts
│
├── scripts/              # Operational scripts
│   ├── production/      # Production management scripts
│   ├── security/        # Security scripts
│   ├── backup/          # Backup scripts
│   ├── monitoring/      # Monitoring scripts
│   └── testing/         # Testing scripts
│
├── deployment/           # Docker Compose configurations
│   ├── docker-compose.local.yml
│   ├── docker-compose.stag.yml
│   └── docker-compose.prod.yml
│
├── logs/                # System logs and reports
├── docs/                # Documentation and guides
├── backups/             # Backup files and configurations
├── nginx/               # Nginx configuration
├── ssl/                 # SSL certificates
├── status-page/         # Status page application
├── Makefile             # Build and development tasks
└── PRODUCTION_OPERATIONS.md  # Production operations guide
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
# On production server
git pull origin main
./scripts/production/emr-prod-manager.sh restart
```

For detailed production operations, see `PRODUCTION_OPERATIONS.md`.

## 🔗 Related Projects

- `npa-ecm/` - Electronic Content Management system (similar structure)
- `npa-emr/` - Another EMR implementation

