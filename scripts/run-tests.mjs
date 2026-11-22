import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const browser=process.argv.includes('--browser');
const files=(await readdir(resolve(root,'tests'))).filter(name=>browser?/^browser-.*\.mjs$/.test(name):/\.test\.mjs$/.test(name)).sort().map(name=>resolve(root,'tests',name));
if(!files.length)throw new Error('未找到测试文件');
if(browser){for(const file of files){const result=spawnSync(process.execPath,[file],{cwd:root,stdio:'inherit'});if(result.status!==0){process.exitCode=result.status||1;break;}}}
else{const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});process.exitCode=result.status??1;}
