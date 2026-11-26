# Requirements Document

## Introduction

Vampire Hunter currently accepts bank statements only as CSV files. Many banks export statements as Excel workbooks (.xlsx, .xls). This feature lets the user upload an Excel workbook, converts the first sheet that contains data into the same CSV-like text the existing pipeline already consumes, and runs the existing parse, normalize, detect and score stages unchanged. A CSV and an Excel file holding the same transactions therefore produce identical results. PDF files are rejected with a message that suggests exporting to Excel. All processing stays in the browser, and the Excel reader is loaded lazily so users who only upload CSV files do not download it.

## Glossary

- **Uploader**: The React component that accepts a statement file by drag-and-drop or file picker.
- **Excel_Reader**: The module that reads an Excel workbook in the browser and returns CSV-like text.
- **Workbook**: An Excel file in .xlsx or .xls format.
- **Data_Sheet**: The first sheet in a Workbook, in workbook order, that contains at least one non-empty cell.
- **CSV_Text**: Comma-separated text with one header row followed by data rows, in the form the existing parser accepts.
- **Pipeline**: The existing parse, normalize, detect and score stages in `src/engine`, which operate on CSV_Text.
- **SheetJS**: The `xlsx` library installed from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
- **Excel_Chunk**: The separate JavaScript bundle file that contains SheetJS and the Excel_Reader.
- **Service_Worker**: The `dist/sw.js` script that precaches built assets for offline use.
- **Sample_Statements**: The 5 CSV files served from `public/samples` and offered in the in-app sample picker.
- **Vampire_Id**: The stable identifier the Pipeline assigns to each detected vampire.
- **Cents**: A money amount stored as an integer number of minor currency units.
- **CSP**: The Content-Security-Policy header configured in `customHttp.yml`.
- **README**: The `README.md` file at the repository root.
- **Junk_Rows**: Rows above the real header row of a statement that hold a title, logo text, account number, holder name, date range or blank cells, and that are not column names.
- **Header_Locator**: The pure function in `src/engine` that finds the index of the real header row in a grid of string rows and returns the header row and the data rows below it. The grid comes from either CSV_Text or Excel-derived CSV_Text.
- **Excel_Serial_Date**: A numeric Excel date value, counting days since the Excel epoch (1899-12-30 in the 1900 date system), with an optional fractional day.
- **Excel_Date_Cell**: A cell that SheetJS returns as a JavaScript Date object.
- **Fixture_Generator**: The script `scripts/generate-excel-fixtures.ts` that uses SheetJS to write the Excel fixtures.
- **Excel_Fixtures**: The .xlsx and .xls files in `tests/fixtures/excel/` that the Fixture_Generator writes.
- **App**: The root React component in `src/components/App.tsx`, whose `handleCsv` function receives CSV_Text from the Uploader and calls the Pipeline.
- **readWorkbook**: The function exported by the Excel_Reader that converts Workbook bytes to CSV_Text.
- **Result**: A discriminated value that is either a success holding a value or a failure holding an error, and that is returned instead of throwing.
- **Date_Header_Column**: A column whose header, after accent folding, matches a date keyword from the existing column keyword sets, such as date, fecha, data or datum.
- **Plausible_Serial**: An Excel_Serial_Date that is an integer whose converted calendar year is from 1990 to 2100 inclusive.
- **Precache_Manifest**: The list of asset URLs that the Service_Worker precaches, produced by `build/vite.sw.config.ts`.

## Requirements

### Requirement 1: Upload Excel statements

**User Story:** As a user whose bank exports Excel files, I want to upload a .xlsx or .xls statement, so that I can find my vampire subscriptions without converting the file myself.

#### Acceptance Criteria

1. WHEN the user selects or drops a file with the extension .xlsx or .xls, THE Uploader SHALL pass the file to the Excel_Reader.
2. WHEN the user selects or drops a file with the extension .csv, THE Uploader SHALL process the file through the existing CSV path.
3. THE Uploader SHALL list .csv, .xlsx and .xls in the accept attribute of the file input.
4. WHEN readWorkbook returns a success Result, THE Uploader SHALL deliver the CSV_Text to the App `handleCsv` function, which also receives CSV file text.

### Requirement 2: Sheet selection

**User Story:** As a user, I want the app to read the sheet that holds my transactions, so that I do not have to pick a sheet or edit the workbook.

#### Acceptance Criteria

1. WHEN a Workbook contains more than one sheet, THE Excel_Reader SHALL read the Data_Sheet.
2. WHEN a Workbook has empty sheets before the first non-empty sheet, THE Excel_Reader SHALL skip the empty sheets.
3. THE Excel_Reader SHALL convert only the Data_Sheet and ignore all later sheets.
4. THE Uploader SHALL process a Workbook without displaying a sheet picker.
5. IF every sheet in a Workbook is empty, THEN THE Uploader SHALL display the translated `errors.parseFailed` message.

### Requirement 3: CSV and Excel parity

**User Story:** As a user, I want Excel and CSV versions of the same statement to give the same results, so that I can trust the findings regardless of file type.

#### Acceptance Criteria

1. THE Excel_Reader SHALL output CSV_Text that the Pipeline accepts without any change to the Pipeline.
2. WHEN a Workbook and a CSV file contain the same header row and the same transaction rows, THE Pipeline SHALL produce identical detected vampires, Vampire_Ids, amounts in Cents and annualized costs for both files.
3. WHEN an Excel cell holds a numeric value and the cell has a date number format, THE Excel_Reader SHALL write the date as an ISO string in the form YYYY-MM-DD.
4. WHEN an Excel cell is an Excel_Date_Cell, THE Excel_Reader SHALL write the date as an ISO string in the form YYYY-MM-DD.
5. WHEN an Excel date is read in a process with any timezone offset from UTC, THE Excel_Reader SHALL write the same calendar date that Excel displays for the cell, with no off-by-one-day error for either the Excel_Serial_Date form or the Excel_Date_Cell form.
6. WHEN an Excel cell holds a numeric amount, THE Excel_Reader SHALL write the amount as a string with exactly 2 decimal digits, a dot as the decimal separator and no thousands separator, so that the value 1500 is written as "1500.00".
7. WHEN an Excel cell holds a text amount that uses a comma as the decimal separator, THE Excel_Reader SHALL write the text unchanged so that the existing amount parser converts the text to Cents.
8. WHEN the Pipeline converts an Excel-derived amount string to Cents, THE Pipeline SHALL produce an integer number of Cents with no floating-point rounding error.
9. WHEN an Excel cell holds text containing a comma, a double quote or a line break, THE Excel_Reader SHALL quote and escape the text so that the CSV parser reads the text as one field.
10. WHEN a Workbook cell is empty, THE Excel_Reader SHALL write an empty field in the corresponding column.
11. THE Excel_Reader SHALL leave the integer Cents values that the Pipeline derives from amounts unaffected by the 2-decimal formatting in criterion 6.
12. WHEN a numeric cell in a Date_Header_Column has no date number format and holds a Plausible_Serial, THE Excel_Reader SHALL convert the value to an ISO date string in the form YYYY-MM-DD.
13. WHEN a numeric cell in a Date_Header_Column has no date number format and does not hold a Plausible_Serial, THE Excel_Reader SHALL write the value as a number.
14. IF a date cannot be read from a Workbook, THEN THE App SHALL show the existing column mapper or display an error, and THE App SHALL continue running without a crash.
15. THE project SHALL include a test in which an unformatted Plausible_Serial in a Date_Header_Column is converted to the expected ISO date.
16. THE project SHALL include a test in which an unformatted numeric value outside the Plausible_Serial range in a Date_Header_Column is left as a number and the App shows the column mapper or an error without crashing.

### Requirement 4: PDF rejection

**User Story:** As a user who uploads a PDF statement, I want a clear message about what to do instead, so that I know how to get a file the app can read.

#### Acceptance Criteria

1. WHEN the user selects or drops a file with the extension .pdf or the MIME type application/pdf, THE Uploader SHALL display a message that says PDF files are not supported and suggests exporting the statement from the bank as Excel (.xlsx or .xls).
2. THE Uploader SHALL provide the PDF message in English in `en.json` and in Spanish in `es.json`.
3. WHEN the user selects or drops a PDF file, THE Uploader SHALL reject the file without loading the Excel_Chunk.
4. WHEN the user selects or drops a file that is not .csv, .xlsx, .xls or .pdf, THE Uploader SHALL display the translated `errors.fileNotCsv` message.
5. THE `errors.fileNotCsv` message in `en.json` SHALL name the accepted formats .csv, .xls and .xlsx.
6. THE `errors.fileNotCsv` message in `es.json` SHALL name the accepted formats .csv, .xls and .xlsx.

### Requirement 5: Excel read errors

**User Story:** As a user, I want a clear error when my Excel file cannot be read, so that I can try another file.

#### Acceptance Criteria

1. IF the Excel_Reader cannot parse a Workbook, THEN THE Uploader SHALL display the translated `errors.parseFailed` message.
2. IF a Workbook is password-protected or corrupt, THEN readWorkbook SHALL return a failure Result.
3. IF the dynamic import of SheetJS fails, THEN readWorkbook SHALL return a failure Result, and THE Uploader SHALL display the translated `errors.parseFailed` message.
4. WHEN the Uploader displays an error for an Excel or PDF file, THE Uploader SHALL leave the application in a state where the user can upload another file.
5. THE readWorkbook function SHALL return a Result for every input and SHALL throw no exception.
6. THE project SHALL include tests in which readWorkbook returns a failure Result for a corrupt Workbook and for a failed dynamic import.

### Requirement 6: Privacy

**User Story:** As a user, I want my bank data to stay on my computer when I upload an Excel file, so that the privacy promise holds for every file type.

#### Acceptance Criteria

1. THE Excel_Reader SHALL read the Workbook from the in-memory file bytes in the browser.
2. THE Excel_Reader SHALL perform no network request that carries user data.
3. THE System SHALL pass the existing `tests/noNetworkScan.test.ts` scan with the Excel_Reader and SheetJS included in the source and in the built bundle.
4. THE System SHALL keep the CSP in `customHttp.yml` unchanged.
5. THE System SHALL keep `customHttp.yml` unchanged.

### Requirement 7: Lazy loading and offline

**User Story:** As a user on a slow or offline connection, I want CSV uploads to stay fast and Excel uploads to work offline, so that the new format does not slow down or break the app.

#### Acceptance Criteria

1. THE Uploader SHALL load SheetJS through a dynamic `import()` that runs only when the user uploads a .xlsx or .xls file.
2. THE build SHALL emit SheetJS and the Excel_Reader in the Excel_Chunk, separate from the main entry bundle.
3. WHEN the user opens the app and uploads only CSV files, THE browser SHALL not request the Excel_Chunk.
4. THE Service_Worker SHALL precache the Excel_Chunk through the Precache_Manifest that `build/vite.sw.config.ts` produces.
5. WHEN the production build completes, THE project SHALL verify that the Precache_Manifest in `dist/sw.js` contains the URL of the Excel_Chunk, using an automated check that fails if the URL is absent.
6. WHILE the browser is offline after the Service_Worker has installed, THE Uploader SHALL read a Workbook using the precached Excel_Chunk.
7. THE project SHALL extend `e2e/offline.spec.ts` with a test that verifies a session that uploads only a CSV file sends no request for the Excel_Chunk.
8. THE project SHALL extend `e2e/offline.spec.ts` with a test that verifies, after the first visit has completed, an Excel upload succeeds while the browser is offline or the server is down.

### Requirement 8: Dependency safety and verification

**User Story:** As a maintainer, I want a safe dependency and verified behavior, so that the new library does not introduce known vulnerabilities or regressions.

#### Acceptance Criteria

1. THE project SHALL install SheetJS from the tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` as a dependency in `package.json`.
2. THE project SHALL NOT depend on the `xlsx` package from the npm registry, including any 0.18.x version.
3. WHEN SheetJS is installed from the tarball, THE maintainer SHALL run `npm audit` and record the full result in the task output.
4. IF `npm audit` reports a vulnerability that affects SheetJS or any dependency added by SheetJS, THEN THE maintainer SHALL report the advisory to the user before the work is marked complete.
5. THE project SHALL keep the 5 Sample_Statements as CSV files and SHALL leave their detected Vampire_Ids unchanged, as verified by `tests/integration.bankFixtures.test.ts`.
6. WHEN the change is complete, THE full existing Vitest suite SHALL pass, with only the assertions on the old file input accept attribute and on the old "not a CSV" message text updated to the new behavior, and with no other change to those test files.
7. THE project SHALL leave the Vampire_Id baselines, `tests/baselines/csp.txt` and all baseline and preservation tests unmodified.
8. THE project SHALL place the automated checks for the Excel_Chunk in `dist` and in the Precache_Manifest in a new test file and SHALL leave `dist.build.test.ts` unmodified.
9. THE project SHALL treat every test that these requirements demand, including every property test, as required and not optional.
10. THE project SHALL include automated tests that compare the Pipeline output of each Excel fixture with the Pipeline output of the equivalent CSV text.
11. THE project SHALL include a fast-check property test in which, for generated statement rows, a CSV built from the rows and an Excel workbook (.xlsx) built from the same rows produce identical vampires, with equal Vampire_Ids, equal amounts in Cents and equal annualized costs.
12. THE project SHALL include a required fast-check property test that verifies the Excel_Reader output for Excel_Serial_Date cells, Excel_Date_Cell cells and amount cells is identical across process timezone settings that include UTC-12:00, UTC+00:00 and UTC+14:00, and THE test SHALL run on both .xlsx and .xls Workbooks.
13. THE README SHALL state that CSV, .xlsx and .xls files are supported and that PDF files are not supported.
14. THE `upload.supportedFormats` key in `en.json` SHALL state that CSV and Excel files are supported.
15. THE `upload.supportedFormats` key in `es.json` SHALL state that CSV and Excel files are supported.
16. THE `errors.parseFailed` message in `en.json` and `es.json` SHALL mention Excel as an accepted format.

### Requirement 9: Header detection with Junk_Rows

**User Story:** As a user whose bank export has a title, logo or account details above the column names, I want the app to find the real header row, so that my statement is read correctly without editing the file.

#### Acceptance Criteria

1. WHEN a statement grid has Junk_Rows above the real header row, THE Header_Locator SHALL return the real header row as the headers and the rows below the real header row as the data rows.
2. THE Header_Locator SHALL select as the real header row the first row that has at least 3 non-empty cells and whose cells, after accent folding, include a date keyword and an amount or description keyword from the existing column keyword sets.
3. WHEN the first row of a statement grid is the real header row, THE Header_Locator SHALL return that row, so that statements without Junk_Rows parse as before.
4. IF no row in the first 30 rows of a statement grid satisfies the header criteria, THEN THE Header_Locator SHALL return the first non-empty row as the header row.
5. THE Header_Locator SHALL handle Junk_Rows that are blank, that have a single filled cell, and that have multiple filled cells of title or account text.
6. WHEN the input is CSV_Text with Junk_Rows, THE App SHALL detect the real header row through the Header_Locator before the Pipeline runs.
7. WHEN the input is Excel-derived CSV_Text with Junk_Rows, THE App SHALL detect the real header row through the same Header_Locator before the Pipeline runs.
8. THE App SHALL invoke the Header_Locator from `handleCsv` at a single call site placed after the `parseCsvText` call, for both CSV and Excel input.
9. THE Header_Locator SHALL contain no React imports and SHALL be a pure function.
10. THE project SHALL include unit tests for the Header_Locator covering CSV_Text with Junk_Rows, Excel-derived CSV_Text with Junk_Rows, no Junk_Rows, and no recognizable header row.
11. THE project SHALL include a fast-check property test in which prepending any number of Junk_Rows from 0 to 10 to a valid statement produces the same vampires, Vampire_Ids and amounts in Cents as the statement without Junk_Rows.
12. WHEN the Header_Locator is added, THE detected Vampire_Ids of the Sample_Statements SHALL remain unchanged.

### Requirement 10: Excel fixtures and generator

**User Story:** As a maintainer, I want reproducible Excel fixtures from at least two bank layouts, so that tests cover real-world workbook shapes.

#### Acceptance Criteria

1. THE Fixture_Generator SHALL use SheetJS to write the Excel_Fixtures.
2. THE Fixture_Generator SHALL write at least 2 distinct bank layouts, each as both a .xlsx file and a .xls file.
3. THE Fixture_Generator SHALL write at least 1 of the bank layouts with Junk_Rows above the header row.
4. THE Fixture_Generator SHALL write at least 1 layout that stores dates as numeric cells with a date number format, so that SheetJS reads the cells as dates, and at least 1 that stores dates as Excel_Date_Cell values.
5. THE Fixture_Generator SHALL write amounts as numeric cells in at least 1 layout.
6. THE Fixture_Generator SHALL use only synthetic data and SHALL contain no real bank data.
7. THE Fixture_Generator SHALL produce, for each Excel fixture, an equivalent CSV fixture in `tests/fixtures/excel/` that holds the same rows.
8. THE project SHALL expose the Fixture_Generator through an npm script in `package.json`.
9. WHEN the Fixture_Generator runs twice, THE Fixture_Generator SHALL write the same cell contents both times.
