/**
 * Non-merchant movements: transfers, tax withholdings, cash withdrawals and
 * credit-card bill payments. These are not subscriptions and are excluded
 * before grouping. Pure TypeScript, no UI imports.
 *
 * Deliberately NOT matched: bare iva / impuesto / tax, bare "card payment",
 * pix, tikkie, "to <person>", and any bank fee (fee, comision, tarifa,
 * mantenimiento...), even when it mentions a transfer or an ATM. Debit-card
 * purchases ("PAGO CON TARJETA NETFLIX") are merchants and are kept.
 */

const NON_MERCHANT_RE = new RegExp(
  [
    // transfers, withholding, cash withdrawal (ES/EN/PT)
    String.raw`\b(?:transfer|transferencias?|transferir|transf|retencion(?:es)?|retencoes?|retencao|withholding|cajero|atm|saques?|levantamento|withdrawals?)\b`,
    // "retiro" only as a cash withdrawal ("RETIRO CAJERO", "RETIRO EN EFECTIVO",
    // or at the start), never inside a merchant name ("SMART FIT RETIRO").
    String.raw`^\W*retiros?\b|\bretiros?\s+(?:(?:de|en|por)\s+)?(?:cajero|atm|efectivo|ventanilla)\b`,
    // credit-card bill payment. "PAGO CON TARJETA NETFLIX" is a debit-card
    // PURCHASE (common on Latin American statements) and must stay.
    String.raw`\b(?:pago|pagamento)\s+(?:(?:de|da|do|a)\s+)?(?:(?:la|su|sua)\s+)?(?:tarjeta|tarj|cartao)\s+(?:de\s+)?credito\b`,
    // "PAGO A LA TARJETA": paying INTO the card, i.e. the bill.
    String.raw`\bpago\s+a\s+(?:(?:la|su)\s+)?(?:tarjeta|tarj)\b`,
    String.raw`\b(?:pago|pagamento)\s+(?:(?:de|da)\s+)?fatura\b`,
    String.raw`\bpago\s+(?:de\s+)?tc\b`,
    String.raw`\bcredit\s+card\s+payment\b`,
    String.raw`\bpayment\s+(?:to|of)\s+(?:your\s+)?(?:credit\s+)?card\b`,
  ].join('|'),
  'i',
);

/**
 * Bank fees are real recurring charges (a fee IS a vampire), even when their
 * description mentions a transfer or a withdrawal: "ATM FEE",
 * "COMISION RETIRO CAJERO", "WISE TRANSFER FEE".
 */
const FEE_RE =
  /\b(?:fees?|comision(?:es)?|comissao|tarifas?|mantenimiento|manutencao|cuota\s+de\s+manejo|taxa|service\s+charge)\b/i;

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** True when the raw bank description is a non-merchant movement. */
export function isNonMerchant(description: string): boolean {
  const d = stripAccents(description);
  return NON_MERCHANT_RE.test(d) && !FEE_RE.test(d);
}
