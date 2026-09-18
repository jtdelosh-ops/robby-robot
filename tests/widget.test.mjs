import test from 'node:test';
import assert from 'node:assert/strict';
class TrackedTarget extends EventTarget{constructor(){super();this.callbacks=new Map()}addEventListener(type,fn){super.addEventListener(type,fn);if(!this.callbacks.has(type))this.callbacks.set(type,new Set());this.callbacks.get(type).add(fn)}removeEventListener(type,fn){super.removeEventListener(type,fn);this.callbacks.get(type)?.delete(fn)}count(){return [...this.callbacks.values()].reduce((n,s)=>n+s.size,0)}}
const doc=new TrackedTarget();doc.hidden=false;globalThis.document=doc;
const media=new TrackedTarget();media.matches=false;globalThis.matchMedia=()=>media;
let nextFrame=0;globalThis.requestAnimationFrame=()=>++nextFrame;globalThis.cancelAnimationFrame=()=>{};
class FakeElement extends EventTarget{constructor(){super();this.attrs=new Map();this.hidden=false}attachShadow(){const svg={innerHTML:'',attrs:new Map(),setAttribute(k,v){this.attrs.set(k,v)},addEventListener(){},setPointerCapture(){}};this.shadowRoot={innerHTML:'',querySelector(){return svg}};return this.shadowRoot}setAttribute(k,v){this.attrs.set(k,v)}remove(){this.disconnectedCallback()}}
globalThis.HTMLElement=FakeElement;
const registry=new Map();globalThis.customElements={get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)};
const {RobbyRobot}=await import('../src/widget.js');
const {routeSample,routeLength,routeStartDistance,projectLocal}=await import('../src/driving.js');
const advance=(robot,seconds)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)robot._tick((robot.last||1)+50)};
test('front gate opens, robot approaches through its centre, turns, closes, then drives',()=>{
 const robot=new RobbyRobot();robot.connectedCallback();robot.drive();robot._tick(1);
 assert.equal(robot.debugState().vehiclePhase,'opening gate');assert.match(robot.svg.innerHTML,/data-gate="0"/);
 advance(robot,1.55);assert.equal(robot.debugState().vehiclePhase,'boarding');assert.match(robot.svg.innerHTML,/data-gate="1"/);
 const depth1=Number(robot.svg.innerHTML.match(/data-depth="([\d.]+)"/)[1]);assert.ok(depth1>50);
 advance(robot,2);const depth2=Number(robot.svg.innerHTML.match(/data-depth="([\d.]+)"/)[1]);assert.ok(depth2<depth1&&depth2>0);
 advance(robot,1.1);assert.equal(robot.debugState().vehiclePhase,'turning into position');assert.match(robot.svg.innerHTML,/data-depth="0.00"/);
 advance(robot,1);assert.equal(robot.debugState().vehiclePhase,'closing gate');
 advance(robot,1.3);assert.equal(robot.debugState().vehiclePhase,'driving');assert.match(robot.svg.innerHTML,/data-gate="0"/);assert.ok(Math.abs(robot.renderer.yaw-robot.debugState().vehicleHeading)<.001);
 robot.stop();robot._tick(robot.last+50);assert.equal(robot.debugState().vehiclePhase,'parked');assert.match(robot.svg.innerHTML,/vehicle-front/);robot.destroy();
});
test('removal releases listeners; reconnection starts a fresh muted controller',()=>{
 const robot=new RobbyRobot();robot.setClip('test-original.mp3','Test original clip');robot.connectedCallback();assert.equal(doc.count(),2);assert.equal(media.count(),1);
 robot.disconnectedCallback();assert.equal(doc.count(),0);assert.equal(media.count(),0);assert.equal(robot.controller._destroyed,true);
 robot.connectedCallback();assert.equal(doc.count(),2);assert.equal(media.count(),1);assert.equal(robot.controller.state.muted,true);assert.equal(robot.controller.state.clipAvailable,true);
 robot.destroy();assert.equal(doc.count(),0);assert.equal(media.count(),0);
});
test('reduced motion parks the enclosed standing driver and Stop freezes mechanisms',()=>{
 const robot=new RobbyRobot();robot.connectedCallback();robot.setMotion(false);robot.drive();robot._tick(1);const frozen=robot.svg.innerHTML;advance(robot,1);assert.equal(robot.debugState().vehiclePhase,'parked');assert.equal(robot.svg.innerHTML,frozen);
 robot.stop();robot._tick(robot.last+50);const stopped=robot.svg.innerHTML;advance(robot,1);assert.equal(robot.svg.innerHTML,stopped);robot.destroy();
});
test('vehicle makes a visible traverse at default pace and removed actions are unavailable',()=>{
 const robot=new RobbyRobot();robot.connectedCallback();assert.equal(robot.energy,undefined);assert.equal(robot.controller.setMode('energy'),false);
 robot.drive();robot._tick(1);advance(robot,6.8);assert.ok(robot.debugState().vehicleSpeed>0&&robot.debugState().vehicleSpeed<40,'Start should accelerate gently');advance(robot,1.1);
 const before=robot.debugState();advance(robot,.4);const after=robot.debugState();assert.ok(Math.abs(after.vehicleDistance-before.vehicleDistance-60)<.01,'Cruise pace should stay at 150 world units/second');robot.destroy();
});

test('Walk freezes the car, opens the gate, walks out, and keeps the open car parked',()=>{
 const robot=new RobbyRobot();robot.connectedCallback();robot.drive();robot._tick(1);advance(robot,8.2);
 const before=robot.debugState(),view=robot.svg.attrs.get('viewBox');
 const phases=[];robot.addEventListener('robotstatechange',e=>phases.push(e.detail.vehiclePhase));
 robot.perform('walk');assert.equal(robot.debugState().vehicleAction,'exit');
 assert.deepEqual(robot.debugState().vehiclePosition,before.vehiclePosition);assert.equal(robot.debugState().vehicleWheel,before.vehicleWheel);
 assert.deepEqual(robot.debugState().robotPosition,before.robotPosition);
 const observed=[];const render=robot.renderer.render.bind(robot.renderer);robot.renderer.render=s=>{observed.push({lights:s.lightLevel,speech:s.speechLevel,registers:s.registerLevel,walk:s.walkWeight});render(s)};
 advance(robot,.65);let state=robot.debugState();assert.equal(state.vehiclePhase,'opening for exit');assert.ok(state.vehicleGate>0&&state.vehicleGate<1);assert.equal(state.robotPosition.depth,0);assert.equal(observed.at(-1).walk,0);
 const elapsed=robot._exit.elapsed;robot.walk();assert.equal(robot._exit.elapsed,elapsed,'Repeated Walk cannot restart exit');
 advance(robot,.85);state=robot.debugState();assert.equal(state.vehicleGate,1);assert.ok(state.robotPosition.depth<1);
 advance(robot,1.2);state=robot.debugState();assert.equal(state.vehiclePhase,'walking out');assert.ok(state.robotPosition.depth>10&&state.robotPosition.depth<170);
 advance(robot,2);state=robot.debugState();assert.equal(state.vehicleAction,'parked');assert.equal(state.vehiclePhase,'walking outside');assert.equal(state.vehicleOutside,true);assert.ok(state.robotPosition.depth>=170);assert.equal(state.vehicleGate,1);
 const outside=state.robotPosition;advance(robot,.8);assert.notDeepEqual(robot.debugState().robotPosition,outside,'Robby continues walking outside');
 assert.deepEqual(robot.debugState().vehiclePosition,before.vehiclePosition);assert.equal(robot.debugState().vehicleWheel,before.vehicleWheel);
 assert.equal(robot.svg.attrs.get('viewBox'),view);assert.match(robot.svg.innerHTML,/vehicle-front/);assert.match(robot.svg.innerHTML,/vehicle-ground-loop/);
 assert.ok(phases.includes('opening for exit')&&phases.includes('walking out')&&phases.includes('walking outside'));
 assert.ok(phases.length<12,'Phase events must not cause per-frame UI reflow');assert.ok(observed.every(s=>s.lights===0&&s.speech===0&&s.registers===0));robot.destroy();
});

test('Walk during gate opening, boarding, turning, or closing continues from the displayed pose',()=>{
 for(const moment of [.5,2.6,4.7,5.9]){
  const robot=new RobbyRobot();robot.connectedCallback();robot.drive();robot._tick(1);advance(robot,moment);
  const before=robot.debugState();robot.walk();assert.deepEqual(robot.debugState().robotPosition,before.robotPosition);assert.equal(robot.debugState().vehicleGate,before.vehicleGate);
  advance(robot,.25);const partial=robot.debugState();assert.ok(partial.vehicleGate>=before.vehicleGate);assert.deepEqual(partial.vehiclePosition,before.vehiclePosition);assert.equal(partial.vehicleWheel,before.vehicleWheel);
  advance(robot,5);assert.equal(robot.debugState().vehicleOutside,true);assert.equal(robot.debugState().vehicleGate,1);robot.destroy();
 }
});

test('Stop cancels exit without removing the scene, and Drive boards from that position',()=>{
 const robot=new RobbyRobot();robot.connectedCallback();robot.drive();robot._tick(1);advance(robot,8);robot.walk();advance(robot,2.4);
 robot.stop();const stopped=robot.debugState();robot._tick(robot.last+50);const html=robot.svg.innerHTML;
 advance(robot,2);assert.equal(robot.debugState().vehicleAction,'parked');assert.equal(robot.debugState().vehiclePhase,'parked');assert.deepEqual(robot.debugState().robotPosition,stopped.robotPosition);assert.equal(robot.svg.innerHTML,html);
 robot.drive();assert.deepEqual(robot.debugState().vehiclePosition,stopped.vehiclePosition);assert.deepEqual(robot.debugState().robotPosition,stopped.robotPosition);assert.equal(robot.debugState().vehicleWheel,stopped.vehicleWheel);
 advance(robot,7.3);assert.equal(robot.debugState().vehiclePhase,'driving');assert.equal(robot.debugState().robotPosition.depth,0);assert.equal(robot.debugState().vehicleGate,0);assert.ok(robot.debugState().vehicleWheel>stopped.vehicleWheel);robot.destroy();
});

test('reduced-motion Walk immediately leaves Robby stationary outside the open parked car',()=>{
 const robot=new RobbyRobot();robot.connectedCallback();robot.drive();robot._tick(1);advance(robot,8.1);const before=robot.debugState();
 robot.setMotion(false);robot.walk();robot._tick(robot.last+50);let state=robot.debugState();assert.equal(state.vehicleAction,'parked');assert.equal(state.vehiclePhase,'parked');assert.equal(state.vehicleOutside,true);assert.equal(state.vehicleGate,1);assert.equal(state.robotPosition.depth,170);assert.deepEqual(state.vehiclePosition,before.vehiclePosition);assert.equal(state.vehicleWheel,before.vehicleWheel);
 const html=robot.svg.innerHTML;advance(robot,2);assert.equal(robot.svg.innerHTML,html);robot.destroy();
 const second=new RobbyRobot();second.connectedCallback();second.drive();second._tick(1);advance(second,8);second.walk();advance(second,.4);second.setMotion(false);assert.equal(second.debugState().vehicleOutside,true);assert.equal(second.debugState().vehicleGate,1);second.destroy();
});

test('driving turns with the route tangent, keeps a steady pace, and links wheels to distance',()=>{
 const robot=new RobbyRobot();robot.connectedCallback();robot.drive();robot._tick(1);advance(robot,7.7);
 const points=[robot.debugState()];
 for(let i=0;i<12;i++){advance(robot,.7);points.push(robot.debugState())}
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],road=routeSample(b.vehicleDistance);
  assert.ok(Math.abs(b.vehicleDistance-a.vehicleDistance-105)<.001);assert.ok(Math.abs((b.vehicleWheel-a.vehicleWheel)*17.5-105)<.001);
  assert.equal(b.vehicleHeading,road.heading);assert.equal(b.robotPosition.heading,b.vehicleHeading);assert.equal(b.vehicleSteering,Math.atan(110*road.curvature));
 }
 assert.ok(points.some(p=>p.vehicleSteering>.5)&&points.some(p=>p.vehicleSteering===0));assert.ok(points.at(-1).vehicleHeading-points[0].vehicleHeading>2);
 assert.equal(robot.svg.attrs.get('viewBox'),'-620 -90 1240 850');
 robot.stop();const stopped=robot.debugState();robot.drive();assert.deepEqual(robot.debugState().robotPosition,stopped.robotPosition);assert.equal(robot.debugState().vehicleHeading,stopped.vehicleHeading);assert.equal(robot.debugState().vehiclePhase,'driving','Already enclosed driver resumes without replaying entry');
 robot._tick(robot.last+50);assert.ok(robot.svg.innerHTML.indexOf('class="boarding-robot"')<robot.svg.innerHTML.indexOf('class="vehicle-front"'));robot.destroy();
});

test('front-door exit is local to the car at every heading, including the far side',()=>{
 for(let quarter=0;quarter<4;quarter++){
  const robot=new RobbyRobot();robot.connectedCallback();robot.drive();robot._tick(1);
  robot._routeDistance=routeStartDistance+quarter*routeLength/4;robot.vehicleTime=6.7;robot._vehiclePose=robot._drivePose(6.7);robot._renderVehicle({...robot.controller.state,time:0});
  const before=robot.debugState();robot.walk();advance(robot,4.05);const out=robot.debugState(),offset=projectLocal(out.robotPosition.x,out.robotPosition.depth,before.vehicleHeading);
  assert.equal(out.vehicleHeading,before.vehicleHeading);assert.equal(out.vehicleWheel,before.vehicleWheel);assert.deepEqual(out.vehiclePosition,before.vehiclePosition);assert.ok(out.robotPosition.depth>=170);
  assert.ok(Math.abs(out.robotGroundPosition.x-before.vehicleWorldPosition.x-offset.x*.7)<1e-9);assert.ok(Math.abs(out.robotGroundPosition.z-before.vehicleWorldPosition.z-offset.depth*.7)<1e-9);
  assert.match(robot.svg.innerHTML,new RegExp('data-camera-depth="'+offset.depth.toFixed(2)+'"'));robot.destroy();
 }
});

test('reduced motion freezes the exact current driving or boarding pose without a jump',()=>{
 for(const moment of [2.4,9.2]){
  const robot=new RobbyRobot();robot.connectedCallback();robot.drive();robot._tick(1);advance(robot,moment);const before=robot.debugState();robot.setMotion(false);advance(robot,1);const after=robot.debugState();
  assert.deepEqual(after.vehiclePosition,before.vehiclePosition);assert.deepEqual(after.robotPosition,before.robotPosition);assert.equal(after.vehicleHeading,before.vehicleHeading);assert.equal(after.vehicleGate,before.vehicleGate);assert.equal(after.vehicleWheel,before.vehicleWheel);assert.equal(after.vehicleSpeed,0);robot.destroy();
 }
});

test('driving distance and acceleration remain correct with slow or irregular frame intervals',()=>{
 const results=[];
 for(const interval of [.016,.23,1.1]){
  const robot=new RobbyRobot();robot.connectedCallback();robot._renderVehicle=()=>{};robot.drive();robot._tick(1);robot._tick(6701);
  for(let elapsed=0;elapsed<3-1e-10;){const dt=Math.min(interval,3-elapsed);elapsed+=dt;robot._tick(robot.last+dt*1000)}
  results.push(robot.debugState());robot.destroy();
 }
 const expected=routeStartDistance+387.5;
 for(const state of results){assert.ok(Math.abs(state.vehicleDistance-expected)<1e-7);assert.equal(state.vehicleSpeed,150);assert.ok(Math.abs(state.vehicleWheel*17.5-387.5)<1e-7)}
});

test('stopped and reduced-motion vehicle frames reuse their SVG until the visible pose changes',()=>{
 const robot=new RobbyRobot();robot.connectedCallback();let renders=0;
 const render=robot.renderer.render.bind(robot.renderer);robot.renderer.render=s=>{renders++;render(s)};
 robot.drive();robot._tick(1);advance(robot,8);robot.stop();robot._tick(robot.last+50);const parked=renders,html=robot.svg.innerHTML;
 advance(robot,2);assert.equal(renders,parked);assert.equal(robot.svg.innerHTML,html);
 robot.drive();advance(robot,.4);assert.ok(renders>parked);robot.setMotion(false);robot._tick(robot.last+50);const reduced=renders;
 advance(robot,2);assert.equal(renders,reduced);
 robot.perform('idle');robot._tick(robot.last+50);robot.drive();robot._tick(robot.last+50);assert.match(robot.svg.innerHTML,/vehicle-front/);assert.ok(renders>reduced,'Leaving the scene must invalidate its cached frame');robot.destroy();
});
