use r4s_engine::*;

fn dice(values: &[u8]) -> DiceRoll {
    DiceRoll::from_values(values.to_vec(), MAX_DICE_LIMIT).unwrap()
}

fn hero() -> Character {
    let mut c = new_character("Ana", "").unwrap();
    c.skills.push(Skill {
        name: "Trepar".into(),
        level: 2,
        permanent: false,
        derived_from: Some("Do Anything 1".into()),
    });
    c
}

fn declared(skill_index: usize) -> RollRecord {
    let c = hero();
    declare(
        "Subo por la muralla",
        SkillRef::from_character(&c, skill_index).unwrap(),
    )
    .unwrap()
}

fn states(r: &RollRecord) -> Vec<RollState> {
    r.history.iter().map(|h| h.to).collect()
}

#[test]
fn happy_path_declare_approve_oppose_roll_resolve_apply() {
    let r = declared(1);
    let r = transition(&r, FlowAction::Approve, Actor::Dm).unwrap();
    let r = transition(&r, FlowAction::RollOpposition { dice: dice(&[3, 3]) }, Actor::Dm).unwrap();
    // La oposición es visible para el jugador antes de tirar.
    assert_eq!(r.opposition.as_ref().unwrap().total(), 6);
    let r = transition(&r, FlowAction::RollPlayer { dice: dice(&[2, 3]) }, Actor::Owner).unwrap();
    let r = transition(
        &r,
        FlowAction::Resolve {
            tie_winner: TieWinner::Player,
        },
        Actor::Owner,
    )
    .unwrap();
    assert_eq!(r.state, RollState::Resuelta);
    assert_eq!(r.result, Some(RollResult::Fallo));
    assert_eq!(r.advance, Some(AdvanceState::Pendiente));

    let r = transition(
        &r,
        FlowAction::ApplyAdvance(AppliedAdvance {
            xp_gained: 1,
            ..Default::default()
        }),
        Actor::Owner,
    )
    .unwrap();
    assert_eq!(r.advance, Some(AdvanceState::Aplicado));
    assert_eq!(
        states(&r),
        vec![
            RollState::Declarada,
            RollState::Aprobada,
            RollState::Oposicion,
            RollState::Tirada,
            RollState::Resuelta
        ]
    );
}

#[test]
fn counter_offer_then_accept_changes_skill_and_returns_to_declared() {
    let c = hero();
    let r = declared(1);
    let r = transition(
        &r,
        FlowAction::CounterOffer {
            skill: SkillRef::from_character(&c, 0).unwrap(),
            note: Some("  Eso es Do Anything  ".into()),
        },
        Actor::Dm,
    )
    .unwrap();
    assert_eq!(r.state, RollState::Contraoferta);
    assert_eq!(r.dm_note.as_deref(), Some("Eso es Do Anything"));

    let r = transition(&r, FlowAction::AcceptCounterOffer, Actor::Owner).unwrap();
    assert_eq!(r.state, RollState::Declarada);
    assert_eq!(r.skill.name, "Do Anything");
    assert!(r.counter_offer.is_none());
    // Vuelve a revisión del DM.
    assert_eq!(allowed_actions(&r, Actor::Dm).len(), 4);
}

#[test]
fn rejected_then_redeclared() {
    let c = hero();
    let r = transition(&declared(1), FlowAction::Reject { note: None }, Actor::Dm).unwrap();
    assert_eq!(r.state, RollState::Rechazada);
    let r = transition(
        &r,
        FlowAction::Redeclare {
            action: "Busco una escalera".into(),
            skill: SkillRef::from_character(&c, 0).unwrap(),
        },
        Actor::Owner,
    )
    .unwrap();
    assert_eq!(r.state, RollState::Declarada);
    assert_eq!(r.action, "Busco una escalera");
}

#[test]
fn narrated_goes_through_sin_tirada_to_resuelta_without_xp() {
    let r = transition(
        &declared(1),
        FlowAction::Narrate {
            narration: "Subes sin problema.".into(),
        },
        Actor::Dm,
    )
    .unwrap();
    assert_eq!(r.state, RollState::Resuelta);
    assert_eq!(r.result, Some(RollResult::Narrado));
    assert_eq!(r.advance, Some(AdvanceState::NoAplica));
    assert_eq!(
        states(&r),
        vec![RollState::Declarada, RollState::SinTirada, RollState::Resuelta]
    );
    assert!(allowed_actions(&r, Actor::Owner).is_empty());
    assert_eq!(
        transition(&r, FlowAction::ApplyAdvance(AppliedAdvance::default()), Actor::Owner),
        Err(EngineError::AdvancementNotPending)
    );
}

#[test]
fn wrong_actor_or_skipped_steps_are_rejected() {
    let r = declared(1);
    // El jugador no puede aprobarse a sí mismo ni saltar a tirar.
    assert!(transition(&r, FlowAction::Approve, Actor::Owner).is_err());
    assert!(transition(&r, FlowAction::RollPlayer { dice: dice(&[6, 6]) }, Actor::Owner).is_err());
    // Otro jugador no puede retirar la tirada ajena.
    assert!(transition(&r, FlowAction::Withdraw, Actor::Other).is_err());

    let r = transition(&r, FlowAction::Approve, Actor::Dm).unwrap();
    // El DM no tira por el jugador, ni el jugador la oposición.
    assert!(transition(&r, FlowAction::RollOpposition { dice: dice(&[1]) }, Actor::Owner).is_err());
    let r = transition(&r, FlowAction::RollOpposition { dice: dice(&[1]) }, Actor::Dm).unwrap();
    assert!(transition(&r, FlowAction::RollPlayer { dice: dice(&[6, 6]) }, Actor::Dm).is_err());
    // Retirar ya no es posible tras aprobar.
    assert!(transition(&r, FlowAction::Withdraw, Actor::Owner).is_err());
}

#[test]
fn player_roll_must_match_declared_level() {
    let r = transition(&declared(1), FlowAction::Approve, Actor::Dm).unwrap();
    let r = transition(&r, FlowAction::RollOpposition { dice: dice(&[4]) }, Actor::Dm).unwrap();
    assert_eq!(
        transition(&r, FlowAction::RollPlayer { dice: dice(&[6]) }, Actor::Owner),
        Err(EngineError::DiceCountMismatch { expected: 2, got: 1 })
    );
}

#[test]
fn apply_advance_checks_xp_consistency() {
    let r = transition(&declared(1), FlowAction::Approve, Actor::Dm).unwrap();
    let r = transition(&r, FlowAction::RollOpposition { dice: dice(&[1]) }, Actor::Dm).unwrap();
    let r = transition(&r, FlowAction::RollPlayer { dice: dice(&[6, 6]) }, Actor::Owner).unwrap();
    let r = transition(
        &r,
        FlowAction::Resolve {
            tie_winner: TieWinner::Player,
        },
        Actor::Dm,
    )
    .unwrap();
    assert_eq!(r.result, Some(RollResult::Exito));
    // En un éxito no se gana XP.
    assert_eq!(
        transition(
            &r,
            FlowAction::ApplyAdvance(AppliedAdvance {
                xp_gained: 1,
                ..Default::default()
            }),
            Actor::Owner
        ),
        Err(EngineError::NotEligible)
    );
    assert!(transition(&r, FlowAction::ApplyAdvance(AppliedAdvance::default()), Actor::Other).is_err());
}

#[test]
fn withdraw_from_every_player_editable_state() {
    let c = hero();
    let d = declared(1);
    assert_eq!(
        transition(&d, FlowAction::Withdraw, Actor::Owner).unwrap().state,
        RollState::Retirada
    );
    let co = transition(
        &d,
        FlowAction::CounterOffer {
            skill: SkillRef::from_character(&c, 0).unwrap(),
            note: None,
        },
        Actor::Dm,
    )
    .unwrap();
    assert_eq!(
        transition(&co, FlowAction::Withdraw, Actor::Owner).unwrap().state,
        RollState::Retirada
    );
}

#[test]
fn permission_table_only_allows_documented_transitions() {
    let mut allowed = Vec::new();
    for s in RollState::ALL {
        for k in FlowActionKind::ALL {
            for a in [Actor::Dm, Actor::Owner, Actor::Other] {
                if permits(s, k, a) {
                    allowed.push((s, k, a));
                }
            }
        }
    }
    assert!(allowed.iter().all(|(_, _, a)| *a != Actor::Other));
    assert!(
        allowed
            .iter()
            .all(|(s, _, _)| !s.is_terminal() || *s == RollState::Resuelta)
    );
    // 4 del DM en declarada + aceptar + (editar|retirar)×3 + oposición + tirada + resolver×2 + aplicar×2
    assert_eq!(allowed.len(), 17);
}

#[test]
fn state_ids_roundtrip() {
    for s in RollState::ALL {
        assert_eq!(RollState::parse(s.as_str()), Some(s));
    }
    assert_eq!(RollState::SinTirada.as_str(), "sin_tirada");
}
