import { useCallback, useState, type ReactNode } from 'react';
import { Button } from './kv/Button';
import { Dialog } from './kv/Overlay';
import { PromptDialog, type PendingPrompt } from './PromptDialog';

interface PendingConfirm {
  title: string;
  message: ReactNode;
  okLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

/** Confirmaciones y pedidos de texto como promesas: `await confirm(...)`, `await prompt(...)`. */
export function useDialogs(): {
  confirm: (title: string, message: ReactNode, options?: { okLabel?: string; danger?: boolean }) => Promise<boolean>;
  prompt: (title: string, label: string, options?: { okLabel?: string; initial?: string; multiline?: boolean; required?: boolean; maxLength?: number }) => Promise<string | null>;
  dialogs: ReactNode;
} {
  const [pendingConfirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [pendingPrompt, setPrompt] = useState<PendingPrompt | null>(null);

  const confirm = useCallback(
    (title: string, message: ReactNode, options: { okLabel?: string; danger?: boolean } = {}) =>
      new Promise<boolean>((resolve) =>
        setConfirm({ title, message, okLabel: options.okLabel ?? 'Confirmar', danger: options.danger ?? false, resolve }),
      ),
    [],
  );

  const prompt = useCallback(
    (title: string, label: string, options: { okLabel?: string; initial?: string; multiline?: boolean; required?: boolean; maxLength?: number } = {}) =>
      new Promise<string | null>((resolve) =>
        setPrompt({
          title,
          label,
          okLabel: options.okLabel ?? 'Aceptar',
          initial: options.initial ?? '',
          multiline: options.multiline ?? false,
          required: options.required ?? false,
          maxLength: options.maxLength ?? 1000,
          resolve,
        }),
      ),
    [],
  );

  const closeConfirm = (ok: boolean) => {
    pendingConfirm?.resolve(ok);
    setConfirm(null);
  };

  const dialogs = (
    <>
      {pendingConfirm && (
        <Dialog
          title={pendingConfirm.title}
          icon={pendingConfirm.danger ? 'triangle-alert' : undefined}
          destructive={pendingConfirm.danger}
          onClose={() => closeConfirm(false)}
          actions={
            <>
              <Button variant="text" quiet onClick={() => closeConfirm(false)}>
                Cancelar
              </Button>
              <Button variant={pendingConfirm.danger ? 'destructive' : 'primary'} autoFocus onClick={() => closeConfirm(true)}>
                {pendingConfirm.okLabel}
              </Button>
            </>
          }
        >
          {pendingConfirm.message}
        </Dialog>
      )}
      {pendingPrompt && (
        <PromptDialog
          p={pendingPrompt}
          onDone={(text) => {
            pendingPrompt.resolve(text);
            setPrompt(null);
          }}
        />
      )}
    </>
  );

  return { confirm, prompt, dialogs };
}
