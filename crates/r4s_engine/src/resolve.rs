use crate::dice::DiceRoll;
use crate::types::TieWinner;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Success,
    Failure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RollOutcome {
    pub outcome: Outcome,
    pub player_total: u32,
    pub opposition_total: u32,
    pub tie_winner: TieWinner,
    /// 1 si la tirada falla, 0 si tiene éxito.
    pub xp_gained: u32,
}

/// Compara la tirada del jugador con la oposición del DM.
pub fn resolve(player: &DiceRoll, opposition: &DiceRoll, tie_winner: TieWinner) -> RollOutcome {
    let player_total = player.total();
    let opposition_total = opposition.total();
    let success =
        player_total > opposition_total || (player_total == opposition_total && tie_winner == TieWinner::Player);
    let outcome = if success { Outcome::Success } else { Outcome::Failure };
    RollOutcome {
        outcome,
        player_total,
        opposition_total,
        tie_winner,
        xp_gained: u32::from(outcome == Outcome::Failure),
    }
}
