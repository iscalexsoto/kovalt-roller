use std::collections::VecDeque;
use std::hash::{BuildHasher, Hasher};

use crate::error::EngineError;
use crate::types::MAX_DICE_LIMIT;

/// Fuente de d6. Se inyecta para poder tener tiradas deterministas en tests.
pub trait DiceSource {
    /// Devuelve un valor entre 1 y 6.
    fn d6(&mut self) -> u8;
}

/// Generador SplitMix64: rápido, sin dependencias y reproducible con semilla.
#[derive(Debug, Clone)]
pub struct SeededDice {
    state: u64,
}

impl SeededDice {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    /// Semilla tomada de la aleatoriedad del proceso (`RandomState` se
    /// inicializa desde el SO) mezclada con la hora actual.
    pub fn from_entropy() -> Self {
        let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        hasher.write_u128(nanos);
        Self::new(hasher.finish())
    }

    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
}

impl DiceSource for SeededDice {
    fn d6(&mut self) -> u8 {
        // Muestreo por rechazo para evitar sesgo de módulo.
        const ZONE: u64 = u64::MAX - (u64::MAX % 6);
        loop {
            let v = self.next_u64();
            if v < ZONE {
                return (v % 6) as u8 + 1;
            }
        }
    }
}

/// Dados guionizados para tests. Entra en pánico si se agotan.
#[derive(Debug, Clone, Default)]
pub struct FixedDice(pub VecDeque<u8>);

impl FixedDice {
    pub fn new(values: impl IntoIterator<Item = u8>) -> Self {
        Self(values.into_iter().collect())
    }
}

impl DiceSource for FixedDice {
    fn d6(&mut self) -> u8 {
        self.0.pop_front().expect("FixedDice sin valores")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiceRoll {
    dice: Vec<u8>,
}

impl DiceRoll {
    /// Construye una tirada a partir de valores ya conocidos (p. ej. leídos de Firestore).
    pub fn from_values(dice: Vec<u8>, max_dice: u8) -> Result<Self, EngineError> {
        if dice.is_empty() || dice.len() > max_dice.min(MAX_DICE_LIMIT) as usize {
            return Err(EngineError::DiceCountOutOfRange {
                got: dice.len(),
                max: max_dice,
            });
        }
        if let Some(&bad) = dice.iter().find(|&&d| !(1..=6).contains(&d)) {
            return Err(EngineError::InvalidDieValue(bad));
        }
        Ok(Self { dice })
    }

    pub fn dice(&self) -> &[u8] {
        &self.dice
    }

    pub fn len(&self) -> usize {
        self.dice.len()
    }

    pub fn is_empty(&self) -> bool {
        self.dice.is_empty()
    }

    pub fn total(&self) -> u32 {
        self.dice.iter().map(|&d| u32::from(d)).sum()
    }

    pub fn all_sixes(&self) -> bool {
        self.dice.iter().all(|&d| d == 6)
    }

    pub fn non_sixes(&self) -> u32 {
        self.dice.iter().filter(|&&d| d != 6).count() as u32
    }
}

/// Tira `count` d6.
pub fn roll(count: u8, max_dice: u8, source: &mut impl DiceSource) -> Result<DiceRoll, EngineError> {
    let values = (0..count).map(|_| source.d6()).collect();
    DiceRoll::from_values(values, max_dice)
}
