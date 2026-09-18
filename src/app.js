import './widget.js';
const robot=document.querySelector('robby-robot');
const status=document.querySelector('#status'),caption=document.querySelector('#caption');
const modeNames={idle:'Standing by',walk:'Walking',talk:'Original film voice',lights:'Head mechanisms',showcase:'Full sequence'};
const description={idle:'Choose a performance to begin.',walk:'Short alternating steps, a gentle sway, and restrained arm movement.',talk:'Registers cycle, then the original film voice begins.',lights:'Scanners, gyros and registers move. Speaking tubes stay dark.',showcase:'Walking → register cue → original voice → head mechanisms.'};
const clip=document.querySelector('#original-voice');
if(clip?.getAttribute('src'))robot.setClip(clip.getAttribute('src'),clip.dataset.caption);
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{const m=b.dataset.mode;m==='drive'?robot.drive():robot.perform(m)}));
document.querySelector('#stop').addEventListener('click',()=>robot.stop());
document.querySelector('#park-vehicle').addEventListener('click',()=>robot.stop());
document.querySelector('#leave-vehicle').addEventListener('click',()=>robot.walk());
document.querySelector('#sound').addEventListener('click',()=>robot.setVoice(robot.controller.state.muted));
document.querySelector('#motion').checked=robot.controller.state.reducedMotion;
document.querySelector('#motion').addEventListener('change',e=>robot.setMotion(!e.target.checked));
document.querySelector('#angle').addEventListener('input',e=>robot.face(Number(e.target.value)));
document.querySelector('#tempo').addEventListener('input',e=>robot.setSpeed(Number(e.target.value)));
document.querySelector('#reset-view').addEventListener('click',()=>{robot.face(-12);robot.setZoom(1)});
document.querySelector('#reference-toggle').addEventListener('click',()=>document.querySelector('#research').showModal());
document.querySelector('#close-research').addEventListener('click',()=>document.querySelector('#research').close());
const update=()=>{const s=robot.debugState();const inVehicleScene=!!s.vehiclePhase;
 document.body.classList.toggle('vehicle-view',inVehicleScene);
 document.querySelector('#reset-view').hidden=inVehicleScene;
 document.querySelector('.stage-title h1').textContent=inVehicleScene?'A drive on Altair IV.':'Meet Robby.';
 document.querySelector('.stage-title p').textContent=inVehicleScene?'Room to roam. A circular route.':'A classic, set in motion.';
 status.textContent=inVehicleScene?'Vehicle · '+s.vehiclePhase:modeNames[s.mode]||'Standing by';
 caption.textContent=s.vehicleAction==='exit'?'The vehicle stops, the front grille opens, and Robby steps out.'
  :s.vehicleAction==='parked'&&s.vehicleOutside?'Robby is outside. The vehicle stays parked with its front grille open.'
  :s.vehicleAction==='parked'?'The vehicle is stopped. Choose Exit & walk to open the grille and step out.'
  :inVehicleScene&&s.vehiclePhase==='driving'?'Robby drives a continuous loop. Choose Exit & walk to stop and step out.'
  :inVehicleScene?'Robby boards through the open front grille and stands in the driving position.'
  :s.caption||description[s.mode]||description.idle;
 document.querySelector('#sound').textContent=s.muted?'Sound off':'Sound on';document.querySelector('#sound').setAttribute('aria-pressed',String(!s.muted));
 document.querySelector('#angle').disabled=!!s.vehiclePhase;document.querySelector('#angle').value=s.angle;document.querySelector('#angle-value').textContent=s.vehiclePhase?'Auto':Math.round(s.angle)+'°';document.querySelector('#tempo-value').textContent=s.speed.toFixed(1)+'×';
 document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode==='drive'?s.vehicleAction==='drive':s.vehicleAction!=='drive'&&b.dataset.mode===s.mode;b.setAttribute('aria-pressed',String(active));});
 document.querySelector('#leave-vehicle').disabled=s.vehicleAction==='exit'||(s.vehicleAction==='parked'&&s.vehicleOutside);
 document.querySelector('#motion-note').hidden=!s.reducedMotion;
};robot.addEventListener('robotstatechange',update);update();
