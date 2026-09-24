use proptest::prelude::*;
use r4s_engine::*;

fn arb_settings() -> impl Strategy<Value = RoomSettings> {
    (1u8..=6, any::<bool>(), any::<bool>()).prop_map(|(slots, tie, same)| RoomSettings {
        skill_slots: slots,
        tie_winner: if tie { TieWinner::Player } else { TieWinner::Opposition },
        xp_same_roll: same,
        max_dice: MAX_DICE_LIMIT,
    })
}

proptest! {
    /// Tras cualquier secuencia de tiradas y elecciones, la hoja sigue siendo válida
    /// y "Do Anything 1" sigue en su sitio.
    #[test]
    fn apply_roll_preserves_invariants(
        settings in arb_settings(),
        seed in any::<u64>(),
        steps in prop::collection::vec((any::<u8>(), 1u8..=4, any::<u8>(), any::<u8>()), 1..40),
    ) {
        let mut dice = SeededDice::new(seed);
        let mut c = new_character("Prueba", "").unwrap();
        for (i, (skill_pick, opp_dice, slot_pick, name_pick)) in steps.into_iter().enumerate() {
            let idx = skill_pick as usize % c.skills.len();
            let level = c.skills[idx].level;
            let player = roll(level, settings.max_dice, &mut dice).unwrap();
            let opposition = roll(opp_dice, settings.max_dice, &mut dice).unwrap();
            let outcome = resolve(&player, &opposition, settings.tie_winner);

            let choice = advancement_option(&c, &settings, &player, &outcome, idx).unwrap().map(|opt| {
                let slot = if opt.slots_full {
                    let non_base = c.skills.len() - 1;
                    if slot_pick % 3 == 0 || non_base == 0 { SlotChoice::Discard }
                    else { SlotChoice::Replace(1 + slot_pick as usize % non_base) }
                } else {
                    SlotChoice::Append
                };
                AdvancementChoice { new_skill_name: format!("Skill {i}-{name_pick}"), slot }
            });

            let xp_before = c.xp;
            let res = apply_roll(&c, &settings, &player, &outcome, idx, choice.as_ref()).unwrap();
            prop_assert_eq!(res.character.xp, xp_before + res.xp_gained - res.xp_spent);
            c = res.character;
            prop_assert!(validate_character(&c, &settings).is_ok(), "{:?}", validate_character(&c, &settings));
            prop_assert!(c.skills[0].is_base());
        }
    }
}
