# Bugfix Requirements Document

## Introduction

Two new bank fixtures, `tests/fixtures/banks/itau-br.csv` (Itaú BR) and `tests/fixtures/banks/ing-nl.csv` (ING NL), each with an `.expected.json`, do not pass. `npx tsx scripts/detect.ts <file>` returns `COLUMN_MAPPING_NEEDED` for both, and `tests/integration.bankFixtures.test.ts` has 2 failures. The fixtures are the source of truth and MUST NOT be edited; the engine in `src/engine` must be fixed.

Four defects were found:

- The column detector does not know the headers `lançamento` / `histórico` / `omschrijving` / `naam` for the description, nor `bedrag` for the amount, and has no fallback when no description header matches.
- Debit/credit indicator columns (ING "Af Bij", also "D/C", "Débito/Crédito") are not understood. ING exports unsigned amounts, so income would be read as a charge, and a header such as "Débito/Crédito" would be mistaken for a split debit column.
- Compact dates `YYYYMMDD` (ING) are not recognized, so the date format is reported as ambiguous.
- Two-bite series with no catalog match can reach the vampire tier (for example "Tikkie Jan", two 12,50 charges 8 days apart, or "TARIFA CESTA SERVICOS", two 45,00 charges about a quarter apart). Only price-increase merges are capped today.

- One merchant whose amount creeps up a little every month (for example "PADARIA DO ZE" in Itaú, "THUISBEZORGD.NL" in ING) is split by the amount clustering in `grouper.ts` into several 2 to 3 bite clusters. Each 3-bite cluster looks like a stable monthly subscription and scores 70, so one variable-spend merchant appears twice as a vampire.

Impact: users of Itaú, ING and similar banks cannot load their statements, and once loaded, salary and refunds could be shown as vampires.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a statement has a debit/credit indicator column (header "Af Bij", "D/C", "Débito/Crédito") and unsigned amounts THEN the system ignores the indicator, so income rows ("Bij" / credit) are parsed as charges and "Salaris Werkgever BV" (2800,00 every month) is detected as a monthly vampire

1.2 WHEN a header such as "Débito/Crédito" is present THEN the system matches it as a split debit column instead of an indicator column and produces the wrong layout

1.3 WHEN the description header is `lançamento`, `histórico`, `omschrijving` or `naam` (for example "Naam / Omschrijving") THEN the system finds no description column and returns `COLUMN_MAPPING_NEEDED`

1.4 WHEN the amount header is `bedrag` (for example "Bedrag (EUR)") THEN the system does not recognize it as the amount column by header

1.5 WHEN no header matches any description keyword THEN the system returns `COLUMN_MAPPING_NEEDED` instead of using the most plausible text column

1.6 WHEN the date column holds compact dates such as `20250103` (YYYYMMDD) THEN the system reports `DATE_FORMAT_AMBIGUOUS` and `parseDate` fails every row

1.7 WHEN a candidate has exactly 2 bites, no catalog match and was not produced by a price-increase merge (for example two equal charges 8 days apart, or two equal charges about a quarter apart) THEN the system scores it 60 or more and shows it as a vampire

1.8 WHEN one merchant (same normalizedName) is split into several clusters with the same cadence and their bites together form one steadily rising series (each bite higher than the previous, no two equal amounts, no plateau), for example "PADARIA DO ZE" 12,95 to 19,60 rising about 0,95 a month or "THUISBEZORGD.NL" 23,30 to 32,40 rising about 1,30 a month, and the merchant has no catalog match THEN the system promotes each 3-bite cluster to a vampire with score 70, so the same merchant is listed twice

### Expected Behavior (Correct)

2.1 WHEN a statement has a recognized debit/credit indicator column THEN the system SHALL classify each row from the indicator (Af / debit / D / Débito = charge; Bij / credit / C / Crédito = income), and income rows SHALL never become charges, never be grouped into a candidate and never be a vampire or possible vampire

2.2 WHEN a header is an indicator header ("Af Bij", "D/C", "Débito/Crédito" and its common spellings) and its values are drawn from the debit/credit vocabulary THEN the system SHALL treat it as an indicator column and SHALL NOT use it as a debit, credit or description column

2.3 WHEN the description header is `lançamento`, `lancamento`, `histórico`, `historico`, `omschrijving` or `naam` THEN the system SHALL use that column as the description

2.4 WHEN the amount header is `bedrag` or `valor` THEN the system SHALL use that column as the amount

2.5 WHEN no header matches any description keyword THEN the system SHALL fall back to the widest text column not already assigned to date, amount, debit, credit, indicator or balance, and SHALL return `COLUMN_MAPPING_NEEDED` only when no such column exists

2.6 WHEN the date column holds compact dates YYYYMMDD THEN the system SHALL infer the date format without ambiguity and normalize each value to the ISO string `YYYY-MM-DD`

2.7 WHEN a candidate has exactly 2 bites and no catalog match THEN the system SHALL cap its confidence score at 59, so it is at most a possible vampire and never a vampire, whether or not it came from a price-increase merge

2.8 WHEN one uncatalogued merchant is split into several clusters with the same cadence and their bites together form one strictly rising series (each bite higher than the previous, no repeated amount) THEN the system SHALL cap the confidence score of every one of those clusters at 59 (`VAMPIRE_THRESHOLD - 1`), so the merchant is at most a possible vampire and never a vampire

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a statement has no indicator column (signed amounts, split debit/credit columns, positive-is-charge credit-card exports) THEN the system SHALL CONTINUE TO classify debits and credits exactly as before

3.2 WHEN a row's indicator value is empty or not in the debit/credit vocabulary THEN the system SHALL CONTINUE TO classify the row by the amount's sign convention

3.3 WHEN a row has a zero amount THEN the system SHALL CONTINUE TO treat it as a debit (free-trial rule), also when the statement has an indicator column

3.4 WHEN a statement uses a header already recognized (`desc`, `concept`, `descripcion`, `merchant`, `payee`, `title`, `amount`, `monto`, `importe`, `total`, `debit`, `credit`) THEN the system SHALL CONTINUE TO resolve the same columns, and a header-matched description SHALL still win over the widest-text fallback

3.5 WHEN dates are `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD` (with or without a time part) THEN the system SHALL CONTINUE TO infer and parse them exactly as before, including `DATE_FORMAT_AMBIGUOUS` for undecidable slash dates

3.6 WHEN a candidate has 3 or more bites, or has a catalog match THEN the system SHALL CONTINUE TO receive the same confidence score as before (including catalog-backed 2-bite series such as yearly memberships)

3.7 WHEN any fixture in `tests/fixtures/banks/` other than `itau-br.csv` and `ing-nl.csv` is run THEN the system SHALL CONTINUE TO detect all 51 of its expected subscriptions and nothing else as a vampire (51/51)

3.8 WHEN any of the 5 in-app samples in `public/samples/` is run THEN the system SHALL CONTINUE TO produce exactly the same vampire ids as before this fix, as captured in the baseline taken before any engine change

3.9 WHEN the engine runs THEN the system SHALL CONTINUE TO be pure TypeScript with no React imports, store money as integer cents, store dates as ISO strings, never throw, and never send transaction data over the network

3.10 WHEN a merchant has a catalog match (for example Netflix with 13,99 x5 then 15,49 x3), has a price-increase series with a plateau of equal amounts, or has several plans that are each flat (for example "Videoland" 7,99 and "Videoland Extra Kids" 4,99) THEN the system SHALL CONTINUE TO score each cluster as before and keep its vampires
