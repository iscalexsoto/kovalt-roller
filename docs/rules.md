# Reglas implementadas

## Roll For Shoes base

- Todo personaje empieza con **Do Anything 1**.
- Para actuar se tiran tantos d6 como el nivel de la habilidad usada. El DM tira dados de oposición y se comparan las sumas.
- **Todos 6:** se gana una habilidad nueva, de nivel +1 respecto a la usada y derivada de ella (el jugador la nombra; p. ej. `Do Anything 1` → `Trepar 2`).
- **Fallo:** +1 XP.
- **XP:** 1 XP convierte un dado en 6, **solo para avanzar**, nunca para cambiar el resultado.

## Variantes de Kovalt Roller (configurables por sala)

| Ajuste | Por defecto | Efecto |
|---|---|---|
| `skillSlots` | 5 | Slots para habilidades ganadas. Do Anything 1 no ocupa slot y no se puede reemplazar. Con los slots llenos, el jugador reemplaza una habilidad o descarta la nueva. |
| `tieWinner` | jugador | Quién gana en empate. |
| `xpSameRoll` | sí | Si el XP ganado al fallar se puede gastar en esa misma tirada. |
| `maxDice` | 10 | Máximo de dados por tirada; una habilidad de ese nivel ya no avanza. |

Otras decisiones:

- Los nombres de habilidad no se repiten dentro de una hoja (sin distinguir mayúsculas).
- Reemplazar la misma habilidad que se usó para tirar está permitido.
- **Habilidades iniciales y correcciones:** el DM puede otorgar habilidades desde la ficha (nombre y nivel, para
  arquetipos o escenarios), y editar o quitar cualquier habilidad ganada. Ocupan slot, no vienen de ninguna tirada
  («Otorgada por el DM») y respetan las mismas invariantes (nivel ≤ `maxDice`, sin duplicados, slots). Do Anything 1
  no se toca.

## Flujo de una tirada

```
declarada ──(DM)──► aprobada ──(DM)──► oposicion ──(jugador)──► tirada ──► resuelta
    ├──(DM)──► contraoferta ──(jugador acepta / edita)──► declarada
    ├──(DM)──► rechazada ────(jugador edita)────────────► declarada
    ├──(DM)──► sin_tirada ──► resuelta (narración directa, sin XP)
    └──(jugador)──► retirada
```

- **Declarar:** el jugador completa la frase «*Nombre* intenta [acción] para [propósito] con *Habilidad N*». La
  acción (`accion`, 1–500) es obligatoria; el propósito (`proposito`, ≤ 200) es opcional. El registro narra el
  desenlace sin conjugar: «intentó … y lo consiguió» / «y no lo consiguió».
- **Contraoferta:** el DM sugiere otra habilidad. El jugador la acepta tal cual o edita y vuelve a declarar; en ambos casos regresa a revisión del DM.
- **Oposición:** el DM tira primero y el resultado es visible para el jugador antes de su tirada («Necesitas N»).
  En la web, «Oponer Nd6» aprueba y tira en un solo gesto.
- **Mesa y registro:** las tiradas vivas se muestran como duelo completo; las resueltas se pliegan en una fila con la
  frase, el marcador y el veredicto. La habilidad base se muestra como «Hacer cualquier cosa» (el dato sigue siendo
  `Do Anything`). El sonido de la mesa (dados y sello) es un ajuste por persona, apagado por defecto.
- **Retirar:** el jugador puede retirar su declaración mientras está en `declarada`, `contraoferta` o `rechazada`.
- **Resuelta:** el resultado se calcula automáticamente. Si hay avance posible, el jugador decide (nombre de la habilidad, gastar XP, qué slot usar) y se aplica.

## Inventario

- El DM mantiene un catálogo privado por sala. Un objeto tiene nombre, descripción (incluye el efecto si es mágico),
  valor opcional (entero, en monedas: es el precio por defecto), ícono y color. El catálogo **no** maneja cantidades.
- El DM entrega **copias** a los personajes arrastrando el objeto a un jugador (o a su ficha). Cada entrega suma una
  unidad; las copias del mismo objeto se apilan.
- Cada inventario lo ven solo su dueño y el DM. El dueño solo puede cambiar la cantidad (≥ 0).
- Cada personaje tiene **monedas** (entero ≥ 0). Las ajusta el DM; el jugador solo las gasta en una tienda.

## Botines y tiendas

- El DM arma ventanas de **botín** (gratis) o **tienda** (cobra) soltando objetos del catálogo; cada objeto tiene
  existencias limitadas y, en la tienda, un precio por unidad que parte de su valor.
- Una ventana se muestra a todos o solo a algunos personajes, y el DM la oculta o la borra cuando quiere.
- El primero que llega se lo lleva: tomar o comprar baja las existencias para todos al instante. No se puede tomar más
  de lo que queda ni comprar sin monedas suficientes (el pago es precio × cantidad).
