use thiserror::Error;

use crate::roll_flow::{Actor, FlowActionKind, RollState};

/// Errores del motor de reglas.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum EngineError {
    #[error("el nombre del personaje es obligatorio (1-{max} caracteres)")]
    InvalidCharacterName { max: usize },

    #[error("el nombre de la habilidad es obligatorio (1-{max} caracteres)")]
    InvalidSkillName { max: usize },

    #[error("la primera habilidad debe ser \"Do Anything 1\" permanente")]
    MissingBaseSkill,

    #[error("solo \"Do Anything 1\" puede ser permanente")]
    UnexpectedPermanentSkill,

    #[error("hay más habilidades ({used}) que slots disponibles ({capacity})")]
    TooManySkills { used: usize, capacity: usize },

    #[error("todos los slots de habilidad están ocupados")]
    SlotsFull,

    #[error("\"Do Anything 1\" no se puede reemplazar")]
    CannotReplacePermanent,

    #[error("índice de habilidad fuera de rango: {0}")]
    SkillIndexOutOfRange(usize),

    #[error("ya existe una habilidad llamada \"{0}\"")]
    DuplicateSkillName(String),

    #[error("nivel de habilidad inválido: {0}")]
    InvalidSkillLevel(u8),

    #[error("esta tirada no permite avanzar")]
    NotEligible,

    #[error("XP insuficiente: se necesitan {needed} y hay {available}")]
    InsufficientXp { needed: u32, available: u32 },

    #[error("número de dados inválido: {got} (debe estar entre 1 y {max})")]
    DiceCountOutOfRange { got: usize, max: u8 },

    #[error("valor de dado inválido: {0}")]
    InvalidDieValue(u8),

    #[error("se esperaban {expected} dados y se tiraron {got}")]
    DiceCountMismatch { expected: usize, got: usize },

    #[error("la acción declarada no puede estar vacía")]
    EmptyAction,

    #[error("la narración no puede estar vacía")]
    EmptyNarration,

    #[error("el nombre del objeto es obligatorio (1-{max} caracteres)")]
    InvalidItemName { max: usize },

    #[error("{actor:?} no puede hacer {action:?} en estado {state:?}")]
    TransitionNotAllowed {
        state: RollState,
        action: FlowActionKind,
        actor: Actor,
    },

    #[error("el avance de esta tirada ya fue aplicado o no aplica")]
    AdvancementNotPending,

    #[error("ajustes de sala inválidos: {0}")]
    InvalidSettings(&'static str),
}
