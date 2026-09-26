import { useCallback, useState, type ReactNode } from 'react';
import { declareRoll } from '../../data/rolls';
import { toast, toastError } from '../../state/toast';
import { useRoom } from './context';
import { DeclareDialog } from './RollDialogs';

/** Abre el diálogo «Actuar» con una habilidad elegida y escribe la declaración. Solo para jugadores con personaje. */
export function useDeclare(): { open: (skillIndex?: number) => void; dialog: ReactNode } {
  const ctx = useRoom();
  const [skill, setSkill] = useState<number | null>(null);
  const open = useCallback((skillIndex = 0) => setSkill(skillIndex), []);
  const sheet = ctx.myCharacter?.sheet;

  const dialog =
    skill !== null && sheet ? (
      <DeclareDialog
        sheet={sheet}
        initialSkill={skill}
        onClose={() => setSkill(null)}
        onSubmit={(action, purpose, ref) => {
          setSkill(null);
          declareRoll(ctx.room.id, ctx.uid, action, purpose, ref)
            .then(() => toast('Declarada. El DM la ve en la mesa.'))
            .catch(toastError);
        }}
      />
    ) : null;

  return { open, dialog };
}
