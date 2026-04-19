# NPA ECM Frontend

A modern React-based frontend application for the NPA Electronic Content Management (ECM) system, part of the NPA EMR suite.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Runs the development server on http://localhost:3001

### Building
```bash
npm run build
```

### Testing
```bash
npm run test
```

### Linting
```bash
npm run lint
```

### Type Checking
```bash
npm run type-check
```

## 📁 Project Structure

```
frontend/
├── app/                    # Next.js app router pages
│   ├── (auth)/            # Authentication pages
│   ├── admin/             # Admin modules
│   ├── consultation/      # Consultation module
│   ├── dashboard/         # Dashboard
│   ├── laboratory/        # Laboratory module
│   ├── medical-records/   # Medical records
│   ├── nursing/           # Nursing module
│   ├── pharmacy/          # Pharmacy module
│   ├── radiology/         # Radiology module
│   └── ...
├── components/            # Reusable UI components
│   ├── ui/               # shadcn/ui components
│   └── ...
├── contexts/             # React contexts
├── hooks/                # Custom hooks
├── lib/                  # Utilities and services
│   ├── services/         # API services
│   └── ...
├── types/                # TypeScript type definitions
└── ...
```

## 🛠️ Technologies

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: React Query + Context API
- **Forms**: React Hook Form + Zod
- **Testing**: Vitest
- **Linting**: ESLint
- **Build Tool**: Vite

## 🔧 Configuration

- **Port**: 3001 (development)
- **API Base URL**: Configured via environment variables
- **Theme**: Supports light/dark mode

## 📚 Documentation

See the main project README at `../README.md` for full system overview and `../docs/IMPLEMENTATION_STATUS.md` for backend implementation details.

## 🤝 Contributing

1. Follow the existing code style
2. Run tests before committing
3. Ensure TypeScript types are correct
4. Update documentation as needed

## 📄 License

This project is part of the NPA EMR system.
