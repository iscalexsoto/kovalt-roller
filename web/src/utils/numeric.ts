/** Texto del pad numérico Kovalt (input-pickers.md § 3). */

export const PAD_DECIMAL = '.';

/** Sanea un texto a lo que el pad admite: dígitos y, si no es solo de enteros, un separador
 *  decimal (la coma se acepta y sale como punto; un separador inicial se vuelve "0."). */
export function padText(text: string, integerOnly = false): string {
  let out = '';
  for (const ch of text.replace(',', PAD_DECIMAL)) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === PAD_DECIMAL && !integerOnly && !out.includes(PAD_DECIMAL)) out += out ? PAD_DECIMAL : '0.';
  }
  return out;
}
