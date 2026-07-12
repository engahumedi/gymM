import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { AuthProvider } from '@/auth/AuthProvider';
import { BrandProvider } from '@/lib/Brand';
import { router } from '@/router';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrandProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </BrandProvider>
    </I18nProvider>
  </StrictMode>,
);
