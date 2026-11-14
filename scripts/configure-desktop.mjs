import {writeFile} from 'node:fs/promises';
import {appUrl} from '../desktop/policy.cjs';
const url=appUrl(process.env.H3X_APP_URL||process.argv[2]||'https://h3x-web.h3x-project.workers.dev/');
await writeFile(new URL('../desktop/config.json',import.meta.url),JSON.stringify({appUrl:url+'/'})+'\n');
console.log('Desktop connected to '+url);
