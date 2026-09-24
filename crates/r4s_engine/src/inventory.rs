use crate::error::EngineError;

pub const MAX_ITEM_NAME_LEN: usize = 80;

/// Objeto del catálogo del DM o del inventario de un personaje.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Item {
    pub name: String,
    /// Incluye el efecto si el objeto es mágico.
    pub description: String,
    /// Valor opcional, en la unidad que use la mesa.
    pub value: Option<u32>,
    /// Puede ser 0.
    pub quantity: u32,
}

impl Item {
    pub fn new(name: &str, description: &str, value: Option<u32>, quantity: u32) -> Result<Self, EngineError> {
        let item = Self {
            name: name.trim().to_string(),
            description: description.trim().to_string(),
            value,
            quantity,
        };
        item.validate()?;
        Ok(item)
    }

    pub fn validate(&self) -> Result<(), EngineError> {
        let len = self.name.trim().chars().count();
        if len == 0 || len > MAX_ITEM_NAME_LEN {
            return Err(EngineError::InvalidItemName { max: MAX_ITEM_NAME_LEN });
        }
        Ok(())
    }

    /// Copia que el DM entrega a un personaje, con su propia cantidad.
    pub fn give(&self, quantity: u32) -> Self {
        Self {
            quantity,
            ..self.clone()
        }
    }
}
