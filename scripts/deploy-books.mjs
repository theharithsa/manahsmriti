import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cli = require.resolve('firebase-tools/lib/bin/firebase.js');
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
// Each step must succeed before the next one. The root/default Hosting site is untouched.
run(['hosting:sites:get', 'manahsmriti-books', '--project', 'manahsmriti', '--non-interactive']);
const provision = spawnSync(process.execPath, ['scripts/provision-books.cjs'], { stdio: 'inherit', env: process.env });
if (provision.status !== 0) process.exit(provision.status || 1);
run(['deploy', '--only', 'firestore:rules,hosting:books', '--project', 'manahsmriti', '--non-interactive']);
