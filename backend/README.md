# EMR Backend

Django REST Framework backend for the NPA EMR (Electronic Medical Records) system.

## Structure

```
backend/
├── emr_backend/      # Django project settings
├── accounts/         # User authentication & management
├── common/           # Shared utilities
├── organization/     # Organizational structure
├── correspondence/   # Correspondence management
├── manage.py
└── requirements.txt
```

## Setup

1. Create virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment variables (create `.env` file):
```env
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=True
DB_NAME=emr_db
DB_USER=emr_user
DB_PASSWORD=emr_password
DB_HOST=localhost
DB_PORT=5432
REDIS_HOST=localhost
REDIS_PORT=6379
CORS_ALLOWED_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
```

4. Run migrations:
```bash
python manage.py makemigrations
python manage.py migrate
```

5. Create superuser:
```bash
python manage.py createsuperuser
```

6. Start development server:
```bash
python manage.py runserver 8001
```

## API Documentation

Once the server is running, access:
- Swagger UI: http://localhost:8001/api/docs/
- ReDoc: http://localhost:8001/api/redoc/
- Schema: http://localhost:8001/api/schema/

