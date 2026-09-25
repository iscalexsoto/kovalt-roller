import { useState } from 'react';
import { claim, type OfferKind } from '../../engine';
import { errorMessage } from '../../data/errors';
import { useLiveQuery } from '../../data/hooks';
import { addLine, claimLine, createOffer, deleteOffer, linesQuery, offersQuery, removeLine, updateLine, updateOffer, visibleOffersQueries } from '../../data/items';
import { EVERYONE, lineFrom, offerFrom, type LineDoc, type OfferDoc } from '../../data/models';
import { useBusy } from '../../hooks/useBusy';
import { GameIcon } from '../../icons/GameIcon';
import { toast, toastError } from '../../state/toast';
import { useDialogs } from '../dialogs';
import { Button, Chip, IconButton } from '../kv/Button';
import { Field } from '../kv/Field';
import { KickerDivider, Tag } from '../kv/Layout';
import { Dialog } from '../kv/Overlay';
import { useRoom } from './context';
import { useDropTarget } from './drag';
import { ItemGrid, ItemInfo, ItemTile } from './ItemDialogs';

const KIND: Record<OfferKind, { icon: string; label: string; take: string }> = {
  loot: { icon: 'gift', label: 'Botín', take: 'Tomar' },
  shop: { icon: 'store', label: 'Tienda', take: 'Comprar' },
};

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 9);

function useLines(roomId: string, oid: string) {
  return useLiveQuery(`lines/${roomId}/${oid}`, linesQuery(roomId, oid), lineFrom);
}

function Price({ value }: { value: number }) {
  return (
    <span className="rl-price">
      <GameIcon name="coins" size={12} />
      {value}
    </span>
  );
}

function lineTag(kind: OfferKind, line: LineDoc) {
  if (line.stock === 0) return 'Agotado';
  return kind === 'shop' ? <Price value={line.price} /> : undefined;
}

// ---------- DM ----------

/** El DM ajusta existencias y precio de un objeto de la ventana, o lo quita. */
function LineDialog({ offer, line, onClose }: { offer: OfferDoc; line: LineDoc; onClose: () => void }) {
  const ctx = useRoom();
  const [stock, setStock] = useState(line.stock);
  const [price, setPrice] = useState(String(line.price));
  const [busy, run] = useBusy();
  return (
    <Dialog
      title={line.name}
      narrow={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" icon="trash-2" className="rl-danger-text" disabled={busy} onClick={() => void run(async () => (await removeLine(ctx.room.id, offer.id, line.id), onClose()))}>
            Quitar
          </Button>
          <span className="rl-grow" />
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void run(async () => (await updateLine(ctx.room.id, offer.id, { ...line, stock, price: Number(price || '0') }), onClose()))}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="kv-form">
        <ItemInfo item={line} />
        <div className="rl-qty">
          <span className="rl-xp__label">Existencias</span>
          <IconButton icon="minus" small label="Una menos" disabled={stock === 0} onClick={() => setStock(stock - 1)} />
          <span className="rl-qty__value kv-num">{stock}</span>
          <IconButton icon="plus" small label="Una más" disabled={stock >= 999} onClick={() => setStock(stock + 1)} />
        </div>
        {offer.kind === 'shop' && <Field label="Precio por unidad" inputMode="numeric" value={price} unit="monedas" onChange={(e) => setPrice(digits(e.target.value))} />}
      </div>
    </Dialog>
  );
}

function Audience({ offer }: { offer: OfferDoc }) {
  const ctx = useRoom();
  const all = offer.audience.includes(EVERYONE);
  const set = (audience: string[]) => updateOffer(ctx.room.id, offer.id, { audience: audience.length ? audience : [EVERYONE] }).catch(toastError);
  const toggle = (uid: string) => {
    if (all) return void set([uid]);
    void set(offer.audience.includes(uid) ? offer.audience.filter((u) => u !== uid) : [...offer.audience, uid]);
  };
  return (
    <div className="rl-chips" role="group" aria-label="Quién la ve">
      <Chip icon="users" selected={all} onClick={() => void set([EVERYONE])}>
        Todos
      </Chip>
      {ctx.characters.map((c) => (
        <Chip key={c.id} selected={!all && offer.audience.includes(c.id)} onClick={() => toggle(c.id)}>
          {c.sheet.name}
        </Chip>
      ))}
    </div>
  );
}

function OfferCard({ offer }: { offer: OfferDoc }) {
  const ctx = useRoom();
  const lines = useLines(ctx.room.id, offer.id);
  const [editing, setEditing] = useState<LineDoc | null>(null);
  const { confirm, prompt, dialogs } = useDialogs();
  const kind = KIND[offer.kind];
  const items = lines.data ?? [];
  const target = useDropTarget(`offer:${offer.id}`, ({ item }) => {
    addLine(ctx.room.id, offer.id, item).catch(toastError);
  });

  const rename = async () => {
    const title = await prompt(`Nombre de ${kind.label.toLowerCase()}`, 'Nombre', { initial: offer.title, required: true, maxLength: 60, okLabel: 'Guardar' });
    if (title !== null) updateOffer(ctx.room.id, offer.id, { title }).catch(toastError);
  };
  const remove = async () => {
    if (!(await confirm(`Borrar ${offer.title}`, 'Se cierra para todos y se pierde lo que quede en ella. Lo que ya tomaron se queda en sus inventarios.', { okLabel: 'Borrar', danger: true }))) return;
    deleteOffer(ctx.room.id, offer.id).catch(toastError);
  };

  return (
    <section {...target.props} className={`rl-offer ${target.props.className}${offer.open ? ' rl-offer--open' : ''}`} aria-label={offer.title}>
      <header className="rl-offer__head">
        <GameIcon name={kind.icon} className="rl-offer__icon" />
        <button type="button" className="rl-offer__title kv-state" title="Cambiar nombre" onClick={() => void rename()}>
          {offer.title}
        </button>
        <Tag small icon={offer.open ? 'eye' : 'eye-off'}>
          {offer.open ? 'Visible' : 'Oculta'}
        </Tag>
        <IconButton icon="trash-2" small label={`Borrar ${offer.title}`} onClick={() => void remove()} />
      </header>
      <Audience offer={offer} />
      {items.length === 0 ? (
        <p className="rl-hint rl-offer__empty">Arrastra aquí objetos del catálogo.</p>
      ) : (
        <ItemGrid count={items.length} label={`Objetos de ${offer.title}`}>
          {items.map((line) => (
            <div key={line.id} role="listitem" className="rl-grid__cell">
              <ItemTile look={line} name={line.name} count={line.stock} tag={lineTag(offer.kind, line)} dim={line.stock === 0} onClick={() => setEditing(line)} />
            </div>
          ))}
        </ItemGrid>
      )}
      <Button variant={offer.open ? 'tonal' : 'primary'} icon={offer.open ? 'eye-off' : 'eye'} dense disabled={!offer.open && items.length === 0} onClick={() => void updateOffer(ctx.room.id, offer.id, { open: !offer.open }).catch(toastError)}>
        {offer.open ? 'Ocultar' : 'Mostrar a los jugadores'}
      </Button>
      {editing && <LineDialog offer={offer} line={editing} onClose={() => setEditing(null)} />}
      {dialogs}
    </section>
  );
}

/** Botines y tiendas del DM: se arman soltando objetos del catálogo y se muestran a todos o a algunos. */
export function DmOffers() {
  const ctx = useRoom();
  const offers = useLiveQuery(`offers/${ctx.room.id}`, offersQuery(ctx.room.id), offerFrom);
  const [busy, run] = useBusy();
  const create = (kind: OfferKind) => void run(() => createOffer(ctx.room.id, kind, KIND[kind].label));

  return (
    <>
      <KickerDivider>Botín y tiendas</KickerDivider>
      <div className="rl-row">
        <Button variant="tonal" icon="gift" dense disabled={busy} onClick={() => create('loot')}>
          Botín
        </Button>
        <Button variant="tonal" icon="store" dense disabled={busy} onClick={() => create('shop')}>
          Tienda
        </Button>
      </div>
      {(offers.data ?? []).map((o) => (
        <OfferCard key={o.id} offer={o} />
      ))}
    </>
  );
}

// ---------- jugador ----------

function ClaimDialog({ offer, line, coins, onClose }: { offer: OfferDoc; line: LineDoc; coins: number; onClose: () => void }) {
  const ctx = useRoom();
  const [quantity, setQuantity] = useState(1);
  const [busy, run] = useBusy();
  const kind = KIND[offer.kind];
  const q = Math.min(quantity, Math.max(1, line.stock));
  let problem: string | null = null;
  try {
    claim(offer.kind, line, q, coins);
  } catch (e) {
    problem = errorMessage(e);
  }
  const cost = offer.kind === 'shop' ? line.price * q : 0;

  return (
    <Dialog
      title={line.name}
      narrow={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" quiet onClick={onClose}>
            Cerrar
          </Button>
          <Button
            variant="primary"
            icon={kind.icon}
            disabled={busy || problem !== null}
            onClick={() =>
              void run(async () => {
                await claimLine(ctx.room.id, offer.id, offer.kind, line.id, ctx.uid, q);
                toast(offer.kind === 'shop' ? `Compraste ${q} × ${line.name}` : `Tomaste ${q} × ${line.name}`);
                onClose();
              })
            }
          >
            {offer.kind === 'shop' ? `${kind.take} · ${cost}` : kind.take}
          </Button>
        </>
      }
    >
      <ItemInfo
        item={line}
        extra={
          <>
            <div className="rl-qty">
              <span className="rl-xp__label">Cantidad</span>
              <IconButton icon="minus" small label="Una menos" disabled={q <= 1} onClick={() => setQuantity(q - 1)} />
              <span className="rl-qty__value kv-num">{q}</span>
              <IconButton icon="plus" small label="Una más" disabled={q >= line.stock} onClick={() => setQuantity(q + 1)} />
              <span className="rl-hint">de {line.stock}</span>
            </div>
            {offer.kind === 'shop' && (
              <span className="rl-coins-inline">
                <GameIcon name="coins" size={16} /> {line.price} c/u · tienes {coins}
              </span>
            )}
            {problem && <span className="rl-hint rl-danger-text">{problem}</span>}
          </>
        }
      />
    </Dialog>
  );
}

function OfferWindow({ offer }: { offer: OfferDoc }) {
  const ctx = useRoom();
  const lines = useLines(ctx.room.id, offer.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const kind = KIND[offer.kind];
  const coins = ctx.myCharacter?.coins ?? 0;
  const items = lines.data ?? [];
  const open = items.find((l) => l.id === openId);
  const left = items.reduce((n, l) => n + l.stock, 0);

  return (
    <section className={`rl-window rl-window--${offer.kind}`} aria-label={offer.title}>
      <header className="rl-window__head">
        <GameIcon name={kind.icon} className="rl-offer__icon" />
        <span className="rl-window__title rl-grow">
          {offer.title !== kind.label && <span className="rl-window__kind">{kind.label}</span>}
          {offer.title}
        </span>
        {offer.kind === 'shop' && (
          <Tag small icon="coins">
            {coins}
          </Tag>
        )}
        <IconButton icon={collapsed ? 'chevron-down' : 'minus'} small label={collapsed ? 'Abrir' : 'Minimizar'} onClick={() => setCollapsed(!collapsed)} />
      </header>
      {!collapsed &&
        (lines.data === undefined ? null : left === 0 ? (
          <p className="rl-hint">Ya no queda nada.</p>
        ) : (
          <ItemGrid count={items.length} columns="auto" label={`Objetos de ${offer.title}`}>
            {items.map((line) => (
              <div key={line.id} role="listitem" className="rl-grid__cell">
                <ItemTile look={line} name={line.name} count={line.stock} tag={lineTag(offer.kind, line)} dim={line.stock === 0} onClick={line.stock > 0 ? () => setOpenId(line.id) : undefined} />
              </div>
            ))}
          </ItemGrid>
        ))}
      {open && open.stock > 0 && <ClaimDialog offer={offer} line={open} coins={coins} onClose={() => setOpenId(null)} />}
    </section>
  );
}

/** Ventanas de botín y tiendas abiertas para este jugador. */
export function PlayerOffers() {
  const ctx = useRoom();
  const [everyone, mine] = visibleOffersQueries(ctx.room.id, ctx.uid);
  const a = useLiveQuery(`offers-all/${ctx.room.id}`, everyone, offerFrom);
  const b = useLiveQuery(`offers-me/${ctx.room.id}/${ctx.uid}`, mine, offerFrom);
  const byId = new Map([...(a.data ?? []), ...(b.data ?? [])].map((o) => [o.id, o]));
  const offers = [...byId.values()].sort((x, y) => (x.createdAt?.getTime() ?? 0) - (y.createdAt?.getTime() ?? 0));
  if (!ctx.myCharacter || offers.length === 0) return null;
  return (
    <div className="rl-windows">
      {offers.map((o) => (
        <OfferWindow key={o.id} offer={o} />
      ))}
    </div>
  );
}
