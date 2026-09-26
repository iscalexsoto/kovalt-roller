import { useState } from 'react';
import { BASE_SKILL_NAME, newCharacter } from '../../engine';
import { createCharacter } from '../../data/characters';
import { useBusy } from '../../hooks/useBusy';
import { Button } from '../kv/Button';
import { Field, TextArea } from '../kv/Field';
import { Card } from '../kv/Layout';
import { useRoom } from './context';
import { skillName } from './labels';

/** Primer paso de un jugador en la sala: su personaje, que empieza con "Do Anything 1". */
export function CharacterCreate() {
  const ctx = useRoom();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, run] = useBusy();
  const create = () => void run(() => createCharacter(ctx.room.id, ctx.uid, newCharacter(name, description)));

  return (
    <main className="rl-wrap rl-create">
      <Card>
        <h2 className="kv-card__title">Crea tu personaje</h2>
        <p className="kv-card__body">Empiezas con una sola habilidad y el resto la ganas jugando.</p>
        <div className="kv-form">
          <Field label="Nombre del personaje" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
          <TextArea label="Descripción (opcional)" value={description} maxLength={4000} rows={3} onChange={(e) => setDescription(e.target.value)} />
          <div className="rl-skill rl-skill--base">
            <span className="rl-skill__level kv-num">1</span>
            <span className="rl-skill__text">
              <span className="rl-skill__name">{skillName(BASE_SKILL_NAME)}</span>
              <span className="rl-skill__from">Permanente · no ocupa slot</span>
            </span>
          </div>
          <p className="rl-hint">
            En esta sala tienes {ctx.room.settings.skillSlots} slots para habilidades nuevas. Si sacas todo 6, ganas una habilidad un nivel más alta.
          </p>
          <Button variant="primary" icon="sparkles" disabled={!name.trim() || busy} onClick={create}>
            {busy ? 'Creando…' : 'Crear personaje'}
          </Button>
        </div>
      </Card>
    </main>
  );
}
