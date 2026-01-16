# Testing Guide

This directory contains the testing infrastructure for eArena.

## Test Structure

```
src/
  test/
    setup.ts              # Global test setup
    utils/
      test-utils.tsx      # Testing utilities and custom render
    mocks/
      firebase.ts         # Firebase mocks
      server-actions.ts  # Server action mocks
  lib/
    *.test.ts            # Unit tests for utilities
  components/
    **/*.test.tsx         # Component tests
e2e/
  *.spec.ts              # End-to-end tests
```

## Running Tests

### Unit Tests
```bash
# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### E2E Tests
```bash
# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug
```

### All Tests
```bash
npm run test:all
```

## Writing Tests

### Unit Tests
Use Vitest for unit tests. Example:

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './my-module';

describe('myFunction', () => {
  it('should do something', () => {
    expect(myFunction()).toBe(expected);
  });
});
```

### Component Tests
Use React Testing Library. Example:

```typescript
import { render, screen } from '@/test/utils/test-utils';
import { MyComponent } from './my-component';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### E2E Tests
Use Playwright. Example:

```typescript
import { test, expect } from '@playwright/test';

test('should navigate to page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading')).toBeVisible();
});
```

## Best Practices

1. **Test Behavior, Not Implementation**
   - Focus on what the code does, not how it does it
   - Test user interactions and outcomes

2. **Keep Tests Simple**
   - One assertion per test when possible
   - Use descriptive test names

3. **Mock External Dependencies**
   - Mock Firebase, API calls, etc.
   - Use the mocks in `src/test/mocks/`

4. **Test Edge Cases**
   - Test error conditions
   - Test boundary values
   - Test empty states

5. **Maintain Test Coverage**
   - Aim for 70%+ coverage
   - Focus on critical paths

## Coverage Goals

- Lines: 70%
- Functions: 70%
- Branches: 70%
- Statements: 70%

## CI/CD

Tests run automatically on:
- Push to main/develop
- Pull requests

Both unit and E2E tests must pass before merging.
