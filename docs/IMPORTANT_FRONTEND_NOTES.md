# IMPORTANT NOTES FOR FUTURE AGENTS - FRONTEND DEVELOPMENT

## Critical: API Base URL & Vite Proxy (avoid ERR_CONNECTION_REFUSED)

### Rule (MANDATORY in development)
- Always call the backend via relative path: `/api/...` from the frontend.
- Do NOT set `VITE_API_BASE_URL` in host-local development. Leave it empty so the app uses `'/api'` and Vite forwards to the backend.
- In Docker development, the frontend container receives `API_INTERNAL_URL=http://api:8000` and Vite proxy forwards `/api` to the API service. In host-local dev, leave `VITE_API_BASE_URL` unset.
- Start the backend locally on port 8000 while developing the web app.

### Why
- If the frontend calls `http://localhost:8000/api/...` directly and the API is not running, the browser logs `net::ERR_CONNECTION_REFUSED` repeatedly (axios retries make the noise worse).
- Using the relative `/api` base lets Vite dev server proxy requests to `http://localhost:8000` automatically.

### How
1. Backend (in repo root):
   ```bash
   python3 -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
   # If 'uvicorn' CLI is not found, the module form above always works
   # Health check:
   curl -s http://localhost:8000/api/health
   ```
2. Frontend (in `web/`):
   ```bash
   npm run dev
   # App at http://localhost:3000
   ```
3. Verify in DevTools Network:
   - Requests should go to `http://localhost:3000/api/...` (proxied), NOT directly to `http://localhost:8000/...`.

### Troubleshooting
- Seeing `ERR_CONNECTION_REFUSED` on pages like `Contracts`? Check:
  - Ensure backend is running on 8000.
  - Ensure there is NO `VITE_API_BASE_URL` exported in your shell or `.env` during development. If present, remove/unset it and restart Vite.
  - Confirm `web/src/config/env.config.ts` default is `'/api'`.
  - Confirm `web/vite.config.ts` has proxy for `'/api'` → `http://localhost:8000`.

### Production/Non-dev
- In environments outside local dev, set `VITE_API_BASE_URL` to the public API gateway/base (e.g. `https://api.example.com`) if you cannot rely on a dev proxy.

---

## Critical: TypeScript Type Imports Issue

### Problem
When adding new pages or components that import TypeScript interfaces/types from other files, the frontend may fail to load with errors like:
```
Uncaught SyntaxError: The requested module '/src/types/permissions.ts' does not provide an export named 'FolderPermission'
```

### Root Cause
Vite/ESBuild has issues with regular imports of TypeScript interfaces. When you import an interface without the `type` keyword, it tries to import it as a JavaScript value at runtime, which fails because interfaces don't exist at runtime.

### Solution
**ALWAYS use `import type` for TypeScript interfaces, type aliases, and types:**

❌ **WRONG:**
```typescript
import { FolderPermission, InheritanceState } from '../../types/permissions';
import { LockState } from '../../types/permissions';
```

✅ **CORRECT:**
```typescript
import type { FolderPermission, InheritanceState } from '../../types/permissions';
import type { LockState } from '../../types/permissions';
```

### Checklist for Adding New Components/Pages

1. **Before creating new imports:**
   - Check if you're importing TypeScript interfaces or types
   - Use `import type` for all type-only imports

2. **When the frontend fails to load:**
   - Check browser console for "does not provide an export named" errors
   - Search for imports from type definition files without `import type`
   - Fix all type imports to use `import type`

3. **Common files that need type imports:**
   - `/src/types/*.ts` - All files here export interfaces/types
   - Component prop interfaces
   - API response types
   - Redux/Context state types

4. **How to find problematic imports:**
   ```bash
   # Find all imports from type files that don't use 'import type'
   grep -r "import {" src/ | grep "types/" | grep -v "import type"
   ```

5. **After fixing imports:**
   - Clear Vite cache: `rm -rf node_modules/.vite`
   - Restart dev server
   - Check that the app loads properly

### Prevention
- Configure ESLint rule to enforce type imports:
  ```json
  {
    "@typescript-eslint/consistent-type-imports": ["error", {
      "prefer": "type-imports"
    }]
  }
  ```

### Additional Notes
- This issue commonly occurs when:
  - Adding new permission-related components
  - Creating new type definition files
  - Importing API response interfaces
  - Using shared type definitions across components

### Files Recently Fixed
- `/src/components/permissions/InheritanceToggle.tsx`
- `/src/components/permissions/ManualLockModal.tsx`
- `/src/components/permissions/UserGroupAssignment.tsx`
- `/src/pages/permissions/PermissionMatrix.tsx`
- Test files importing these types

## Critical: Frontend Not Loading (Blank Page)

### If the frontend shows a blank page:

1. **Check browser console** - Open Developer Tools (F12) and check Console tab for errors
2. **Most common causes:**
   - TypeScript type import issues (see above)
   - Fluent UI component import issues (see below)
   - Playwright being imported in frontend code

### Common Import Errors and Solutions

#### 1. TypeScript Type Imports
- **Error:** `does not provide an export named 'FolderPermission'`
- **Solution:** Use `import type` for all TypeScript interfaces/types

#### 2. Fluent UI Component Imports
- **Error:** `does not provide an export named 'SelectTabData'` or `SelectTabEvent`
- **Solution:** These types were removed in newer Fluent UI versions
  ```typescript
  // ❌ WRONG
  import { SelectTabData, SelectTabEvent } from '@fluentui/react-components';
  
  // ✅ CORRECT
  // Remove these imports and use 'any' or proper event types
  const handleTabSelect = (_: any, data: any) => {
    setSelectedTab(data.value as string);
  };
  ```

#### 3. Playwright in Frontend Code
- **Error:** `Could not resolve "chromium-bidi/lib/cjs/bidiMapper/BidiMapper"`
- **Solution:** Add to vite.config.ts:
  ```typescript
  optimizeDeps: {
    exclude: ['playwright', '@playwright/test', 'playwright-core']
  }
  ```

### Troubleshooting Steps
1. Clear Vite cache: `rm -rf node_modules/.vite`
2. Check browser console for specific error messages
3. Restart dev server: `npm run dev`
4. Verify all imports are correct
5. Check that TypeScript compilation succeeds: `npx tsc --noEmit`

## Other Common Issues

### 1. Vite Cache Issues
If changes aren't reflected:
```bash
rm -rf node_modules/.vite
npm run dev
```

### 2. Port Conflicts
Default port is 3000, not 5173. Check the actual port in the console output.

### 3. Mock Authentication
The app uses `VITE_USE_MOCK_AUTH=true` in development, which sets up a mock admin user.

---
Last Updated: 2025-08-10
Updated By: Claude (fixing FolderPermission import issue)