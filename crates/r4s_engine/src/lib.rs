//! Motor de reglas de Roll For Shoes para Kovalt Roller.
//!
//! Lógica pura, sin I/O: la app (Flutter vía flutter_rust_bridge) persiste
//! el estado en Firebase y usa este crate para tirar, validar y avanzar.

pub mod advancement;
pub mod character;
pub mod dice;
pub mod error;
pub mod inventory;
pub mod resolve;
pub mod roll_flow;
pub mod types;

pub use advancement::{AdvancementChoice, AdvancementOption, ApplyResult, SlotChoice, advancement_option, apply_roll};
pub use character::{new_character, slot_usage, slots_full, validate_character};
pub use dice::{DiceRoll, DiceSource, FixedDice, SeededDice, roll};
pub use error::EngineError;
pub use inventory::Item;
pub use resolve::{Outcome, RollOutcome, resolve};
pub use roll_flow::{
    Actor, AdvanceState, AppliedAdvance, FlowAction, FlowActionKind, RollRecord, RollResult, RollState, SkillRef,
    allowed_actions, declare, permits, transition,
};
pub use types::{BASE_SKILL_NAME, Character, MAX_DICE_LIMIT, RoomSettings, Skill, TieWinner};
