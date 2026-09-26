import { createContext, useContext } from 'react';
import type { Actor } from '../../engine';
import type { CharacterDoc, Member, RollDoc, Room } from '../../data/models';

/** Todo lo que las piezas de la sala necesitan saber, calculado una vez en la pantalla. */
export interface RoomCtx {
  room: Room;
  uid: string;
  me: Member;
  isDm: boolean;
  members: Member[];
  /** Personajes de quienes siguen en la sala. */
  characters: CharacterDoc[];
  /** Personajes de jugadores que ya no están (expulsados o que se fueron); el DM puede borrarlos. */
  pastCharacters: CharacterDoc[];
  online: Set<string>;
  characterOf: (uid: string) => CharacterDoc | undefined;
  displayNameOf: (uid: string) => string;
  myCharacter: CharacterDoc | undefined;
  actorFor: (roll: RollDoc) => Actor;
}

export const RoomContext = createContext<RoomCtx | null>(null);

export function useRoom(): RoomCtx {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom fuera de la sala');
  return ctx;
}

export function buildRoomCtx(room: Room, uid: string, me: Member, members: Member[], characters: CharacterDoc[], online: Set<string>): RoomCtx {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const names = new Map(members.map((m) => [m.uid, m.displayName]));
  const isDm = room.dmUid === uid;
  const here = new Set(members.map((m) => m.uid));
  return {
    room,
    uid,
    me,
    isDm,
    members,
    characters: characters.filter((c) => here.has(c.ownerUid)),
    pastCharacters: characters.filter((c) => !here.has(c.ownerUid)),
    online,
    characterOf: (id) => byId.get(id),
    displayNameOf: (id) => names.get(id) ?? byId.get(id)?.sheet.name ?? 'Alguien',
    myCharacter: byId.get(uid),
    actorFor: (roll) => (isDm ? 'dm' : roll.characterId === uid ? 'owner' : 'other'),
  };
}
