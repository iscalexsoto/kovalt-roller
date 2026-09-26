import { MAX_DICE_LIMIT, type RoomSettings } from '../../engine';
import { Segmented } from '../kv/Button';
import { Checkbox, Stepper } from '../kv/Field';

/** Editor controlado de los ajustes de la sala. */
export function SettingsForm({ value, onChange }: { value: RoomSettings; onChange: (s: RoomSettings) => void }) {
  return (
    <div className="rl-settings">
      <div className="rl-settings__row">
        <span className="rl-settings__label">Slots de habilidad</span>
        <Stepper value={value.skillSlots} min={1} max={10} label="Slots" onChange={(v) => onChange({ ...value, skillSlots: Math.round(v) })} />
      </div>
      <div className="rl-settings__row">
        <span className="rl-settings__label">Máximo de dados</span>
        <Stepper value={value.maxDice} min={2} max={MAX_DICE_LIMIT} label="Dados" onChange={(v) => onChange({ ...value, maxDice: Math.round(v) })} />
      </div>
      <div className="rl-settings__row rl-settings__row--stack">
        <span className="rl-settings__label">En empate gana</span>
        <Segmented
          label="En empate gana"
          value={value.tieWinner}
          options={[
            { value: 'player', label: 'El jugador' },
            { value: 'opposition', label: 'La oposición' },
            { value: 'partial', label: 'Nadie (a medias)' },
          ]}
          onChange={(tieWinner) => onChange({ ...value, tieWinner })}
        />
      </div>
      <Checkbox
        label="El XP ganado al fallar sirve en esa misma tirada"
        checked={value.xpSameRoll}
        onChange={(e) => onChange({ ...value, xpSameRoll: e.target.checked })}
      />
    </div>
  );
}
