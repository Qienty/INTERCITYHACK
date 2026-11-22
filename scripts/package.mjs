import {mkdir,readdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const destination=resolve(root,'dist','xinyun-'+stamp);
// Explicit allowlist: never copy private env, tooling, caches or test output.
const roots=['index.html','app.js','styles.css','studio-design.css','favicon.svg','server.mjs','package.json','.env.example','README.md','ONE_PAGER.md','assets/fonts/geist-regular.ttf','assets/fonts/geist-medium.ttf','assets/fonts/geist-bold.ttf','assets/fonts/OFL.txt'];
const directories=[['lib',/\.mjs$/],['data',/\.(?:mjs|json|xlsx?|csv)$/i],['scripts',/\.(?:mjs|py|txt)$/],['tests',/\.mjs$/]];
const optional=['package-lock.json','修复记录.md','缺陷清单.md','改进建议审查.md','改进实施记录.md','参考网页功能对照.md','参考功能改进实施.md','媒体组合栏与演示测算.md','比赛文档落地与结案报告.md','商务条款与地址筛选.md'];
const files=[...roots];
async function collect(directory,pattern,recursive=false){for(const entry of await readdir(resolve(root,directory),{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isFile()&&pattern.test(entry.name))files.push(path);else if(recursive&&entry.isDirectory()&&!entry.name.startsWith('.')&&entry.name!=='private')await collect(path,pattern,true);}}
for(const [directory,pattern]of directories)await collect(directory,pattern,directory==='data');
const existing=new Set(await readdir(root));for(const name of optional)if(existing.has(name))files.push(name);
await mkdir(destination,{recursive:true});
for(const name of files){const output=resolve(destination,name);await mkdir(dirname(output),{recursive:true});await copyFile(resolve(root,name),output);}
console.log('交付目录：'+destination+'\n共 '+files.length+' 个文件；未包含 .env、.tools、node_modules、Git、缓存、截图及测试产物。');
