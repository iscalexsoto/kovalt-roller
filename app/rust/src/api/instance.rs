//! Plazas de ventana: permite abrir varias instancias de la app a la vez, cada
//! una con su propia sesión de Firebase.

use flutter_rust_bridge::frb;

/// Reserva la primera plaza libre (0, 1, 2…) con un mutex con nombre de Windows.
/// El sistema la libera al cerrarse el proceso, aunque sea por un fallo.
/// Devuelve `None` si todas están ocupadas.
#[frb(sync)]
pub fn acquire_instance_slot(max_slots: u32) -> Option<u32> {
    (0..max_slots).find(|&slot| platform::try_hold(slot))
}

#[cfg(windows)]
mod platform {
    use std::sync::Mutex;

    use windows_sys::Win32::Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, GetLastError};
    use windows_sys::Win32::System::Threading::CreateMutexW;

    /// Handles abiertos durante toda la vida del proceso.
    static HELD: Mutex<Vec<usize>> = Mutex::new(Vec::new());

    pub(crate) fn try_hold(slot: u32) -> bool {
        let name: Vec<u16> = format!(r"Local\KovaltRoller-ventana-{slot}")
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        // SAFETY: `name` es una cadena UTF-16 terminada en 0 que vive durante la llamada.
        let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return false;
        }
        // SAFETY: se consulta justo después de CreateMutexW, en el mismo hilo.
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            // SAFETY: `handle` es válido y nuestro.
            unsafe { CloseHandle(handle) };
            return false;
        }
        HELD.lock().expect("lista de mutex").push(handle as usize);
        true
    }
}

#[cfg(not(windows))]
mod platform {
    /// Fuera de Windows no se reservan plazas: siempre la primera.
    pub(crate) fn try_hold(slot: u32) -> bool {
        slot == 0
    }
}
