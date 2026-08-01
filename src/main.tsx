import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { AuthProvider } from '@/auth/AuthProvider';
import { BrandProvider } from '@/lib/Brand';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { router } from '@/router';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrandProvider>
        <AuthProvider>
          {/* Last line of defence: a render error anywhere shows the error
              screen instead of a blank page. Inside I18nProvider so the
              fallback is still localized. */}
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </AuthProvider>
      </BrandProvider>
    </I18nProvider>
  </StrictMode>,
);
