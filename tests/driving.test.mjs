import test from 'node:test';
import assert from 'node:assert/strict';
import {routeSample,routeLength,routeGuidePath,projectLocal,scenePosition,VEHICLE_SCALE,GROUND_PITCH} from '../src/driving.js';
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

test('route distance gives uniform ground speed through straights and smooth corners',()=>{
 let least=Infinity,most=0,turns=0,straights=0;
 for(let distance=0;distance<routeLength;distance+=2){
  const a=routeSample(distance),b=routeSample(distance+1),step=Math.hypot(b.x-a.x,b.z-a.z);
  least=Math.min(least,step);most=Math.max(most,step);
  const middle=routeSample(distance+.5),heading=Math.atan2(b.x-a.x,b.z-a.z);
  assert.ok(Math.abs(angleDifference(heading,middle.heading))<.0001,'The car must face its actual direction of travel');
  assert.ok(Math.abs(Math.hypot(a.dx,a.dz)-1)<1e-10);
  if(a.curvature>0)turns++;else straights++;
 }
 assert.ok(least>.9998&&most<1.0001,JSON.stringify({least,most}));assert.ok(turns>100&&straights>100);
});

test('the perimeter fills its bounds and closes with continuous position, tangent, and curvature',()=>{
 let xmin=Infinity,xmax=-Infinity,zmin=Infinity,zmax=-Infinity;
 for(let d=0;d<routeLength;d+=1){const p=routeSample(d);xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);zmin=Math.min(zmin,p.z);zmax=Math.max(zmax,p.z)}
 assert.ok(Math.abs(xmin+390)<.001&&Math.abs(xmax-390)<.001);assert.ok(Math.abs(zmin+280)<.001&&Math.abs(zmax-280)<.001);
 const before=routeSample(routeLength-.001),after=routeSample(.001);
 assert.ok(Math.hypot(before.x-after.x,before.z-after.z)<.0021);assert.ok(Math.abs(angleDifference(before.heading,after.heading))<1e-8);assert.ok(Math.abs(before.curvature-after.curvature)<2e-7);
 assert.deepEqual(routeSample(-20),routeSample(routeLength-20));assert.deepEqual(routeSample(routeLength),routeSample(0));assert.match(routeGuidePath(),/^M.* Z$/);
});

test('steering curvature eases into and out of the perimeter bends',()=>{
 let previous=routeSample(0).curvature,maxJump=0;
 for(let d=.1;d<routeLength;d+=.1){const curve=routeSample(d).curvature;maxJump=Math.max(maxJump,Math.abs(curve-previous));previous=curve}
 assert.ok(maxJump<.000015,'Tangent joins must not introduce a steering step');
});

test('local exits rotate with heading and the entire car and outside robot fit the driving field',()=>{
 for(const [heading,x,y] of [[0,0,85],[Math.PI/2,170,0],[Math.PI,0,-85],[Math.PI*1.5,-170,0]]){
  const p=projectLocal(0,170,heading);assert.ok(Math.abs(p.x-x)<1e-9&&Math.abs(p.y-y)<1e-9);
 }
 for(let d=0;d<routeLength;d+=5){
  const road=routeSample(d),scene=scenePosition(road);
  assert.equal(scene.x,road.x);assert.equal(scene.y,480+road.z*GROUND_PITCH-480*VEHICLE_SCALE);
  const bounds=[[-140,190,-280],[140,190,-280],[-140,482,110],[140,482,110],[-100,0,70],[100,0,270],[-100,480,70],[100,480,270]];
  for(const [x,y,z] of bounds){const p=projectLocal(x,z,road.heading);const sx=scene.x+p.x*scene.scale,sy=scene.y+(y+p.y)*scene.scale;assert.ok(sx>-620&&sx<620&&sy>-90&&sy<760,JSON.stringify({d,sx,sy}))}
 }
});
