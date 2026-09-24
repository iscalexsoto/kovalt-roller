use crate::character::{find_duplicate, normalize_skill_name, slots_full};
use crate::dice::DiceRoll;
use crate::error::EngineError;
use crate::resolve::RollOutcome;
use crate::types::{Character, RoomSettings, Skill};

/// Posibilidad de ganar una habilidad nueva tras una tirada.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdvancementOption {
    pub source_skill_index: usize,
    pub source_label: String,
    pub new_level: u8,
    /// Todos los dados salieron 6: avance gratis.
    pub natural: bool,
    /// XP necesario: 1 por cada dado que no sea 6.
    pub xp_cost: u32,
    /// XP que se puede gastar en esta tirada.
    pub xp_available: u32,
    /// Hay que elegir qué habilidad reemplazar (o descartar la nueva).
    pub slots_full: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SlotChoice {
    /// Ocupa un slot libre.
    Append,
    /// Reemplaza la habilidad en ese índice (nunca 0).
    Replace(usize),
    /// Renuncia a la habilidad nueva.
    Discard,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdvancementChoice {
    pub new_skill_name: String,
    pub slot: SlotChoice,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyResult {
    pub character: Character,
    pub xp_gained: u32,
    pub xp_spent: u32,
    pub new_skill: Option<Skill>,
    /// Índice y habilidad reemplazada.
    pub replaced: Option<(usize, Skill)>,
}

fn source_skill(character: &Character, skill_index: usize) -> Result<&Skill, EngineError> {
    character
        .skills
        .get(skill_index)
        .ok_or(EngineError::SkillIndexOutOfRange(skill_index))
}

fn check_roll_matches(skill: &Skill, roll: &DiceRoll) -> Result<(), EngineError> {
    if roll.len() != skill.level as usize {
        return Err(EngineError::DiceCountMismatch {
            expected: skill.level as usize,
            got: roll.len(),
        });
    }
    Ok(())
}

fn xp_available(character: &Character, settings: &RoomSettings, outcome: &RollOutcome) -> u32 {
    if settings.xp_same_roll {
        character.xp + outcome.xp_gained
    } else {
        character.xp
    }
}

/// Calcula si la tirada permite ganar una habilidad nueva.
///
/// Devuelve `None` si no hay avance posible: no todos son 6 y el XP no alcanza,
/// o la habilidad ya está en el nivel máximo.
pub fn advancement_option(
    character: &Character,
    settings: &RoomSettings,
    roll: &DiceRoll,
    outcome: &RollOutcome,
    skill_index: usize,
) -> Result<Option<AdvancementOption>, EngineError> {
    let skill = source_skill(character, skill_index)?;
    check_roll_matches(skill, roll)?;

    if skill.level >= settings.max_dice {
        return Ok(None);
    }

    let xp_cost = roll.non_sixes();
    let available = xp_available(character, settings, outcome);
    if xp_cost > available {
        return Ok(None);
    }

    Ok(Some(AdvancementOption {
        source_skill_index: skill_index,
        source_label: skill.label(),
        new_level: skill.level + 1,
        natural: xp_cost == 0,
        xp_cost,
        xp_available: available,
        slots_full: slots_full(character, settings),
    }))
}

/// Aplica el resultado de una tirada resuelta a la hoja: XP por fallo y,
/// opcionalmente, la habilidad nueva elegida por el jugador.
pub fn apply_roll(
    character: &Character,
    settings: &RoomSettings,
    roll: &DiceRoll,
    outcome: &RollOutcome,
    skill_index: usize,
    choice: Option<&AdvancementChoice>,
) -> Result<ApplyResult, EngineError> {
    let skill = source_skill(character, skill_index)?;
    check_roll_matches(skill, roll)?;

    let mut updated = character.clone();
    updated.xp = character.xp + outcome.xp_gained;

    let choice = match choice {
        Some(c) if c.slot != SlotChoice::Discard => c,
        _ => {
            return Ok(ApplyResult {
                character: updated,
                xp_gained: outcome.xp_gained,
                xp_spent: 0,
                new_skill: None,
                replaced: None,
            });
        }
    };

    let option =
        advancement_option(character, settings, roll, outcome, skill_index)?.ok_or(EngineError::NotEligible)?;

    let name = normalize_skill_name(&choice.new_skill_name)?;
    let new_skill = Skill {
        name,
        level: option.new_level,
        permanent: false,
        derived_from: Some(option.source_label.clone()),
    };

    let mut replaced = None;
    match choice.slot {
        SlotChoice::Append => {
            if option.slots_full {
                return Err(EngineError::SlotsFull);
            }
            if find_duplicate(&updated.skills, &new_skill.name, None) {
                return Err(EngineError::DuplicateSkillName(new_skill.name));
            }
            updated.skills.push(new_skill.clone());
        }
        SlotChoice::Replace(index) => {
            let target = updated
                .skills
                .get(index)
                .ok_or(EngineError::SkillIndexOutOfRange(index))?;
            if target.permanent {
                return Err(EngineError::CannotReplacePermanent);
            }
            if find_duplicate(&updated.skills, &new_skill.name, Some(index)) {
                return Err(EngineError::DuplicateSkillName(new_skill.name));
            }
            let old = std::mem::replace(&mut updated.skills[index], new_skill.clone());
            replaced = Some((index, old));
        }
        SlotChoice::Discard => unreachable!("Discard se maneja arriba"),
    }

    // `advancement_option` ya garantizó que el XP alcanza según `xp_same_roll`.
    updated.xp -= option.xp_cost;

    Ok(ApplyResult {
        character: updated,
        xp_gained: outcome.xp_gained,
        xp_spent: option.xp_cost,
        new_skill: Some(new_skill),
        replaced,
    })
}
