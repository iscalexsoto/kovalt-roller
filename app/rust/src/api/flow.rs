//! Máquina de estados de tiradas expuesta a Dart.
//!
//! Dart lee el documento de Firestore, lo convierte a `RollRecordDto`, llama a
//! `roll_transition` y escribe el resultado. Así la lógica del flujo vive solo
//! en `r4s_engine::roll_flow` (y su espejo en las Security Rules).

use anyhow::{Result, anyhow};
use flutter_rust_bridge::frb;
use r4s_engine as engine;
use r4s_engine::MAX_DICE_LIMIT;

use super::engine::{SkillDto, TieWinnerDto, dice_roll, engine_err};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RollStateDto {
    Declarada,
    Aprobada,
    Contraoferta,
    Rechazada,
    SinTirada,
    Oposicion,
    Tirada,
    Resuelta,
    Retirada,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActorDto {
    Dm,
    Owner,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RollResultDto {
    Exito,
    Fallo,
    Narrado,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdvanceStateDto {
    Pendiente,
    Aplicado,
    NoAplica,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlowActionKindDto {
    Approve,
    CounterOffer,
    Reject,
    Narrate,
    AcceptCounterOffer,
    Redeclare,
    Withdraw,
    RollOpposition,
    RollPlayer,
    Resolve,
    ApplyAdvance,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillRefDto {
    pub index: u32,
    pub name: String,
    pub level: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppliedAdvanceDto {
    pub xp_gained: u32,
    pub xp_spent: u32,
    pub new_skill: Option<SkillDto>,
    pub replaced_index: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryEntryDto {
    pub from: Option<RollStateDto>,
    pub to: RollStateDto,
    pub by: ActorDto,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RollRecordDto {
    pub state: RollStateDto,
    pub action: String,
    pub skill: SkillRefDto,
    pub counter_offer: Option<SkillRefDto>,
    pub dm_note: Option<String>,
    pub opposition: Option<Vec<u8>>,
    pub player_roll: Option<Vec<u8>>,
    pub result: Option<RollResultDto>,
    pub narration: Option<String>,
    pub tie_winner: Option<TieWinnerDto>,
    pub advance: Option<AdvanceStateDto>,
    pub applied: Option<AppliedAdvanceDto>,
    pub history: Vec<HistoryEntryDto>,
}

/// Acción del flujo. Solo se usan los campos que correspondan a `kind`:
/// - `CounterOffer`: `skill`, `text` (nota)
/// - `Reject`: `text` (nota)
/// - `Narrate`: `text` (narración)
/// - `Redeclare`: `text` (acción), `skill`
/// - `RollOpposition` / `RollPlayer`: `dice`
/// - `Resolve`: `tie_winner`
/// - `ApplyAdvance`: `applied`
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlowActionDto {
    pub kind: FlowActionKindDto,
    pub skill: Option<SkillRefDto>,
    pub text: Option<String>,
    pub dice: Option<Vec<u8>>,
    pub tie_winner: Option<TieWinnerDto>,
    pub applied: Option<AppliedAdvanceDto>,
}

// ---------- conversiones ----------

macro_rules! mirror_enum {
    ($dto:ident, $eng:path, [$($v:ident),* $(,)?]) => {
        impl From<$dto> for $eng {
            fn from(v: $dto) -> Self {
                match v { $($dto::$v => <$eng>::$v,)* }
            }
        }
        impl From<$eng> for $dto {
            fn from(v: $eng) -> Self {
                match v { $(<$eng>::$v => $dto::$v,)* }
            }
        }
    };
}

mirror_enum!(
    RollStateDto,
    engine::RollState,
    [
        Declarada,
        Aprobada,
        Contraoferta,
        Rechazada,
        SinTirada,
        Oposicion,
        Tirada,
        Resuelta,
        Retirada
    ]
);
mirror_enum!(ActorDto, engine::Actor, [Dm, Owner, Other]);
mirror_enum!(RollResultDto, engine::RollResult, [Exito, Fallo, Narrado]);
mirror_enum!(AdvanceStateDto, engine::AdvanceState, [Pendiente, Aplicado, NoAplica]);
mirror_enum!(
    FlowActionKindDto,
    engine::FlowActionKind,
    [
        Approve,
        CounterOffer,
        Reject,
        Narrate,
        AcceptCounterOffer,
        Redeclare,
        Withdraw,
        RollOpposition,
        RollPlayer,
        Resolve,
        ApplyAdvance
    ]
);

impl From<SkillRefDto> for engine::SkillRef {
    fn from(s: SkillRefDto) -> Self {
        Self {
            index: s.index as usize,
            name: s.name,
            level: s.level,
        }
    }
}

impl From<engine::SkillRef> for SkillRefDto {
    fn from(s: engine::SkillRef) -> Self {
        Self {
            index: s.index as u32,
            name: s.name,
            level: s.level,
        }
    }
}

impl From<AppliedAdvanceDto> for engine::AppliedAdvance {
    fn from(a: AppliedAdvanceDto) -> Self {
        Self {
            xp_gained: a.xp_gained,
            xp_spent: a.xp_spent,
            new_skill: a.new_skill.map(Into::into),
            replaced_index: a.replaced_index.map(|i| i as usize),
        }
    }
}

impl From<engine::AppliedAdvance> for AppliedAdvanceDto {
    fn from(a: engine::AppliedAdvance) -> Self {
        Self {
            xp_gained: a.xp_gained,
            xp_spent: a.xp_spent,
            new_skill: a.new_skill.map(Into::into),
            replaced_index: a.replaced_index.map(|i| i as u32),
        }
    }
}

fn record_to_engine(r: RollRecordDto) -> Result<engine::RollRecord> {
    Ok(engine::RollRecord {
        state: r.state.into(),
        action: r.action,
        skill: r.skill.into(),
        counter_offer: r.counter_offer.map(Into::into),
        dm_note: r.dm_note,
        opposition: r.opposition.map(|d| dice_roll(d, MAX_DICE_LIMIT)).transpose()?,
        player_roll: r.player_roll.map(|d| dice_roll(d, MAX_DICE_LIMIT)).transpose()?,
        result: r.result.map(Into::into),
        narration: r.narration,
        tie_winner: r.tie_winner.map(Into::into),
        advance: r.advance.map(Into::into),
        applied: r.applied.map(Into::into),
        history: r
            .history
            .into_iter()
            .map(|h| engine::roll_flow::HistoryEntry {
                from: h.from.map(Into::into),
                to: h.to.into(),
                by: h.by.into(),
            })
            .collect(),
    })
}

fn record_from_engine(r: engine::RollRecord) -> RollRecordDto {
    RollRecordDto {
        state: r.state.into(),
        action: r.action,
        skill: r.skill.into(),
        counter_offer: r.counter_offer.map(Into::into),
        dm_note: r.dm_note,
        opposition: r.opposition.map(|d| d.dice().to_vec()),
        player_roll: r.player_roll.map(|d| d.dice().to_vec()),
        result: r.result.map(Into::into),
        narration: r.narration,
        tie_winner: r.tie_winner.map(Into::into),
        advance: r.advance.map(Into::into),
        applied: r.applied.map(Into::into),
        history: r
            .history
            .into_iter()
            .map(|h| HistoryEntryDto {
                from: h.from.map(Into::into),
                to: h.to.into(),
                by: h.by.into(),
            })
            .collect(),
    }
}

fn missing(field: &str, kind: FlowActionKindDto) -> anyhow::Error {
    anyhow!("falta `{field}` para la acción {kind:?}")
}

fn action_to_engine(a: FlowActionDto, max_dice: u8) -> Result<engine::FlowAction> {
    use engine::FlowAction as F;
    let kind = a.kind;
    Ok(match kind {
        FlowActionKindDto::Approve => F::Approve,
        FlowActionKindDto::CounterOffer => F::CounterOffer {
            skill: a.skill.ok_or_else(|| missing("skill", kind))?.into(),
            note: a.text,
        },
        FlowActionKindDto::Reject => F::Reject { note: a.text },
        FlowActionKindDto::Narrate => F::Narrate {
            narration: a.text.unwrap_or_default(),
        },
        FlowActionKindDto::AcceptCounterOffer => F::AcceptCounterOffer,
        FlowActionKindDto::Redeclare => F::Redeclare {
            action: a.text.unwrap_or_default(),
            skill: a.skill.ok_or_else(|| missing("skill", kind))?.into(),
        },
        FlowActionKindDto::Withdraw => F::Withdraw,
        FlowActionKindDto::RollOpposition => F::RollOpposition {
            dice: dice_roll(a.dice.ok_or_else(|| missing("dice", kind))?, max_dice)?,
        },
        FlowActionKindDto::RollPlayer => F::RollPlayer {
            dice: dice_roll(a.dice.ok_or_else(|| missing("dice", kind))?, max_dice)?,
        },
        FlowActionKindDto::Resolve => F::Resolve {
            tie_winner: a.tie_winner.ok_or_else(|| missing("tie_winner", kind))?.into(),
        },
        FlowActionKindDto::ApplyAdvance => F::ApplyAdvance(a.applied.ok_or_else(|| missing("applied", kind))?.into()),
    })
}

// ---------- API ----------

/// Nueva tirada en estado `declarada`.
#[frb(sync)]
pub fn declare_roll(action: String, skill: SkillRefDto) -> Result<RollRecordDto> {
    engine::declare(&action, skill.into())
        .map(record_from_engine)
        .map_err(engine_err)
}

/// Aplica una acción y devuelve la tirada resultante.
#[frb(sync)]
pub fn roll_transition(
    record: RollRecordDto,
    action: FlowActionDto,
    actor: ActorDto,
    max_dice: u8,
) -> Result<RollRecordDto> {
    let record = record_to_engine(record)?;
    let action = action_to_engine(action, max_dice)?;
    engine::transition(&record, action, actor.into())
        .map(record_from_engine)
        .map_err(engine_err)
}

/// Acciones disponibles para `actor` en el estado actual de la tirada.
#[frb(sync)]
pub fn allowed_roll_actions(
    state: RollStateDto,
    advance: Option<AdvanceStateDto>,
    actor: ActorDto,
) -> Vec<FlowActionKindDto> {
    engine::FlowActionKind::ALL
        .into_iter()
        .filter(|&k| engine::permits(state.into(), k, actor.into()))
        .filter(|&k| k != engine::FlowActionKind::ApplyAdvance || advance == Some(AdvanceStateDto::Pendiente))
        .map(Into::into)
        .collect()
}

/// Identificador del estado tal como se guarda en Firestore.
#[frb(sync)]
pub fn roll_state_id(state: RollStateDto) -> String {
    engine::RollState::from(state).as_str().to_string()
}

#[frb(sync)]
pub fn parse_roll_state(id: String) -> Option<RollStateDto> {
    engine::RollState::parse(&id).map(Into::into)
}
