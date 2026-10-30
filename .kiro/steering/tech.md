# Tech stack

- Vite + React 18 + TypeScript (strict mode)
- Styling: CSS modules or plain CSS with design tokens (CSS variables)
- Animation: Framer Motion
- CSV parsing: Papa Parse
- Tests: Vitest + fast-check (property-based tests for the detection engine)
- Persistence: localStorage only (user decisions), with a "wipe everything" button
- Deploy: static site on AWS Amplify Hosting

## Rules
- NEVER send transaction data over the network. No fetch/XHR with user data.
- The detection engine is pure TypeScript functions with no React imports, fully unit tested.
- Money is stored as integer cents, never floats.
- Dates are parsed into ISO strings; support DD/MM/YYYY, MM/DD/YYYY and YYYY-MM-DD.
- Amounts may use comma or dot as decimal separator (Latin American and US banks).
- Keep components small; one component per file.
