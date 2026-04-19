# AGENTS.md - Kilo Commands for NPA ECM Frontend

## Development Commands

### Linting
- **Command**: `npm run lint`
- **Description**: Runs ESLint on the entire codebase to check for code quality issues and style violations.
- **Purpose**: Ensures consistent code style and catches potential bugs.

### Type Checking
- **Command**: `npm run type-check`
- **Description**: Runs TypeScript compiler in no-emit mode to check for type errors.
- **Purpose**: Validates TypeScript types and prevents runtime errors.

### Testing
- **Command**: `npm run test`
- **Description**: Runs unit tests using Vitest.
- **Purpose**: Executes automated tests to verify functionality.

### Building
- **Command**: `npm run build`
- **Description**: Builds the production version of the application using Next.js.
- **Purpose**: Creates optimized production bundles.

### Development Server
- **Command**: `npm run dev`
- **Description**: Starts the development server on port 3001.
- **Purpose**: Runs the app in development mode with hot reloading.

### Bundle Analysis
- **Command**: `npm run build:analyze`
- **Description**: Builds the app with bundle analyzer to inspect bundle sizes.
- **Purpose**: Helps optimize bundle sizes and identify large dependencies.

### Start Production Server
- **Command**: `npm run start`
- **Description**: Starts the production server on port 3001.
- **Purpose**: Runs the built application in production mode.

## Code Quality Notes

- ESLint is configured with Next.js core web vitals rules
- TypeScript strict mode is enabled
- Tests use Vitest framework
- Code follows React best practices with hooks and functional components
- Backend implementation details: See `docs/IMPLEMENTATION_STATUS.md`