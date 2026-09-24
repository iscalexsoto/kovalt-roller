use crate::error::EngineError;
use crate::types::{Character, MAX_CHARACTER_NAME_LEN, MAX_SKILL_NAME_LEN, RoomSettings, Skill};

/// Crea un personaje nuevo con "Do Anything 1".
pub fn new_character(name: &str, description: &str) -> Result<Character, EngineError> {
    let name = normalize_character_name(name)?;
    Ok(Character {
        name,
        description: description.trim().to_string(),
        notes: String::new(),
        xp: 0,
        skills: vec![Skill::base()],
    })
}

pub fn normalize_character_name(name: &str) -> Result<String, EngineError> {
    let name = name.trim();
    let len = name.chars().count();
    if len == 0 || len > MAX_CHARACTER_NAME_LEN {
        return Err(EngineError::InvalidCharacterName {
            max: MAX_CHARACTER_NAME_LEN,
        });
    }
    Ok(name.to_string())
}

pub fn normalize_skill_name(name: &str) -> Result<String, EngineError> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let len = name.chars().count();
    if len == 0 || len > MAX_SKILL_NAME_LEN {
        return Err(EngineError::InvalidSkillName {
            max: MAX_SKILL_NAME_LEN,
        });
    }
    Ok(name)
}

/// (slots usados, capacidad). "Do Anything 1" no ocupa slot.
pub fn slot_usage(character: &Character, settings: &RoomSettings) -> (usize, usize) {
    let used = character.skills.iter().filter(|s| !s.permanent).count();
    (used, settings.skill_slots as usize)
}

pub fn slots_full(character: &Character, settings: &RoomSettings) -> bool {
    let (used, capacity) = slot_usage(character, settings);
    used >= capacity
}

/// Busca otra habilidad con el mismo nombre (sin distinguir mayúsculas).
pub(crate) fn find_duplicate(skills: &[Skill], name: &str, ignore: Option<usize>) -> bool {
    let lower = name.to_lowercase();
    skills
        .iter()
        .enumerate()
        .any(|(i, s)| Some(i) != ignore && s.name.to_lowercase() == lower)
}

/// Valida todas las invariantes de la hoja. Devuelve todos los errores encontrados.
pub fn validate_character(character: &Character, settings: &RoomSettings) -> Result<(), Vec<EngineError>> {
    let mut errors = Vec::new();

    if normalize_character_name(&character.name).is_err() {
        errors.push(EngineError::InvalidCharacterName {
            max: MAX_CHARACTER_NAME_LEN,
        });
    }

    match character.skills.first() {
        Some(first) if first.is_base() => {}
        _ => errors.push(EngineError::MissingBaseSkill),
    }

    for (i, skill) in character.skills.iter().enumerate() {
        if i > 0 && skill.permanent {
            errors.push(EngineError::UnexpectedPermanentSkill);
        }
        if skill.level == 0 || skill.level > settings.max_dice {
            errors.push(EngineError::InvalidSkillLevel(skill.level));
        }
        if normalize_skill_name(&skill.name).is_err() {
            errors.push(EngineError::InvalidSkillName {
                max: MAX_SKILL_NAME_LEN,
            });
        }
        if find_duplicate(&character.skills[..i], &skill.name, None) {
            errors.push(EngineError::DuplicateSkillName(skill.name.clone()));
        }
    }

    let (used, capacity) = slot_usage(character, settings);
    if used > capacity {
        errors.push(EngineError::TooManySkills { used, capacity });
    }

    if errors.is_empty() { Ok(()) } else { Err(errors) }
}
