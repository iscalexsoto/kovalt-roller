import { useState } from 'react';
import { useLiveQuery } from '../../data/hooks';
import { changeCoins, give, inventoryQuery, removeFromInventory, setQuantity, updateInventoryItem } from '../../data/items';
import { itemFrom, type CharacterDoc, type ItemDoc } from '../../data/models';
import { GameIcon } from '../../icons/GameIcon';
import { toast, toastError } from '../../state/toast';
import { Button, IconButton } from '../kv/Button';
import { KickerDivider } from '../kv/Layout';
import { NumericPad } from '../kv/NumericPad';
import { Dialog } from '../kv/Overlay';
import { useRoom } from './context';
import { useDropTarget } from './drag';
import { ItemEditDialog, ItemGrid, ItemInfo, ItemTile } from './ItemDialogs';

/** Monedas del personaje; el DM las ajusta (±1 o escribiendo la cantidad). */
function Coins({ character }: { character: CharacterDoc }) {
  const ctx = useRoom();
  const [pad, setPad] = useState<string | null>(null);
  const coins = character.coins;
  const change = (delta: number) => changeCoins(ctx.room.id, character.id, coins, delta).catch(toastError);

  return (
    <div className="rl-coins">
      <GameIcon name="coins" className="rl-coins__icon" />
      <span className="rl-xp__label">Monedas</span>
      {ctx.isDm && <IconButton icon="minus" small label="Quitar 1 moneda" disabled={coins === 0} onClick={() => void change(-1)} />}
      {ctx.isDm ? (
        <button type="button" className="rl-coins__value kv-num kv-state" aria-label={`Monedas: ${coins}. Cambiar`} aria-haspopup="dialog" onClick={() => setPad(String(coins))}>
          {coins}
        </button>
      ) : (
        <span className="rl-coins__value kv-num">{coins}</span>
      )}
      {ctx.isDm && <IconButton icon="plus" small label="Dar 1 moneda" onClick={() => void change(1)} />}
      {pad !== null && (
        <NumericPad
          label="Monedas"
          value={pad}
          integerOnly
          onValue={setPad}
          onClose={() => {
            const next = Number(pad || '0');
            setPad(null);
            if (next !== coins) void change(next - coins);
          }}
        />
      )}
    </div>
  );
}

function ItemDetail({ character, item, onClose }: { character: CharacterDoc; item: ItemDoc; onClose: () => void }) {
  const ctx = useRoom();
  const canCount = character.id === ctx.uid || ctx.isDm;
  const [editing, setEditing] = useState(false);
  const change = (delta: number) => {
    const next = item.quantity + delta;
    if (next >= 0) setQuantity(ctx.room.id, character.id, item.id, next).catch(toastError);
  };

  if (editing) {
    return (
      <ItemEditDialog
        title="Editar objeto entregado"
        initial={item}
        withQuantity
        deleteLabel="Quitar"
        onClose={() => setEditing(false)}
        onSave={(next) => updateInventoryItem(ctx.room.id, character.id, item.id, next)}
        onDelete={async () => {
          await removeFromInventory(ctx.room.id, character.id, item.id);
          onClose();
        }}
      />
    );
  }
  return (
    <Dialog
      title={item.name}
      narrow={false}
      onClose={onClose}
      actions={
        <>
          {ctx.isDm && (
            <Button variant="text" icon="pencil" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
          <span className="rl-grow" />
          <Button variant="text" quiet onClick={onClose}>
            Cerrar
          </Button>
        </>
      }
    >
      <ItemInfo
        item={item}
        extra={
          <div className="rl-qty">
            <span className="rl-xp__label">Cantidad</span>
            {canCount && <IconButton icon="minus" small label="Uno menos" disabled={item.quantity === 0} onClick={() => change(-1)} />}
            <span className="rl-qty__value kv-num">{item.quantity}</span>
            {canCount && <IconButton icon="plus" small label="Uno más" onClick={() => change(1)} />}
          </div>
        }
      />
    </Dialog>
  );
}

/** Inventario en cuadrícula. Para el DM, la ficha también recibe objetos arrastrados del catálogo. */
export function Inventory({ character }: { character: CharacterDoc }) {
  const ctx = useRoom();
  const inv = useLiveQuery(`inv/${ctx.room.id}/${character.id}`, inventoryQuery(ctx.room.id, character.id), itemFrom);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = inv.data ?? [];
  const open = items.find((i) => i.id === openId);
  const target = useDropTarget(`sheet:${character.id}`, ({ item }) => {
    give(ctx.room.id, character.id, item, 1, ctx.uid)
      .then(() => toast(`${item.name} → ${character.sheet.name}`))
      .catch(toastError);
  });

  return (
    <div {...(ctx.isDm ? target.props : {})} className={`rl-inventory${ctx.isDm ? ` ${target.props.className}` : ''}`}>
      <KickerDivider className="rl-sheet__kicker">Inventario</KickerDivider>
      <Coins character={character} />
      {inv.data !== undefined && (
        <ItemGrid count={items.length} label={`Inventario de ${character.sheet.name}`}>
          {items.map((item) => (
            <div key={item.id} role="listitem" className="rl-grid__cell">
              <ItemTile look={item} name={item.name} count={item.quantity} dim={item.quantity === 0} onClick={() => setOpenId(item.id)} />
            </div>
          ))}
        </ItemGrid>
      )}
      {inv.data !== undefined && items.length === 0 && <p className="rl-hint">{ctx.isDm ? 'Arrastra aquí objetos del catálogo para entregarlos.' : 'Tu mochila está vacía.'}</p>}
      {open && <ItemDetail character={character} item={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
