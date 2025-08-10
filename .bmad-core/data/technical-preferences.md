# User-Defined Preferred Patterns and Preferences

## CRITICAL PROJECT REQUIREMENTS - ALL AGENTS MUST FOLLOW

### 1. Database Requirements
- **NO SQLite** - ABSOLUTELY NO SQLite for testing, mockups, or any purpose
- **PostgreSQL ONLY** - All database operations must use PostgreSQL running in Docker
- Database connections must use the PostgreSQL container configuration
- Test environments must connect to real PostgreSQL instances

### 2. Testing Philosophy
- **NO MOCKUPS** - Everything in containers or local must be real and tested
- All tests must run against actual services and databases
- Integration tests must use real database connections
- API tests must hit real endpoints
- No mocked services unless absolutely necessary for external third-party APIs

### 3. UI Language Requirements
- **PRIMARY LANGUAGE: HUNGARIAN** 
- ALL UI components, labels, buttons, messages, tooltips must be in Hungarian
- Component names in code can remain English for maintainability
- User-facing text MUST be Hungarian:
  - Form labels (példa: "Felhasználónév" not "Username")
  - Button text (példa: "Mentés" not "Save")
  - Error messages (példa: "Hiba történt" not "Error occurred")
  - Navigation items (példa: "Irányítópult" not "Dashboard")
- Comments in code can be English
- Variable names can be English

### 4. UI Component Integration
- New UI components MUST be integrated into existing application
- Components must be:
  - Connected to existing navigation structure
  - Integrated into appropriate pages/routes
  - Linked from relevant menus or dashboards
  - Following existing UI patterns and styles
- No standalone/orphaned components

### 5. Testing Framework
- **Playwright** for UI and E2E functionality testing
- All new UI features must include Playwright tests
- Test scenarios must cover:
  - User interactions
  - Navigation flows
  - Form submissions
  - Error states
  - Hungarian language display
- Playwright tests should run against real backend services

### relative API path
- Always call the backend via relative path: `/api/...` from the frontend.
- Do NOT set `VITE_API_BASE_URL` in development. Leave it empty so the app uses `'/api'` and Vite forwards to the backend.
- Start the backend locally on port 8000 while developing the web app.

  #### Why
  - If the frontend calls `http://localhost:8000/api/...` directly and the API is not running, the browser logs `net::ERR_CONNECTION_REFUSED` repeatedly (axios retries make the noise worse).
  - Using the relative `/api` base lets Vite dev server proxy requests to `http://localhost:8000` automatically.

  ### docker frontend
  In dev, keep frontend calling relative /api and don’t export VITE_API_BASE_URL in your shell. In Docker dev, we have set VITE_API_BASE_URL=http://api:8000 inside the container

## Project Structure Context
- Backend: FastAPI (Python)
- Frontend: React with TypeScript
- Database: PostgreSQL in Docker
- Testing: Pytest (backend), Playwright (frontend/E2E)
- All services run in Docker containers for development

## Example Compliance Check
✅ CORRECT:
- PostgreSQL for all database operations
- Real API calls in tests
- UI label: "Bejelentkezés"
- Component integrated into Navigation.tsx
- Playwright test for new feature

❌ INCORRECT:
- Using SQLite for "quick testing"
- Mocked database in tests
- UI label: "Login"
- Standalone component file without integration
- No Playwright tests for UI changes
