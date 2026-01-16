import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { AuthProvider } from '@/components/auth-provider';
import type { PlatformSettings } from '@/lib/types';

// Mock default settings
const defaultSettings: PlatformSettings = {
  isMaintenanceMode: false,
  allowNewTournaments: true,
};

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  settings?: PlatformSettings;
}

const AllTheProviders = ({ 
  children, 
  settings = defaultSettings 
}: { 
  children: React.ReactNode;
  settings?: PlatformSettings;
}) => {
  return (
    <AuthProvider settings={settings}>
      {children}
    </AuthProvider>
  );
};

const customRender = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
) => {
  const { settings, ...renderOptions } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <AllTheProviders settings={settings}>{children}</AllTheProviders>
    ),
    ...renderOptions,
  });
};

export * from '@testing-library/react';
export { customRender as render };
