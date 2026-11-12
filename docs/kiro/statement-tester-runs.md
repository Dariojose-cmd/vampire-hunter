# statement-tester runs (Kiro CLI custom agent)

The custom agent `.kiro/agents/statement-tester.json` generates realistic fake exports in the format of real banks, runs them through the real engine (`npx tsx scripts/detect.ts <file>`, no network), and compares expected vs detected subscriptions. Its permissions allow writing only to `tests/fixtures/banks/`; `src/`, `git commit`, `git push`, `rm`, `curl` and `wget` are denied.

All files are synthetic. No real bank data was used.

## Run 1 (Nov 11, 2026): the app failed on real formats

5 bank formats (Chase US, Amex US, Santander ES, Bancolombia CO, Nubank BR), 24 expected subscriptions: **0 detected**. Our own 4 samples passed only because we had designed them ourselves.

Root causes found by the agent (file:line in its report): wrong column picked by keyword ("Details", "Fecha valor", "Saldo", "title"), card statements with positive charges, reference codes in the middle of merchant names, and currency falling back to USD.
"Probe" variants with one format issue corrected reached 18/24, which showed the detection itself worked and the problem was parsing.

Fixed by Kiro Web PRs #8, #9 and #10.

## Run 2 (same day, after the fixes)

| Fixtures | Expected | Detected | Vampire-level false positives |
|---|---|---|---|
| 11 existing fixtures (5 banks + probes + Revolut GB) | 51 | 51 | 0 |
| 2 banks never seen before (Itaú BR, ING NL) | 12 | **0** (parse failed) | – |

The agent noted on its own that run 1's "0/24" baseline is not 1:1 comparable with run 2, and that one "missed Apple" flag was a bug in its comparison script, not in the engine.

With headers fixed by hand, detection found 12/12 on the new banks, so the **detection generalized but the parser was overfitted** to the banks we had tested. The worst finding: ING marks direction in an "Af/Bij" column with unsigned amounts, so the **salary was detected as a monthly vampire**.

## Fix: Bug Fix spec `bank-format-parser-fixes` (Kiro IDE)

1. Bug-condition tests written first and confirmed failing on the unfixed code.
2. Baseline of the 5 in-app samples captured **before** any engine change (`tests/baselines/inAppSamples.vampireIds.json`), plus preservation property tests.
3. Fix: debit/credit indicator columns, Portuguese/Dutch header synonyms, a widest-text-column fallback, compact `YYYYMMDD` dates, and a cap at 59 for 2-bite candidates without a catalog match.
4. Mid-run, two variable-spend merchants whose amount rose every month (a bakery and a food-delivery service) were still split into 3-bite chunks that looked like subscriptions. Kiro **stopped and asked** instead of editing fixtures or tests. After checking the data, the human approved a new rule (`src/engine/creepingSplit.ts`): amounts that rise every time and never repeat are variable spend.

Result: Itaú 6/6 and ING 6/6 with no vampire-level false positives, the old fixtures still 51/51, and the 5 samples identical to the baseline. Total: 580 tests passing.

Known gap: a German export (tested by hand) still needs manual column mapping, and the manual mapper does not yet offer a debit/credit indicator column.
