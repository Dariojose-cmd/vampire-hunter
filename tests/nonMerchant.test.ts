import { describe, it, expect } from 'vitest';
import { isNonMerchant } from '../src/engine/nonMerchant';

describe('isNonMerchant: positives', () => {
  it.each([
    'TRANSFERENCIA INTERNET',
    'transferencias recibidas',
    'TRANSFER TO SAVINGS',
    'TRANSFERÊNCIA ENVIADA',
    'Transferir a cuenta',
    'TRANSF BANCO X',
    '****RETENCION IVASD DLC* UBER',
    'Retención IVA',
    'RETENÇÃO IMPOSTO',
    'retencoes diversas',
    'TAX WITHHOLDING',
    'RETIRO CAJERO AUTOMATICO',
    'retiros varios',
    'SAQUE ATM 24H',
    'saques',
    'LEVANTAMENTO MULTIBANCO',
    'ATM Withdrawal',
    'cash withdrawals',
    'PAGO TARJETA DE CREDITO',
    'PAGO A LA TARJETA',
    // 'pago con su tarjeta' moved to negatives: it is how debit-card PURCHASES read.
    'PAGAMENTO FATURA CARTAO',
    'Pagamento da fatura',
    'CREDIT CARD PAYMENT',
    'PAYMENT TO YOUR CREDIT CARD',
    'payment of card',
  ])('%s matches', (d) => {
    expect(isNonMerchant(d)).toBe(true);
  });
});

describe('isNonMerchant: negatives', () => {
  it.each([
    'NETFLIX.COM',
    'pago con su tarjeta',
    'SPOTIFY',
    'COMISION MANTENIMIENTO CUENTA',
    'COMISION',
    'MANTENIMIENTO',
    'TARIFA CESTA SERVICOS',
    'NETFLIX PRESENTE CARTAO',
    'PAGO PSE SMART FIT',
    'PAGO CLARO COLOMBIA',
    'PIX ENVIADO MARIA SILVA',
    'TIKKIE JAN',
    'TO JOHN SMITH',
    'TRANSFERWISE',
    'IVA',
    'IMPUESTO',
    'TAX',
    'CARD PAYMENT',
    'ATMOSPHERE CAFE',
  ])('%s does not match', (d) => {
    expect(isNonMerchant(d)).toBe(false);
  });
});

// Reviewer follow-up (Nov 25): debit-card purchases and bank fees must survive.
describe('isNonMerchant: merchants and fees that mention cards, transfers or ATMs', () => {
  it.each([
    'PAGO CON TARJETA NETFLIX.COM',
    'PAGO TARJETA DEBITO SPOTIFY',
    'PAGAMENTO CARTAO NETFLIX',
    'PAGO TARJ NETFLIX.COM',
    'COMPRA CON TARJETA DISNEY PLUS',
    'SMART FIT RETIRO',
    'ATM FEE',
    'COMISION RETIRO CAJERO',
    'WISE TRANSFER FEE',
    'CUOTA DE MANEJO TARJETA',
  ])('keeps %s', (d) => {
    expect(isNonMerchant(d)).toBe(false);
  });

  it.each([
    'PAGO TARJETA DE CREDITO VISA',
    'PAGO DE TARJETA CREDITO',
    'PAGAMENTO DA FATURA',
    'PAGO TC MASTERCARD',
    'RETIRO CAJERO AUTOMATICO',
    'RETIRO EN EFECTIVO',
    'TRANSFERENCIA INTERNET',
    '****RETENCION IVASD DLC* UBER',
  ])('excludes %s', (d) => {
    expect(isNonMerchant(d)).toBe(true);
  });
});
