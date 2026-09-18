import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
// Local ES modules are wrapped in isolated scopes for a dependency-free
// file:// deliverable. Module imports remain available for development/tests.
const modules=[['performance',['PerformanceController']],['robot',['RobbyRenderer']],['vehicle',['renderVehicle']],['driving',['routeSample','routeLength','routeStartDistance','routeGuidePath','projectLocal','scenePosition','VEHICLE_SCALE','GROUND_PITCH']],['widget',['RobbyRobot']]];
const withoutImports=source=>source.replace(/^import\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]+['"];?\r?$/gm,'');
const bundle=modules.map(([file,names])=>{const binding=names.length===1?names[0]:`{${names.join(',')}}`;return `const ${binding}=(()=>{\n${withoutImports(read('src/'+file+'.js')).replace(/\bexport (?=class |function |const |let )/g,'')}\nreturn ${binding};})();`}).join('\n');
const app=withoutImports(read('src/app.js'));
const script=`(()=>{\n${bundle}\n(()=>{${app}})();\n})();`;
const voice=fs.existsSync(path.join(root,'assets/voice.mp3'))?'data:audio/mpeg;base64,'+fs.readFileSync(path.join(root,'assets/voice.mp3')).toString('base64'):'';
const ref='data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/robby-reference.png')).toString('base64');
const html=read('src/demo.html').replace('/*STYLE*/',()=>read('src/style.css')).replace('/*VOICE*/',()=>voice).replace('/*CAPTION*/','For your convenience, I am monitored to respond to the name Robby.').replace('/*REFERENCE*/',()=>ref).replace('/*SCRIPT*/',()=>script.replaceAll('</script','<\\/script'));
fs.writeFileSync(path.join(root,'dist/robby-demo.html'),html);
fs.writeFileSync(path.join(root,'dist/robby-robot.js'),`(()=>{\n${bundle}\n})();`);
fs.copyFileSync(path.join(root,'dist/robby-demo.html'),path.join(root,'index.html'));
console.log(JSON.stringify({htmlBytes:Buffer.byteLength(html),originalVoiceBundled:!!voice}));
