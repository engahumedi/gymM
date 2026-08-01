import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useRouteError } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { AlertCircle, ICON_LG } from '@/components/ui/icons';

// Full-page fallback for an unrecoverable render error. Deliberately
// router-free (no <Link>): it also renders when the crash happened at or above
// <RouterProvider>, where router context does not exist.
function ErrorState() {
  const { t } = useI18n();

  // A crashed tree keeps its broken state, so both actions do a real reload
  // rather than an in-app navigation.
  function goHome() {
    window.location.hash = '#/';
    window.location.reload();
  }

  return (
    <div className="flex min-h-screen items-center bg-bg px-6 py-12">
      <div className="mx-auto w-full max-w-content">
        <div className="max-w-lg border-s-2 border-accent ps-8">
          <AlertCircle {...ICON_LG} className="mb-4 text-accent" />
          <h1 className="font-display text-4xl text-text">{t('error.boundary.title')}</h1>
          <p className="mt-3 text-lg text-muted">{t('error.boundary.body')}</p>
          <div className="mt-8 flex items-center gap-6">
            <Button onClick={() => window.location.reload()}>{t('error.boundary.reload')}</Button>
            <button type="button" onClick={goHome} className="text-sm text-muted transition-colors hover:text-text">
              {t('common.back_home')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

// React has no hook equivalent for componentDidCatch, so this one stays a class.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Nothing to report to (no error service on the free tier) — but leaving a
    // trace in the console is the difference between "blank page" and a fix.
    console.error('Unhandled render error', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? <ErrorState /> : this.props.children;
  }
}

// react-router renders its own (English, developer-facing) page for errors
// thrown inside a route. Used as `errorElement` so users see ours instead.
export function RouteErrorBoundary() {
  const error = useRouteError();
  console.error('Route error', error);
  return <ErrorState />;
}
