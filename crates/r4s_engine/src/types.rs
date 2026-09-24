use crate::error::EngineError;

/// Nombre de la habilidad con la que empieza todo personaje.
pub const BASE_SKILL_NAME: &str = "Do Anything";
/// Límite absoluto de dados por tirada (y por tanto de nivel de habilidad).
pub const MAX_DICE_LIMIT: u8 = 10;
pub const MAX_CHARACTER_NAME_LEN: usize = 60;
pub const MAX_SKILL_NAME_LEN: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skill {
    pub name: String,
    pub level: u8,
    /// Solo "Do Anything 1" es permanente: no ocupa slot y no se puede reemplazar.
    pub permanent: bool,
    /// Etiqueta de la habilidad de la que se derivó (p. ej. "Do Anything 1").
    pub derived_from: Option<String>,
}

impl Skill {
    pub fn base() -> Self {
        Self {
            name: BASE_SKILL_NAME.to_string(),
            level: 1,
            permanent: true,
            derived_from: None,
        }
    }

    pub fn is_base(&self) -> bool {
        self.permanent && self.name == BASE_SKILL_NAME && self.level == 1
    }

    /// "Nombre N", como se escribe en la hoja.
    pub fn label(&self) -> String {
        format!("{} {}", self.name, self.level)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Character {
    pub name: String,
    pub description: String,
    pub notes: String,
    pub xp: u32,
    /// Invariante: `skills[0]` es "Do Anything 1" permanente.
    pub skills: Vec<Skill>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TieWinner {
    #[default]
    Player,
    Opposition,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RoomSettings {
    /// Slots para habilidades ganadas; "Do Anything 1" no cuenta.
    pub skill_slots: u8,
    pub tie_winner: TieWinner,
    /// Si el XP ganado al fallar puede gastarse en esa misma tirada.
    pub xp_same_roll: bool,
    /// Dados máximos por tirada (<= `MAX_DICE_LIMIT`).
    pub max_dice: u8,
}

impl Default for RoomSettings {
    fn default() -> Self {
        Self {
            skill_slots: 5,
            tie_winner: TieWinner::Player,
            xp_same_roll: true,
            max_dice: MAX_DICE_LIMIT,
        }
    }
}

impl RoomSettings {
    pub fn validate(&self) -> Result<(), EngineError> {
        if self.skill_slots == 0 {
            return Err(EngineError::InvalidSettings("se necesita al menos 1 slot"));
        }
        if self.max_dice < 2 || self.max_dice > MAX_DICE_LIMIT {
            return Err(EngineError::InvalidSettings("máximo de dados entre 2 y 10"));
        }
        Ok(())
    }
}
