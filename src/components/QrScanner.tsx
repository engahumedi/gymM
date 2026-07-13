import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { Modal } from '@/components/ui/Modal';
import { ErrorText } from '@/components/ui/misc';

const REGION_ID = 'qr-reader-region';

// Camera QR scanner. html5-qrcode is heavy and pulls in the camera API, so it's
// dynamically imported (separate chunk) only when the scanner is opened.
export function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(REGION_ID);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText: string) => {
            if (handledRef.current) return;
            handledRef.current = true;
            onScan(decodedText);
          },
          undefined,
        );
      } catch {
        if (!cancelled) setError(t('scan.err.camera'));
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => {});
      }
    };
  }, [onScan, t]);

  return (
    <Modal open onClose={onClose} title={t('scan.title')}>
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('scan.hint')}</p>
        <div id={REGION_ID} className="overflow-hidden rounded border border-border [&_video]:w-full" />
        <ErrorText error={error} />
      </div>
    </Modal>
  );
}
