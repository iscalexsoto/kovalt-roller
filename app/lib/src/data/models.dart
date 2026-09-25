import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../rust/api/engine.dart';
import '../rust/api/flow.dart';

typedef Json = Map<String, dynamic>;

enum MemberRole { dm, player }

// ---------- ajustes ----------

RoomSettingsDto settingsFromMap(Json m) => RoomSettingsDto(
  skillSlots: (m['skillSlots'] as num).toInt(),
  tieWinner: m['tieWinner'] == 'opposition' ? TieWinnerDto.opposition : TieWinnerDto.player,
  xpSameRoll: m['xpSameRoll'] as bool,
  maxDice: (m['maxDice'] as num).toInt(),
);

Json settingsToMap(RoomSettingsDto s) => {
  'skillSlots': s.skillSlots,
  'tieWinner': tieWinnerId(s.tieWinner),
  'xpSameRoll': s.xpSameRoll,
  'maxDice': s.maxDice,
};

String tieWinnerId(TieWinnerDto t) => t == TieWinnerDto.opposition ? 'opposition' : 'player';

TieWinnerDto? tieWinnerFromId(Object? id) => switch (id) {
  'player' => TieWinnerDto.player,
  'opposition' => TieWinnerDto.opposition,
  _ => null,
};

// ---------- sala y miembros ----------

class Room {
  const Room({
    required this.id,
    required this.name,
    required this.dmUid,
    required this.code,
    required this.status,
    required this.settings,
  });

  final String id;
  final String name;
  final String dmUid;
  final String code;
  final String status;
  final RoomSettingsDto settings;

  factory Room.fromDoc(DocumentSnapshot<Json> d) {
    final m = d.data()!;
    return Room(
      id: d.id,
      name: m['name'] as String,
      dmUid: m['dmUid'] as String,
      code: m['code'] as String,
      status: m['status'] as String? ?? 'open',
      settings: settingsFromMap(Map<String, dynamic>.from(m['settings'] as Map)),
    );
  }
}

class Member {
  const Member({required this.uid, required this.role, required this.displayName, this.characterId});

  final String uid;
  final MemberRole role;
  final String displayName;
  final String? characterId;

  bool get isDm => role == MemberRole.dm;

  factory Member.fromDoc(DocumentSnapshot<Json> d) {
    final m = d.data()!;
    return Member(
      uid: d.id,
      role: m['role'] == 'dm' ? MemberRole.dm : MemberRole.player,
      displayName: m['displayName'] as String? ?? '?',
      characterId: m['characterId'] as String?,
    );
  }
}

/// Entrada del índice personal `users/{uid}/rooms/{roomId}`.
class MyRoomEntry {
  const MyRoomEntry({required this.roomId, required this.name, required this.role});

  final String roomId;
  final String name;
  final MemberRole role;

  factory MyRoomEntry.fromDoc(DocumentSnapshot<Json> d) {
    final m = d.data()!;
    return MyRoomEntry(
      roomId: d.id,
      name: m['name'] as String? ?? d.id,
      role: m['role'] == 'dm' ? MemberRole.dm : MemberRole.player,
    );
  }
}

// ---------- personaje ----------

SkillDto skillFromMap(Json m) => SkillDto(
  name: m['name'] as String,
  level: (m['level'] as num).toInt(),
  permanent: m['permanent'] as bool? ?? false,
  derivedFrom: m['derivedFrom'] as String?,
);

Json skillToMap(SkillDto s) => {
  'name': s.name,
  'level': s.level,
  'permanent': s.permanent,
  'derivedFrom': s.derivedFrom,
};

class CharacterDoc {
  const CharacterDoc({required this.id, required this.ownerUid, required this.sheet, this.lastAppliedRollId});

  final String id;
  final String ownerUid;
  final CharacterDto sheet;
  final String? lastAppliedRollId;

  factory CharacterDoc.fromDoc(DocumentSnapshot<Json> d) {
    final m = d.data()!;
    return CharacterDoc(
      id: d.id,
      ownerUid: m['ownerUid'] as String,
      lastAppliedRollId: m['lastAppliedRollId'] as String?,
      sheet: CharacterDto(
        name: m['name'] as String,
        description: m['description'] as String? ?? '',
        notes: m['notes'] as String? ?? '',
        xp: (m['xp'] as num).toInt(),
        skills: [for (final s in (m['skills'] as List)) skillFromMap(Map<String, dynamic>.from(s as Map))],
      ),
    );
  }
}

Json characterToMap(String ownerUid, CharacterDto c) => {
  'ownerUid': ownerUid,
  'name': c.name,
  'description': c.description,
  'notes': c.notes,
  'xp': c.xp,
  'skills': c.skills.map(skillToMap).toList(),
  'lastAppliedRollId': null,
  'updatedAt': FieldValue.serverTimestamp(),
};

// ---------- objetos ----------

class ItemDoc {
  const ItemDoc({
    required this.id,
    required this.name,
    required this.description,
    required this.quantity,
    this.value,
    this.catalogItemId,
  });

  final String id;
  final String name;
  final String description;
  final int? value;
  final int quantity;
  final String? catalogItemId;

  factory ItemDoc.fromDoc(DocumentSnapshot<Json> d) {
    final m = d.data()!;
    return ItemDoc(
      id: d.id,
      name: m['name'] as String,
      description: m['description'] as String? ?? '',
      value: (m['value'] as num?)?.toInt(),
      quantity: (m['quantity'] as num).toInt(),
      catalogItemId: m['catalogItemId'] as String?,
    );
  }

  ItemDto toDto() => ItemDto(name: name, description: description, value: value, quantity: quantity);
}

Json itemToMap(ItemDto i) => {
  'name': i.name.trim(),
  'description': i.description.trim(),
  'value': i.value,
  'quantity': i.quantity,
};

// ---------- tiradas ----------

Uint8List _dice(Object? v) => Uint8List.fromList([for (final d in v as List) (d as num).toInt()]);

Json? _rollMap(Uint8List? dice) {
  if (dice == null) return null;
  return {'dados': dice.toList(), 'total': dice.fold<int>(0, (a, b) => a + b)};
}

SkillRefDto? _skillRef(Object? m) {
  if (m == null) return null;
  final j = m as Map;
  return SkillRefDto(
    index: (j['skillIndex'] as num).toInt(),
    name: j['skillName'] as String,
    level: (j['skillLevel'] as num).toInt(),
  );
}

RollResultDto? _result(Object? v) => switch (v) {
  'exito' => RollResultDto.exito,
  'fallo' => RollResultDto.fallo,
  'narrado' => RollResultDto.narrado,
  _ => null,
};

String? _resultId(RollResultDto? r) => switch (r) {
  RollResultDto.exito => 'exito',
  RollResultDto.fallo => 'fallo',
  RollResultDto.narrado => 'narrado',
  null => null,
};

class RollDoc {
  const RollDoc({
    required this.id,
    required this.characterId,
    required this.record,
    required this.rawHistory,
    this.createdAt,
  });

  final String id;
  final String characterId;
  final RollRecordDto record;

  /// Historial tal como está en Firestore (con uid en `por`).
  final List<Json> rawHistory;
  final DateTime? createdAt;

  RollStateDto get state => record.state;

  /// Uid de quien hizo cada paso del historial (misma posición que `record.history`).
  List<String> get historyUids => [for (final h in rawHistory) h['por'] as String? ?? ''];

  factory RollDoc.fromDoc(DocumentSnapshot<Json> d, {required String dmUid}) =>
      RollDoc.fromMap(d.id, d.data()!, dmUid: dmUid);

  factory RollDoc.fromMap(String id, Json m, {required String dmUid}) {
    final characterId = m['characterId'] as String;
    final rawHistory = [for (final h in (m['historial'] as List? ?? [])) Map<String, dynamic>.from(h as Map)];

    ActorDto actorOf(String? uid) => uid == dmUid
        ? ActorDto.dm
        : uid == characterId
        ? ActorDto.owner
        : ActorDto.other;

    final avance = m['avance'] == null ? null : Map<String, dynamic>.from(m['avance'] as Map);
    final advance = switch (avance?['estado']) {
      'pendiente' => AdvanceStateDto.pendiente,
      'aplicado' => AdvanceStateDto.aplicado,
      'no_aplica' => AdvanceStateDto.noAplica,
      _ => null,
    };

    return RollDoc(
      id: id,
      characterId: characterId,
      rawHistory: rawHistory,
      createdAt: m['createdAt'] is Timestamp ? (m['createdAt'] as Timestamp).toDate() : null,
      record: RollRecordDto(
        state: parseRollState(id: m['estado'] as String)!,
        action: m['accion'] as String,
        skill: SkillRefDto(
          index: (m['skillIndex'] as num).toInt(),
          name: m['skillName'] as String,
          level: (m['skillLevel'] as num).toInt(),
        ),
        counterOffer: _skillRef(m['contraoferta']),
        dmNote: m['notaDm'] as String?,
        opposition: m['oposicion'] == null ? null : _dice((m['oposicion'] as Map)['dados']),
        playerRoll: m['tirada'] == null ? null : _dice((m['tirada'] as Map)['dados']),
        result: _result(m['outcome']),
        narration: m['narracion'] as String?,
        tieWinner: tieWinnerFromId(m['tieWinner']),
        advance: advance,
        applied: advance == AdvanceStateDto.aplicado
            ? AppliedAdvanceDto(
                xpGained: (avance!['xpGained'] as num).toInt(),
                xpSpent: (avance['xpSpent'] as num).toInt(),
                newSkill: avance['newSkill'] == null
                    ? null
                    : skillFromMap(Map<String, dynamic>.from(avance['newSkill'] as Map)),
                replacedIndex: (avance['replacedSkillIndex'] as num?)?.toInt(),
              )
            : null,
        history: [
          for (final h in rawHistory)
            HistoryEntryDto(
              from: h['de'] == null ? null : parseRollState(id: h['de'] as String),
              to: parseRollState(id: h['a'] as String)!,
              by: actorOf(h['por'] as String?),
            ),
        ],
      ),
    );
  }
}

Json? _advanceMap(RollRecordDto r) => switch (r.advance) {
  null => null,
  AdvanceStateDto.pendiente => {'estado': 'pendiente'},
  AdvanceStateDto.noAplica => {'estado': 'no_aplica'},
  AdvanceStateDto.aplicado => {
    'estado': 'aplicado',
    'xpGained': r.applied!.xpGained,
    'xpSpent': r.applied!.xpSpent,
    'newSkill': r.applied!.newSkill == null ? null : skillToMap(r.applied!.newSkill!),
    'replacedSkillIndex': r.applied!.replacedIndex,
  },
};

/// Campos mutables de una tirada. Las entradas nuevas del historial se firman con `uid`.
Json rollFields(RollRecordDto r, {required List<Json> previousHistory, required String uid}) => {
  'estado': rollStateId(state: r.state),
  'accion': r.action,
  'skillIndex': r.skill.index,
  'skillName': r.skill.name,
  'skillLevel': r.skill.level,
  'contraoferta': r.counterOffer == null
      ? null
      : {'skillIndex': r.counterOffer!.index, 'skillName': r.counterOffer!.name, 'skillLevel': r.counterOffer!.level},
  'notaDm': r.dmNote,
  'oposicion': _rollMap(r.opposition),
  'tirada': _rollMap(r.playerRoll),
  'outcome': _resultId(r.result),
  'narracion': r.narration,
  'tieWinner': r.tieWinner == null ? null : tieWinnerId(r.tieWinner!),
  'avance': _advanceMap(r),
  'historial': [
    ...previousHistory,
    for (final h in r.history.skip(previousHistory.length))
      {'de': h.from == null ? null : rollStateId(state: h.from!), 'a': rollStateId(state: h.to), 'por': uid},
  ],
  'updatedAt': FieldValue.serverTimestamp(),
};
