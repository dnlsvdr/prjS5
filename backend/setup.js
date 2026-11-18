// Generates local configuration once. Never regenerate the signing key in Phase 2.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
if (existsSync('.env')) {
  console.log('.env already exists; keeping credentials and signing key.');
} else {
  const sample = readFileSync(new URL('.env.example', import.meta.url), 'utf8');
  writeFileSync('.env', sample.replace('REPLACE_WITH_64_RANDOM_HEX_CHARACTERS', randomBytes(32).toString('hex')), { mode: 0o600, flag: 'wx' });
  console.log('Created .env. Edit TEAM_NAME and deployment settings before publishing.');
}
