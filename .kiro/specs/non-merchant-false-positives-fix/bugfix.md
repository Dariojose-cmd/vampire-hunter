# Bugfix Requirements Document

## Introduction

On a real Ecuadorian bank statement (1 month, 55 movements, no subscriptions), detection correctly returned 0 vampires, but "possible vampires" listed two items that are not subscriptions. The first is "****RETENCION IVASD DLC* UBER", a VAT withholding on Uber rides (2 charges of 0.64, 9 days apart). The second is "TRANSFERENCIA INTERNET", the user's own online transfers (2 charges of 7.55, 9 days apart). Both were labelled weekly. The first showed "Started as a free trial" and the second showed "Price history". The display name also kept leading and trailing asterisks.

Three defects are involved: non-merchant movements (transfers, tax withholdings, ATM withdrawals, card payments) are treated as candidate subscriptions; display names keep runs of symbols at their edges; and the "free trial" and "price history" flags appear on a series of only 2 charges with a weekly, biweekly, monthly or unknown cadence, which is too little evidence. Quarterly and yearly series are exempt because one year of data holds only 2 annual charges (e.g. COSTCO ANNUAL MEMBERSHIP keeps its Price history badge).

Bank fees (comisión, mantenimiento) are real recurring charges and must remain detectable. The 5 in-app samples and every fixture in `tests/fixtures/banks` must keep their exact vampire ids.

The exclusion list is deliberately limited. These stay detectable because they can be real recurring charges (for example rent) or are too broad: PIX ENVIADO, TIKKIE-style requests, Revolut-style "TO <person>" transfers, and bare IVA or impuesto. No other items are added to the list.

Bug-condition tests are written first and must be confirmed failing on the current code before any fix is made. They use a synthetic fixture of the same shape as the real statement (HTML-as-.xls with a "Fecha este Corte" summary table, columns FECHA, OFIC., N.DOC., DESCRIPCION, DEBITO, CREDITO, SALDO, dates like "15-oct."; see `tests/excelReader.html.test.ts`). No real data is used.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a recurring group's description is a non-merchant movement (transfer, tax withholding, ATM withdrawal, or credit-card payment, in Spanish, English or Portuguese; e.g. "TRANSFERENCIA INTERNET", "****RETENCION IVASD DLC* UBER") THEN the system lists it as a possible vampire (or a vampire if its score reaches 60)

1.2 WHEN a display name starts or ends with a run of symbols (e.g. "****RETENCION IVASD DLC* UBER") THEN the system shows the name with the leading and trailing symbols

1.3 WHEN a series has fewer than 3 charges, its cadence is not quarterly or yearly, and the first charge is below 20% of the median THEN the system sets `hasFreeTrial` and shows "Started as a free trial"

1.4 WHEN a series has fewer than 3 charges, its cadence is not quarterly or yearly, and the amounts differ enough to be treated as a price increase THEN the system sets `hasPriceIncrease` and shows the "Price history" badge

### Expected Behavior (Correct)

2.1 WHEN a recurring group's description matches the non-merchant exclusion list (ES/EN/PT: transferencia, transfer, transferência, retencion, retención, IVA withholding, retiro cajero, ATM withdrawal, saque, pago tarjeta de crédito, and similar) THEN the system SHALL exclude it from both `vampires` and `possibleVampires`

2.2 WHEN a display name starts or ends with a run of symbols THEN the system SHALL strip those symbols (`* # _ ~ | \ / = + -` and whitespace) so the name has no junk at either edge (e.g. "RETENCION IVASD DLC* UBER" loses its edge asterisks, and no leading or trailing asterisks remain)

2.3 WHEN a series has fewer than 3 charges and its cadence is weekly, biweekly, monthly or unknown THEN the system SHALL NOT set `hasFreeTrial` and SHALL NOT show "Started as a free trial"

2.4 WHEN a series has fewer than 3 charges and its cadence is weekly, biweekly, monthly or unknown THEN the system SHALL NOT show the "Price history" badge

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a description is a recurring bank fee (comisión, mantenimiento, and similar) THEN the system SHALL CONTINUE TO detect it as a vampire or possible vampire

3.2 WHEN a description is an ordinary merchant not on the exclusion list THEN the system SHALL CONTINUE TO detect it with the same cadence, score and id as before

3.3 WHEN a series has 3 or more charges with a genuine free-trial first charge or a genuine price increase THEN the system SHALL CONTINUE TO set `hasFreeTrial` and `hasPriceIncrease` and show the corresponding badges

3.4 WHEN detection runs on the 5 in-app samples THEN the system SHALL CONTINUE TO return exactly the same vampire ids as the current baseline tests expect

3.5 WHEN detection runs on any fixture in `tests/fixtures/banks` THEN the system SHALL CONTINUE TO return exactly the same vampire ids as the current baseline tests expect

3.6 WHEN a display name already has no leading or trailing junk character THEN the system SHALL CONTINUE TO show it unchanged

3.7 WHEN a catalog match exists THEN the system SHALL CONTINUE TO show the catalog canonical name as the display name

3.8 WHEN a series has a quarterly or yearly cadence and 2 or more charges (e.g. COSTCO ANNUAL MEMBERSHIP with 2 yearly charges) THEN the system SHALL CONTINUE TO set `hasFreeTrial` and `hasPriceIncrease` and show the corresponding badges

3.9 WHEN a description is PIX ENVIADO, a TIKKIE-style request, a Revolut-style "TO <person>" transfer, or a bare IVA or impuesto THEN the system SHALL CONTINUE TO detect it as before, because it is not on the exclusion list

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type DetectionInput (transactions from one statement)
  OUTPUT: boolean

  RETURN EXISTS group G IN X.recurringGroups WHERE
           matchesNonMerchantList(G.description)
        OR hasEdgeSymbolRun(displayName(G))
        OR (G.bites.length < 3
              AND G.cadence NOT IN {quarterly, yearly}
              AND (G.hasFreeTrial OR G.hasPriceIncrease))
END FUNCTION
```

```pascal
// Property: Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  result ← runDetection'(X)
  ASSERT no item in result.vampires ∪ result.possibleVampires matches the non-merchant list
  ASSERT FOR ALL v IN result: displayName(v) has no leading or trailing junk character
  ASSERT FOR ALL v IN result WHERE v.bites.length < 3 AND v.cadence NOT IN {quarterly, yearly}:
           NOT v.hasFreeTrial AND NOT v.hasPriceIncrease-badge
END FOR
```

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT runDetection(X) = runDetection'(X)
END FOR
```
