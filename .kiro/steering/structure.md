# Project structure

src/
  engine/        Pure detection logic (parse, normalize, detect, score). No UI.
  data/          Known services catalog (name, aliases, cancel URL, cancel steps) as JSON.
  components/    React components (Crypt, VampireCard, BloodMeter, Uploader, ...)
  i18n/          en.json, es.json
  styles/        Design tokens and global styles
samples/         Fake bank statements for demo and tests. NEVER real data.
tests/           Engine tests (unit + property-based)
