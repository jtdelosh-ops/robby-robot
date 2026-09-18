import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
// The four local ES modules are wrapped in isolated scopes for a dependency-free
// file:// deliverable. Module imports remain available for development/tests.
const modules=[['performance','PerformanceController'],['robot','RobbyRenderer'],['vehicle','renderVehicle'],['widget','RobbyRobot']];
const bundle=modules.map(([file,name])=>`const ${name}=(()=>{\n${read('src/'+file+'.js').replace(/^import .*;\r?$/gm,'').replace(/\bexport (?=class |function )/g,'')}\nreturn ${name};})();`).join('\n');
const app=read('src/app.js').replace(/^import .*;\r?$/gm,'');
const script=`(()=>{\n${bundle}\n(()=>{${app}})();\n})();`;
const voice=fs.existsSync(path.join(root,'assets/voice.mp3'))?'data:audio/mpeg;base64,'+fs.readFileSync(path.join(root,'assets/voice.mp3')).toString('base64'):'';
const ref='data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/robby-reference.png')).toString('base64');
const html=read('src/demo.html').replace('/*STYLE*/',()=>read('src/style.css')).replace('/*VOICE*/',()=>voice).replace('/*CAPTION*/','For your convenience, I am monitored to respond to the name Robby.').replace('/*REFERENCE*/',()=>ref).replace('/*SCRIPT*/',()=>script.replaceAll('</script','<\\/script'));
fs.writeFileSync(path.join(root,'dist/robby-demo.html'),html);
fs.writeFileSync(path.join(root,'dist/robby-robot.js'),`(()=>{\n${bundle}\n})();`);
fs.copyFileSync(path.join(root,'dist/robby-demo.html'),path.join(root,'index.html'));
console.log(JSON.stringify({htmlBytes:Buffer.byteLength(html),originalVoiceBundled:!!voice}));
