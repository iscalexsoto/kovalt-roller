use r4s_engine::*;

fn settings() -> RoomSettings {
    RoomSettings::default()
}

fn dice(values: &[u8]) -> DiceRoll {
    DiceRoll::from_values(values.to_vec(), MAX_DICE_LIMIT).unwrap()
}

fn skill(name: &str, level: u8) -> Skill {
    Skill {
        name: name.into(),
        level,
        permanent: false,
        derived_from: None,
    }
}

fn hero_with(skills: &[Skill], xp: u32) -> Character {
    let mut c = new_character("Heroína", "").unwrap();
    c.skills.extend_from_slice(skills);
    c.xp = xp;
    c
}

fn choice(name: &str, slot: SlotChoice) -> AdvancementChoice {
    AdvancementChoice {
        new_skill_name: name.into(),
        slot,
    }
}

// ---------- personaje ----------

#[test]
fn new_character_starts_with_do_anything_1() {
    let c = new_character("  Ana  ", "exploradora").unwrap();
    assert_eq!(c.name, "Ana");
    assert_eq!(c.skills, vec![Skill::base()]);
    assert_eq!(c.skills[0].label(), "Do Anything 1");
    assert_eq!(c.xp, 0);
    assert!(validate_character(&c, &settings()).is_ok());
}

#[test]
fn character_name_is_required() {
    assert!(new_character("   ", "").is_err());
    assert!(new_character(&"x".repeat(61), "").is_err());
}

#[test]
fn base_skill_does_not_use_a_slot() {
    let s = RoomSettings {
        skill_slots: 2,
        ..settings()
    };
    let c = hero_with(&[skill("Trepar", 2), skill("Nadar", 2)], 0);
    assert_eq!(slot_usage(&c, &s), (2, 2));
    assert!(slots_full(&c, &s));
    assert!(validate_character(&c, &s).is_ok());
}

#[test]
fn validation_catches_broken_sheets() {
    let s = RoomSettings {
        skill_slots: 1,
        ..settings()
    };
    let mut c = hero_with(&[skill("Trepar", 2), skill("trepar", 3)], 0);
    c.skills[0].level = 2;
    let errors = validate_character(&c, &s).unwrap_err();
    assert!(errors.contains(&EngineError::MissingBaseSkill));
    assert!(errors.contains(&EngineError::DuplicateSkillName("trepar".into())));
    assert!(errors.contains(&EngineError::TooManySkills { used: 2, capacity: 1 }));
}

// ---------- dados y resolución ----------

#[test]
fn seeded_dice_are_deterministic_and_in_range() {
    let a = roll(10, 10, &mut SeededDice::new(42)).unwrap();
    let b = roll(10, 10, &mut SeededDice::new(42)).unwrap();
    assert_eq!(a, b);
    let mut src = SeededDice::new(7);
    let mut seen = [0u32; 6];
    for _ in 0..6000 {
        let v = src.d6();
        assert!((1..=6).contains(&v));
        seen[(v - 1) as usize] += 1;
    }
    assert!(seen.iter().all(|&n| n > 800), "distribución sospechosa: {seen:?}");
}

#[test]
fn dice_roll_validation() {
    assert!(DiceRoll::from_values(vec![], 10).is_err());
    assert!(DiceRoll::from_values(vec![7], 10).is_err());
    assert!(DiceRoll::from_values(vec![1; 11], 10).is_err());
    assert!(DiceRoll::from_values(vec![1; 4], 3).is_err());
}

#[test]
fn ties_follow_room_setting() {
    let p = dice(&[3, 4]);
    let o = dice(&[5, 2]);
    let player = resolve(&p, &o, TieWinner::Player);
    assert_eq!(player.outcome, Outcome::Success);
    assert_eq!(player.xp_gained, 0);
    let opp = resolve(&p, &o, TieWinner::Opposition);
    assert_eq!(opp.outcome, Outcome::Failure);
    assert_eq!(opp.xp_gained, 1);
}

// ---------- avance ----------

#[test]
fn failure_grants_one_xp() {
    let c = hero_with(&[], 0);
    let r = dice(&[2]);
    let o = resolve(&r, &dice(&[5]), TieWinner::Player);
    let res = apply_roll(&c, &settings(), &r, &o, 0, None).unwrap();
    assert_eq!(res.character.xp, 1);
    assert_eq!(res.xp_gained, 1);
    assert!(res.new_skill.is_none());
}

#[test]
fn all_sixes_grants_new_skill_one_level_higher() {
    let c = hero_with(&[], 0);
    let r = dice(&[6]);
    let o = resolve(&r, &dice(&[3]), TieWinner::Player);
    let opt = advancement_option(&c, &settings(), &r, &o, 0).unwrap().unwrap();
    assert!(opt.natural);
    assert_eq!(opt.new_level, 2);
    assert_eq!(opt.xp_cost, 0);

    let res = apply_roll(&c, &settings(), &r, &o, 0, Some(&choice("Trepar", SlotChoice::Append))).unwrap();
    let new = res.new_skill.unwrap();
    assert_eq!(new.label(), "Trepar 2");
    assert_eq!(new.derived_from.as_deref(), Some("Do Anything 1"));
    assert_eq!(res.character.skills.len(), 2);
    assert_eq!(res.xp_spent, 0);
}

#[test]
fn xp_turns_dice_into_sixes_for_advancement_only() {
    // Trepar 2 saca [6, 3] contra 12: falla, pero con 1 XP puede avanzar.
    let c = hero_with(&[skill("Trepar", 2)], 1);
    let r = dice(&[6, 3]);
    let o = resolve(&r, &dice(&[6, 6]), TieWinner::Player);
    assert_eq!(o.outcome, Outcome::Failure, "el XP no cambia el resultado");

    let opt = advancement_option(&c, &settings(), &r, &o, 1).unwrap().unwrap();
    assert!(!opt.natural);
    assert_eq!(opt.xp_cost, 1);
    assert_eq!(opt.xp_available, 2); // 1 previo + 1 de esta tirada

    let res = apply_roll(
        &c,
        &settings(),
        &r,
        &o,
        1,
        Some(&choice("Trepar muros", SlotChoice::Append)),
    )
    .unwrap();
    assert_eq!(res.character.xp, 1); // 1 + 1 - 1
    assert_eq!(res.new_skill.unwrap().level, 3);
}

#[test]
fn xp_same_roll_setting() {
    let c = hero_with(&[], 0);
    let r = dice(&[2]);
    let o = resolve(&r, &dice(&[5]), TieWinner::Player);

    let with = RoomSettings {
        xp_same_roll: true,
        ..settings()
    };
    assert!(advancement_option(&c, &with, &r, &o, 0).unwrap().is_some());
    let res = apply_roll(&c, &with, &r, &o, 0, Some(&choice("Correr", SlotChoice::Append))).unwrap();
    assert_eq!(res.character.xp, 0);

    let without = RoomSettings {
        xp_same_roll: false,
        ..settings()
    };
    assert!(advancement_option(&c, &without, &r, &o, 0).unwrap().is_none());
    assert_eq!(
        apply_roll(&c, &without, &r, &o, 0, Some(&choice("Correr", SlotChoice::Append))),
        Err(EngineError::NotEligible)
    );
}

#[test]
fn insufficient_xp_means_no_option() {
    let c = hero_with(&[skill("Trepar", 2)], 0);
    let r = dice(&[1, 2]);
    let o = resolve(&r, &dice(&[6]), TieWinner::Player);
    assert!(advancement_option(&c, &settings(), &r, &o, 1).unwrap().is_none());
}

#[test]
fn full_slots_require_replace_or_discard() {
    let s = RoomSettings {
        skill_slots: 1,
        ..settings()
    };
    let c = hero_with(&[skill("Trepar", 2)], 0);
    let r = dice(&[6]);
    let o = resolve(&r, &dice(&[1]), TieWinner::Player);

    let opt = advancement_option(&c, &s, &r, &o, 0).unwrap().unwrap();
    assert!(opt.slots_full);

    assert_eq!(
        apply_roll(&c, &s, &r, &o, 0, Some(&choice("Nadar", SlotChoice::Append))),
        Err(EngineError::SlotsFull)
    );
    assert_eq!(
        apply_roll(&c, &s, &r, &o, 0, Some(&choice("Nadar", SlotChoice::Replace(0)))),
        Err(EngineError::CannotReplacePermanent)
    );

    let replaced = apply_roll(&c, &s, &r, &o, 0, Some(&choice("Nadar", SlotChoice::Replace(1)))).unwrap();
    assert_eq!(replaced.character.skills[1].label(), "Nadar 2");
    assert_eq!(replaced.replaced.unwrap().1.name, "Trepar");
    assert!(validate_character(&replaced.character, &s).is_ok());

    let discarded = apply_roll(&c, &s, &r, &o, 0, Some(&choice("Nadar", SlotChoice::Discard))).unwrap();
    assert_eq!(discarded.character.skills, c.skills);
}

#[test]
fn duplicate_skill_names_are_rejected() {
    let c = hero_with(&[skill("Trepar", 2)], 0);
    let r = dice(&[6]);
    let o = resolve(&r, &dice(&[1]), TieWinner::Player);
    assert_eq!(
        apply_roll(
            &c,
            &settings(),
            &r,
            &o,
            0,
            Some(&choice("  trepar ", SlotChoice::Append))
        ),
        Err(EngineError::DuplicateSkillName("trepar".into()))
    );
    // Reemplazar la misma habilidad por una con su nombre sí es válido.
    assert!(
        apply_roll(
            &c,
            &settings(),
            &r,
            &o,
            0,
            Some(&choice("Trepar", SlotChoice::Replace(1)))
        )
        .is_ok()
    );
}

#[test]
fn max_level_skill_cannot_advance() {
    let s = RoomSettings {
        max_dice: 3,
        ..settings()
    };
    let c = hero_with(&[skill("Trepar", 3)], 0);
    let r = dice(&[6, 6, 6]);
    let o = resolve(&r, &dice(&[1]), TieWinner::Player);
    assert!(advancement_option(&c, &s, &r, &o, 1).unwrap().is_none());
}

#[test]
fn dice_count_must_match_skill_level() {
    let c = hero_with(&[skill("Trepar", 2)], 0);
    let r = dice(&[6]);
    let o = resolve(&r, &dice(&[1]), TieWinner::Player);
    assert_eq!(
        advancement_option(&c, &settings(), &r, &o, 1),
        Err(EngineError::DiceCountMismatch { expected: 2, got: 1 })
    );
}

// ---------- inventario ----------

#[test]
fn items_allow_zero_quantity_and_optional_value() {
    let item = Item::new("Cuerda", "10 m", None, 0).unwrap();
    assert_eq!(item.quantity, 0);
    let given = item.give(3);
    assert_eq!(given.quantity, 3);
    assert_eq!(given.name, "Cuerda");
    assert!(Item::new("  ", "", Some(5), 1).is_err());
}
