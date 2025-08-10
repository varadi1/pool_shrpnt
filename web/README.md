# poolDRV Web Application

React-based frontend application for the poolDRV SharePoint provisioning system.

## Prerequisites

- Node.js 20 LTS or higher
- npm 10.x or higher
- Azure AD application configured for authentication

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and update with your values:

```bash
cp .env.production.example .env.development
```

Required environment variables:
- `VITE_API_BASE_URL` - Backend API URL (default: http://localhost:8000)
- `VITE_AZURE_TENANT_ID` - Your Azure AD tenant ID
- `VITE_AZURE_CLIENT_ID` - Your Azure AD application (client) ID
- `VITE_REDIRECT_URI` - OAuth redirect URI (default: http://localhost:3000)
- `VITE_POST_LOGOUT_REDIRECT_URI` - Post-logout redirect URI

### 3. Generate API Client

If the backend OpenAPI specification has been updated:

```bash
npm run generate-client
```

## Development

### Start Development Server

Local (host) development:
```bash
npm run dev
```

Docker (recommended full stack):
```bash
cd ..
./scripts/start.sh
```

The application will be available at http://localhost:3000

### Available Scripts

- `npm run dev` - Start development server with hot module replacement
- `npm run build` - Build production bundle
- `npm run preview` - Preview production build locally
- `npm run lint` - Check code with ESLint
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run type-check` - Run TypeScript type checking
- `npm run test` - Run tests in watch mode
- `npm run test:ui` - Open Vitest UI
- `npm run test:coverage` - Run tests with coverage report
- `npm run generate-client` - Regenerate API client from OpenAPI spec

## Project Structure

```
web/
├── src/
│   ├── components/     # Reusable React components
│   │   ├── auth/       # Authentication components
│   │   └── layout/     # Layout components (navigation, header)
│   ├── pages/          # Page components for routes
│   ├── services/       # API services and utilities
│   ├── hooks/          # Custom React hooks
│   ├── config/         # Configuration files (auth, env, theme)
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── generated/      # Auto-generated API client
│   ├── assets/         # Static assets (images, icons)
│   └── test/           # Test setup and utilities
├── public/             # Static public files
├── .env.development    # Development environment variables
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript configuration
├── vitest.config.ts    # Vitest test configuration
└── package.json        # Dependencies and scripts
```

## Technology Stack

- **React 18** - UI framework
- **TypeScript 5.x** - Type safety
- **Vite 7** - Build tool and dev server
- **Fluent UI 9** - Microsoft design system components
- **React Router v6** - Client-side routing
- **React Query v5** - Server state management
- **MSAL React** - Azure AD authentication
- **Vitest** - Unit testing framework
- **ESLint & Prettier** - Code quality and formatting

## Testing

### Run Tests

```bash
npm run test
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Open Test UI

```bash
npm run test:ui
```

## Building for Production

### Build Application

```bash
npm run build
```

The production build will be output to the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, Vite will automatically try the next available port (3001, 3002, etc.)

### Authentication Issues

1. Verify Azure AD configuration in environment variables
2. Ensure the redirect URI is registered in Azure AD app
3. Check browser console for MSAL errors

### API Connection Issues

1. Verify the backend API is running
2. Check `VITE_API_BASE_URL` in environment variables
3. Ensure CORS is configured on the backend

### Build Errors

1. Clear node_modules and reinstall: `rm -rf node_modules && npm install`
2. Check for TypeScript errors: `npm run type-check`
3. Ensure all environment variables are set

## Code Style Guidelines

This project uses:
- ESLint for code quality
- Prettier for code formatting
- TypeScript in strict mode

Pre-commit hooks are configured to run linting and formatting automatically (requires git repository).

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and ensure they pass
4. Run linting and formatting
5. Submit a pull request

## License

Proprietary - All rights reserved
