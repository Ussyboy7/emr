# NPA EMR (Electronic Medical Records)

A modern full-stack application for managing electronic medical records, built with Django REST Framework and React.

## 📁 Project Structure

```
emr/
├── frontend/          # React + Vite frontend application
│   ├── src/          # Source code
│   ├── public/       # Static assets
│   ├── package.json
│   └── vite.config.ts
│
└── backend/          # Django REST Framework backend
    ├── emr_backend/  # Django project settings
    ├── accounts/     # User authentication
    ├── common/       # Shared utilities
    ├── organization/ # Organizational structure
    ├── correspondence/ # Correspondence management
    ├── manage.py
    └── requirements.txt
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

- Frontend: See `frontend/README.md` (if exists)
- Backend: See `backend/README.md`

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Django 4.2 + Django REST Framework + PostgreSQL + Redis + Channels

## 🔗 Related Projects

- `npa-ecm/` - Electronic Content Management system (similar structure)
- `npa-emr/` - Another EMR implementation

