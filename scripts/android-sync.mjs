// Web uygulamasını Android hedefi için derler ve Capacitor projesine kopyalar.
import { execSync } from 'node:child_process';

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
run('npm run build', { NEX_TARGET: 'android' });
run('npx cap sync android');
