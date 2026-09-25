//! API del motor de reglas expuesta a Dart.
//!
//! Los tipos `*Dto` son espejos planos de los de `r4s_engine` (solo structs y
//! enums sin datos, para que el código Dart generado no necesite `freezed`).

use std::sync::{Mutex, OnceLock};

use anyhow::{Result, anyhow};
use flutter_rust_bridge::frb;
use r4s_engine as engine;

#[frb(init)]
pub fn init_app() {
    flutter_rust_bridge::setup_default_user_utils();
}

// ---------- tipos ----------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillDto {
    pub name: String,
    pub level: u8,
    pub permanent: bool,
    pub derived_from: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CharacterDto {
    pub name: String,
    pub description: String,
    pub notes: String,
    pub xp: u32,
    pub skills: Vec<SkillDto>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TieWinnerDto {
    Player,
    Opposition,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RoomSettingsDto {
    pub skill_slots: u8,
    pub tie_winner: TieWinnerDto,
    pub xp_same_roll: bool,
    pub max_dice: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SlotUsageDto {
    pub used: u32,
    pub capacity: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RollOutcomeDto {
    pub success: bool,
    pub player_total: u32,
    pub opposition_total: u32,
    pub xp_gained: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdvancementOptionDto {
    pub source_skill_index: u32,
    pub source_label: String,
    pub new_level: u8,
    pub natural: bool,
    pub xp_cost: u32,
    pub xp_available: u32,
    pub slots_full: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SlotChoiceKind {
    Append,
    Replace,
    Discard,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdvancementChoiceDto {
    pub new_skill_name: String,
    pub slot: SlotChoiceKind,
    /// Solo con `Replace`.
    pub replace_index: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyResultDto {
    pub character: CharacterDto,
    pub xp_gained: u32,
    pub xp_spent: u32,
    pub new_skill: Option<SkillDto>,
    pub replaced_index: Option<u32>,
    pub replaced_skill: Option<SkillDto>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ItemDto {
    pub name: String,
    pub description: String,
    pub value: Option<u32>,
    pub quantity: u32,
}

// ---------- conversiones ----------

impl From<engine::Skill> for SkillDto {
    fn from(s: engine::Skill) -> Self {
        Self {
            name: s.name,
            level: s.level,
            permanent: s.permanent,
            derived_from: s.derived_from,
        }
    }
}

impl From<SkillDto> for engine::Skill {
    fn from(s: SkillDto) -> Self {
        Self {
            name: s.name,
            level: s.level,
            permanent: s.permanent,
            derived_from: s.derived_from,
        }
    }
}

impl From<engine::Character> for CharacterDto {
    fn from(c: engine::Character) -> Self {
        Self {
            name: c.name,
            description: c.description,
            notes: c.notes,
            xp: c.xp,
            skills: c.skills.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<CharacterDto> for engine::Character {
    fn from(c: CharacterDto) -> Self {
        Self {
            name: c.name,
            description: c.description,
            notes: c.notes,
            xp: c.xp,
            skills: c.skills.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<TieWinnerDto> for engine::TieWinner {
    fn from(t: TieWinnerDto) -> Self {
        match t {
            TieWinnerDto::Player => engine::TieWinner::Player,
            TieWinnerDto::Opposition => engine::TieWinner::Opposition,
        }
    }
}

impl From<engine::TieWinner> for TieWinnerDto {
    fn from(t: engine::TieWinner) -> Self {
        match t {
            engine::TieWinner::Player => TieWinnerDto::Player,
            engine::TieWinner::Opposition => TieWinnerDto::Opposition,
        }
    }
}

impl From<RoomSettingsDto> for engine::RoomSettings {
    fn from(s: RoomSettingsDto) -> Self {
        Self {
            skill_slots: s.skill_slots,
            tie_winner: s.tie_winner.into(),
            xp_same_roll: s.xp_same_roll,
            max_dice: s.max_dice,
        }
    }
}

impl From<engine::RoomSettings> for RoomSettingsDto {
    fn from(s: engine::RoomSettings) -> Self {
        Self {
            skill_slots: s.skill_slots,
            tie_winner: s.tie_winner.into(),
            xp_same_roll: s.xp_same_roll,
            max_dice: s.max_dice,
        }
    }
}

impl From<engine::AdvancementOption> for AdvancementOptionDto {
    fn from(o: engine::AdvancementOption) -> Self {
        Self {
            source_skill_index: o.source_skill_index as u32,
            source_label: o.source_label,
            new_level: o.new_level,
            natural: o.natural,
            xp_cost: o.xp_cost,
            xp_available: o.xp_available,
            slots_full: o.slots_full,
        }
    }
}

impl From<AdvancementChoiceDto> for engine::AdvancementChoice {
    fn from(c: AdvancementChoiceDto) -> Self {
        Self {
            new_skill_name: c.new_skill_name,
            slot: match c.slot {
                SlotChoiceKind::Append => engine::SlotChoice::Append,
                SlotChoiceKind::Replace => engine::SlotChoice::Replace(c.replace_index as usize),
                SlotChoiceKind::Discard => engine::SlotChoice::Discard,
            },
        }
    }
}

pub(crate) fn engine_err(e: engine::EngineError) -> anyhow::Error {
    anyhow!(e.to_string())
}

pub(crate) fn dice_roll(values: Vec<u8>, max_dice: u8) -> Result<engine::DiceRoll> {
    engine::DiceRoll::from_values(values, max_dice).map_err(engine_err)
}

fn outcome_of(
    player: &engine::DiceRoll,
    opposition: &engine::DiceRoll,
    settings: &engine::RoomSettings,
) -> engine::RollOutcome {
    engine::resolve(player, opposition, settings.tie_winner)
}

// ---------- dados ----------

fn dice_source() -> &'static Mutex<engine::SeededDice> {
    static SOURCE: OnceLock<Mutex<engine::SeededDice>> = OnceLock::new();
    SOURCE.get_or_init(|| Mutex::new(engine::SeededDice::from_entropy()))
}

/// Tira `count` d6 con la fuente aleatoria del proceso.
#[frb(sync)]
pub fn roll_dice(count: u8, max_dice: u8) -> Result<Vec<u8>> {
    let mut source = dice_source()
        .lock()
        .map_err(|_| anyhow!("fuente de dados envenenada"))?;
    let roll = engine::roll(count, max_dice, &mut *source).map_err(engine_err)?;
    Ok(roll.dice().to_vec())
}

// ---------- sala y personaje ----------

#[frb(sync)]
pub fn default_room_settings() -> RoomSettingsDto {
    engine::RoomSettings::default().into()
}

/// Mensaje de error si los ajustes no son válidos.
#[frb(sync)]
pub fn validate_room_settings(settings: RoomSettingsDto) -> Option<String> {
    engine::RoomSettings::from(settings)
        .validate()
        .err()
        .map(|e| e.to_string())
}

#[frb(sync)]
pub fn new_character(name: String, description: String) -> Result<CharacterDto> {
    engine::new_character(&name, &description)
        .map(Into::into)
        .map_err(engine_err)
}

/// Lista de problemas de la hoja (vacía si es válida).
#[frb(sync)]
pub fn validate_character(character: CharacterDto, settings: RoomSettingsDto) -> Vec<String> {
    match engine::validate_character(&character.into(), &settings.into()) {
        Ok(()) => Vec::new(),
        Err(errors) => errors.into_iter().map(|e| e.to_string()).collect(),
    }
}

#[frb(sync)]
pub fn slot_usage(character: CharacterDto, settings: RoomSettingsDto) -> SlotUsageDto {
    let (used, capacity) = engine::slot_usage(&character.into(), &settings.into());
    SlotUsageDto {
        used: used as u32,
        capacity: capacity as u32,
    }
}

#[frb(sync)]
pub fn validate_item(item: ItemDto) -> Option<String> {
    engine::Item {
        name: item.name,
        description: item.description,
        value: item.value,
        quantity: item.quantity,
    }
    .validate()
    .err()
    .map(|e| e.to_string())
}

// ---------- tirada y avance ----------

#[frb(sync)]
pub fn resolve_roll(
    player_dice: Vec<u8>,
    opposition_dice: Vec<u8>,
    settings: RoomSettingsDto,
) -> Result<RollOutcomeDto> {
    let settings: engine::RoomSettings = settings.into();
    let player = dice_roll(player_dice, settings.max_dice)?;
    let opposition = dice_roll(opposition_dice, settings.max_dice)?;
    let o = outcome_of(&player, &opposition, &settings);
    Ok(RollOutcomeDto {
        success: o.outcome == engine::Outcome::Success,
        player_total: o.player_total,
        opposition_total: o.opposition_total,
        xp_gained: o.xp_gained,
    })
}

/// Avance posible tras una tirada (o `None` si no hay).
#[frb(sync)]
pub fn advancement_option(
    character: CharacterDto,
    settings: RoomSettingsDto,
    player_dice: Vec<u8>,
    opposition_dice: Vec<u8>,
    skill_index: u32,
) -> Result<Option<AdvancementOptionDto>> {
    let settings: engine::RoomSettings = settings.into();
    let player = dice_roll(player_dice, settings.max_dice)?;
    let opposition = dice_roll(opposition_dice, settings.max_dice)?;
    let outcome = outcome_of(&player, &opposition, &settings);
    engine::advancement_option(&character.into(), &settings, &player, &outcome, skill_index as usize)
        .map(|o| o.map(Into::into))
        .map_err(engine_err)
}

/// Aplica el resultado a la hoja: XP por fallo y la habilidad elegida.
#[frb(sync)]
pub fn apply_roll(
    character: CharacterDto,
    settings: RoomSettingsDto,
    player_dice: Vec<u8>,
    opposition_dice: Vec<u8>,
    skill_index: u32,
    choice: Option<AdvancementChoiceDto>,
) -> Result<ApplyResultDto> {
    let settings: engine::RoomSettings = settings.into();
    let player = dice_roll(player_dice, settings.max_dice)?;
    let opposition = dice_roll(opposition_dice, settings.max_dice)?;
    let outcome = outcome_of(&player, &opposition, &settings);
    let choice = choice.map(engine::AdvancementChoice::from);
    let res = engine::apply_roll(
        &character.into(),
        &settings,
        &player,
        &outcome,
        skill_index as usize,
        choice.as_ref(),
    )
    .map_err(engine_err)?;
    let (replaced_index, replaced_skill) = match res.replaced {
        Some((i, s)) => (Some(i as u32), Some(s.into())),
        None => (None, None),
    };
    Ok(ApplyResultDto {
        character: res.character.into(),
        xp_gained: res.xp_gained,
        xp_spent: res.xp_spent,
        new_skill: res.new_skill.map(Into::into),
        replaced_index,
        replaced_skill,
    })
}
