import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should load homepage successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check for main heading
    await expect(page.getByRole('heading', { name: /welcome to earena/i })).toBeVisible();
    
    // Check for navigation links
    await expect(page.getByRole('link', { name: /join the arena/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /browse tournaments/i })).toBeVisible();
  });

  test('should navigate to signup page', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('link', { name: /join the arena/i }).click();
    
    await expect(page).toHaveURL(/.*signup/);
    await expect(page.getByRole('heading', { name: /sign up/i })).toBeVisible();
  });

  test('should navigate to tournaments page', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('link', { name: /browse tournaments/i }).click();
    
    await expect(page).toHaveURL(/.*tournaments/);
  });
});

test.describe('Authentication', () => {
  test('should show login form', async ({ page }) => {
    await page.goto('/login');
    
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/login');
    
    const emailInput = page.getByLabel(/email/i);
    await emailInput.fill('invalid-email');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/invalid email/i)).toBeVisible();
  });
});

test.describe('Tournaments', () => {
  test('should display tournaments list', async ({ page }) => {
    await page.goto('/tournaments');
    
    // Check for tournaments page heading
    await expect(page.getByRole('heading', { name: /tournaments/i })).toBeVisible();
  });
});
