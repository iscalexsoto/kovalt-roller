//! Máquina de estados de una tirada:
//!
//! ```text
//! declarada ──(DM)──► aprobada ──(DM)──► oposicion ──(jugador)──► tirada ──► resuelta
//!     ├──(DM)──► contraoferta ──(jugador acepta / edita)──► declarada
//!     ├──(DM)──► rechazada ────(jugador edita)────────────► declarada
//!     ├──(DM)──► sin_tirada ──► resuelta (narración directa)
//!     └──(jugador)──► retirada (también desde contraoferta o rechazada)
//! ```

use crate::dice::DiceRoll;
use crate::error::EngineError;
use crate::resolve::{Outcome, resolve};
use crate::types::{Character, Skill, TieWinner};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RollState {
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

impl RollState {
    pub const ALL: [RollState; 9] = [
        RollState::Declarada,
        RollState::Aprobada,
        RollState::Contraoferta,
        RollState::Rechazada,
        RollState::SinTirada,
        RollState::Oposicion,
        RollState::Tirada,
        RollState::Resuelta,
        RollState::Retirada,
    ];

    /// Identificador que se guarda en Firestore.
    pub fn as_str(self) -> &'static str {
        match self {
            RollState::Declarada => "declarada",
            RollState::Aprobada => "aprobada",
            RollState::Contraoferta => "contraoferta",
            RollState::Rechazada => "rechazada",
            RollState::SinTirada => "sin_tirada",
            RollState::Oposicion => "oposicion",
            RollState::Tirada => "tirada",
            RollState::Resuelta => "resuelta",
            RollState::Retirada => "retirada",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|st| st.as_str() == s)
    }

    pub fn is_terminal(self) -> bool {
        matches!(self, RollState::Resuelta | RollState::Retirada)
    }
}

/// Quién intenta la transición, relativo a la tirada.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Actor {
    Dm,
    /// Dueño del personaje que declaró la acción.
    Owner,
    /// Cualquier otro miembro de la sala.
    Other,
}

/// Referencia a una habilidad del personaje en el momento de declarar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillRef {
    pub index: usize,
    pub name: String,
    pub level: u8,
}

impl SkillRef {
    pub fn from_character(character: &Character, index: usize) -> Result<Self, EngineError> {
        let skill: &Skill = character
            .skills
            .get(index)
            .ok_or(EngineError::SkillIndexOutOfRange(index))?;
        Ok(Self {
            index,
            name: skill.name.clone(),
            level: skill.level,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RollResult {
    Exito,
    Fallo,
    Narrado,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdvanceState {
    Pendiente,
    Aplicado,
    NoAplica,
}

/// Lo que se aplicó a la hoja al cerrar la tirada.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AppliedAdvance {
    pub xp_gained: u32,
    pub xp_spent: u32,
    pub new_skill: Option<Skill>,
    pub replaced_index: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryEntry {
    pub from: Option<RollState>,
    pub to: RollState,
    pub by: Actor,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RollRecord {
    pub state: RollState,
    pub action: String,
    pub skill: SkillRef,
    pub counter_offer: Option<SkillRef>,
    pub dm_note: Option<String>,
    pub opposition: Option<DiceRoll>,
    pub player_roll: Option<DiceRoll>,
    pub result: Option<RollResult>,
    pub narration: Option<String>,
    pub tie_winner: Option<TieWinner>,
    pub advance: Option<AdvanceState>,
    pub applied: Option<AppliedAdvance>,
    pub history: Vec<HistoryEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FlowAction {
    Approve,
    CounterOffer { skill: SkillRef, note: Option<String> },
    Reject { note: Option<String> },
    Narrate { narration: String },
    AcceptCounterOffer,
    Redeclare { action: String, skill: SkillRef },
    Withdraw,
    RollOpposition { dice: DiceRoll },
    RollPlayer { dice: DiceRoll },
    Resolve { tie_winner: TieWinner },
    ApplyAdvance(AppliedAdvance),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FlowActionKind {
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

impl FlowActionKind {
    pub const ALL: [FlowActionKind; 11] = [
        FlowActionKind::Approve,
        FlowActionKind::CounterOffer,
        FlowActionKind::Reject,
        FlowActionKind::Narrate,
        FlowActionKind::AcceptCounterOffer,
        FlowActionKind::Redeclare,
        FlowActionKind::Withdraw,
        FlowActionKind::RollOpposition,
        FlowActionKind::RollPlayer,
        FlowActionKind::Resolve,
        FlowActionKind::ApplyAdvance,
    ];
}

impl FlowAction {
    pub fn kind(&self) -> FlowActionKind {
        match self {
            FlowAction::Approve => FlowActionKind::Approve,
            FlowAction::CounterOffer { .. } => FlowActionKind::CounterOffer,
            FlowAction::Reject { .. } => FlowActionKind::Reject,
            FlowAction::Narrate { .. } => FlowActionKind::Narrate,
            FlowAction::AcceptCounterOffer => FlowActionKind::AcceptCounterOffer,
            FlowAction::Redeclare { .. } => FlowActionKind::Redeclare,
            FlowAction::Withdraw => FlowActionKind::Withdraw,
            FlowAction::RollOpposition { .. } => FlowActionKind::RollOpposition,
            FlowAction::RollPlayer { .. } => FlowActionKind::RollPlayer,
            FlowAction::Resolve { .. } => FlowActionKind::Resolve,
            FlowAction::ApplyAdvance(_) => FlowActionKind::ApplyAdvance,
        }
    }
}

fn clean_text(s: &str) -> String {
    s.trim().to_string()
}

fn clean_note(note: Option<String>) -> Option<String> {
    note.map(|n| clean_text(&n)).filter(|n| !n.is_empty())
}

/// Tabla de permisos: estado actual × acción × actor.
pub fn permits(state: RollState, kind: FlowActionKind, actor: Actor) -> bool {
    use Actor::*;
    use FlowActionKind as K;
    use RollState as S;
    match (state, kind) {
        (S::Declarada, K::Approve | K::CounterOffer | K::Reject | K::Narrate) => actor == Dm,
        (S::Contraoferta, K::AcceptCounterOffer) => actor == Owner,
        (S::Declarada | S::Contraoferta | S::Rechazada, K::Redeclare | K::Withdraw) => actor == Owner,
        (S::Aprobada, K::RollOpposition) => actor == Dm,
        (S::Oposicion, K::RollPlayer) => actor == Owner,
        (S::Tirada, K::Resolve) => matches!(actor, Owner | Dm),
        (S::Resuelta, K::ApplyAdvance) => matches!(actor, Owner | Dm),
        _ => false,
    }
}

/// Acciones que `actor` puede hacer ahora mismo sobre la tirada.
pub fn allowed_actions(record: &RollRecord, actor: Actor) -> Vec<FlowActionKind> {
    FlowActionKind::ALL
        .into_iter()
        .filter(|&k| permits(record.state, k, actor))
        .filter(|&k| k != FlowActionKind::ApplyAdvance || record.advance == Some(AdvanceState::Pendiente))
        .collect()
}

/// Crea una tirada en estado `declarada`.
pub fn declare(action: &str, skill: SkillRef) -> Result<RollRecord, EngineError> {
    let action = clean_text(action);
    if action.is_empty() {
        return Err(EngineError::EmptyAction);
    }
    Ok(RollRecord {
        state: RollState::Declarada,
        action,
        skill,
        counter_offer: None,
        dm_note: None,
        opposition: None,
        player_roll: None,
        result: None,
        narration: None,
        tie_winner: None,
        advance: None,
        applied: None,
        history: vec![HistoryEntry {
            from: None,
            to: RollState::Declarada,
            by: Actor::Owner,
        }],
    })
}

/// Aplica una acción a la tirada y devuelve la tirada nueva.
pub fn transition(record: &RollRecord, action: FlowAction, actor: Actor) -> Result<RollRecord, EngineError> {
    let kind = action.kind();
    if !permits(record.state, kind, actor) {
        return Err(EngineError::TransitionNotAllowed {
            state: record.state,
            action: kind,
            actor,
        });
    }

    let mut next = record.clone();
    let goto = |next: &mut RollRecord, to: RollState| {
        next.history.push(HistoryEntry {
            from: Some(next.state),
            to,
            by: actor,
        });
        next.state = to;
    };

    match action {
        FlowAction::Approve => goto(&mut next, RollState::Aprobada),
        FlowAction::CounterOffer { skill, note } => {
            next.counter_offer = Some(skill);
            next.dm_note = clean_note(note);
            goto(&mut next, RollState::Contraoferta);
        }
        FlowAction::Reject { note } => {
            next.dm_note = clean_note(note);
            goto(&mut next, RollState::Rechazada);
        }
        FlowAction::Narrate { narration } => {
            let narration = clean_text(&narration);
            if narration.is_empty() {
                return Err(EngineError::EmptyNarration);
            }
            next.narration = Some(narration);
            next.result = Some(RollResult::Narrado);
            next.advance = Some(AdvanceState::NoAplica);
            goto(&mut next, RollState::SinTirada);
            goto(&mut next, RollState::Resuelta);
        }
        FlowAction::AcceptCounterOffer => {
            next.skill = next.counter_offer.take().ok_or(EngineError::TransitionNotAllowed {
                state: record.state,
                action: kind,
                actor,
            })?;
            next.dm_note = None;
            goto(&mut next, RollState::Declarada);
        }
        FlowAction::Redeclare { action, skill } => {
            let action = clean_text(&action);
            if action.is_empty() {
                return Err(EngineError::EmptyAction);
            }
            next.action = action;
            next.skill = skill;
            next.counter_offer = None;
            next.dm_note = None;
            goto(&mut next, RollState::Declarada);
        }
        FlowAction::Withdraw => goto(&mut next, RollState::Retirada),
        FlowAction::RollOpposition { dice } => {
            next.opposition = Some(dice);
            goto(&mut next, RollState::Oposicion);
        }
        FlowAction::RollPlayer { dice } => {
            let expected = next.skill.level as usize;
            if dice.len() != expected {
                return Err(EngineError::DiceCountMismatch {
                    expected,
                    got: dice.len(),
                });
            }
            next.player_roll = Some(dice);
            goto(&mut next, RollState::Tirada);
        }
        FlowAction::Resolve { tie_winner } => {
            let (Some(player), Some(opposition)) = (&next.player_roll, &next.opposition) else {
                unreachable!("tirada y oposición existen en estado Tirada");
            };
            let outcome = resolve(player, opposition, tie_winner);
            next.result = Some(match outcome.outcome {
                Outcome::Success => RollResult::Exito,
                Outcome::Failure => RollResult::Fallo,
            });
            next.tie_winner = Some(tie_winner);
            next.advance = Some(AdvanceState::Pendiente);
            goto(&mut next, RollState::Resuelta);
        }
        FlowAction::ApplyAdvance(applied) => {
            if next.advance != Some(AdvanceState::Pendiente) {
                return Err(EngineError::AdvancementNotPending);
            }
            let expected_xp = u32::from(next.result == Some(RollResult::Fallo));
            if applied.xp_gained != expected_xp {
                return Err(EngineError::NotEligible);
            }
            if applied.new_skill.is_none() && (applied.xp_spent != 0 || applied.replaced_index.is_some()) {
                return Err(EngineError::NotEligible);
            }
            next.applied = Some(applied);
            next.advance = Some(AdvanceState::Aplicado);
        }
    }

    Ok(next)
}
