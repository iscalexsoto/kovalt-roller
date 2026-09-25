import { useState } from 'react';
import { Button } from './kv/Button';
import { Field, TextArea } from './kv/Field';
import { Dialog } from './kv/Overlay';

export interface PendingPrompt {
  title: string;
  label: string;
  okLabel: string;
  initial: string;
  multiline: boolean;
  required: boolean;
  maxLength: number;
  resolve: (text: string | null) => void;
}

export function PromptDialog({ p, onDone }: { p: PendingPrompt; onDone: (text: string | null) => void }) {
  const [text, setText] = useState(p.initial);
  const ok = !p.required || text.trim() !== '';
  const submit = () => ok && onDone(text.trim());
  return (
    <Dialog
      title={p.title}
      onClose={() => onDone(null)}
      actions={
        <>
          <Button variant="text" quiet onClick={() => onDone(null)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!ok} onClick={submit}>
            {p.okLabel}
          </Button>
        </>
      }
    >
      {p.multiline ? (
        <TextArea label={p.label} value={text} maxLength={p.maxLength} rows={4} autoFocus onChange={(e) => setText(e.target.value)} />
      ) : (
        <Field
          label={p.label}
          value={text}
          maxLength={p.maxLength}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      )}
    </Dialog>
  );
}
