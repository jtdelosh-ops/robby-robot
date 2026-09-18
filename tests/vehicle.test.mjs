import test from 'node:test';
import assert from 'node:assert/strict';
import {projectVehiclePoint,renderVehicle} from '../src/vehicle.js';

const paths=markup=>[...markup.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(m=>m[1]);
const depths=markup=>[...markup.matchAll(/data-surface-depth="([^"]+)"/g)].map(m=>Number(m[1]));
const sorted=values=>values.every((value,i)=>!i||value>=values[i-1]-.001);

test('projection turns local forward movement with heading and preserves vertical height',()=>{
  const front=projectVehiclePoint(10,300,80,0,.5);
  assert.deepEqual(front,[10,340,80]);
  const side=projectVehiclePoint(10,300,80,Math.PI/2,.5);
  assert.ok(Math.abs(side[0]-80)<1e-10);
  assert.ok(Math.abs(side[1]-295)<1e-10);
  assert.ok(Math.abs(side[2]+10)<1e-10);
});

test('all four cardinal headings have distinct actual geometry and a visible chassis',()=>{
  const poses=[0,Math.PI/2,Math.PI,Math.PI*1.5].map(heading=>renderVehicle({heading}));
  assert.equal(new Set(poses.map(v=>paths(v.back+v.front).join('|'))).size,4);
  for(const v of poses) {
    assert.match(v.back+v.front,/class="vehicle-chassis"/);
    assert.match(v.back+v.front,/vehicle-wheel-tread/);
    assert.doesNotMatch(v.back+v.front,/NaN|Infinity|scale\(-1|rotate\(/);
  }
});

test('projected surfaces remain depth-sorted on either side of a moving driver',()=>{
  for(const heading of [0,.45,Math.PI/2,Math.PI,Math.PI*1.5])for(const robotDepth of [-170,0,170]) {
    const v=renderVehicle({heading,robotDepth,gate:.4});
    const far=depths(v.back),near=depths(v.front);
    assert.ok(sorted(far)&&sorted(near));
    assert.ok(far.every(d=>d<=robotDepth+.001));
    assert.ok(near.every(d=>d>=robotDepth-.001));
  }
});

test('both tiers open outward and clear the forward central entrance',()=>{
  const closed=renderVehicle({gate:0}),open=renderVehicle({gate:1});
  assert.match(closed.front,/data-gate="0"/);
  assert.match(open.front,/data-gate="1"/);
  const leaves=markup=>[...markup.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*class="[^"]*vehicle-gate-leaf[^"]*"/g)].map(m=>m[1]);
  const xCoordinates=ds=>ds.flatMap(d=>d.replace(/[ML]/g,' ').trim().split(/\s+/).map(pair=>Number(pair.split(',')[0])));
  const cx=xCoordinates(leaves(closed.back+closed.front)),ox=xCoordinates(leaves(open.back+open.front));
  assert.ok(cx.some(x=>Math.abs(x)<2));
  assert.ok(ox.every(x=>Math.abs(x)>85));
  assert.ok(Math.max(...ox)>190&&Math.min(...ox)<-190);
});

test('steering changes front wheel geometry while wheel distance rotates the spokes',()=>{
  const straight=renderVehicle({heading:.8,steering:0,wheel:0});
  const turned=renderVehicle({heading:.8,steering:.3,wheel:0});
  const rolling=renderVehicle({heading:.8,steering:0,wheel:1});
  const axle=(v,name)=>[...((v.back+v.front).matchAll(new RegExp('<path\\b[^>]*\\bd="([^"]+)"[^>]*data-axle="'+name+'"','g')))].map(m=>m[1]);
  assert.notDeepEqual(axle(straight,'front'),axle(turned,'front'));
  assert.deepEqual(axle(straight,'rear'),axle(turned,'rear'));
  assert.notDeepEqual(paths(straight.back+straight.front),paths(rolling.back+rolling.front));
});

test('rib paths are batched instead of creating one element per small segment',()=>{
  const v=renderVehicle({heading:.7});
  const markup=v.back+v.front;
  assert.ok((markup.match(/<path /g)||[]).length<900);
  assert.equal((markup.match(/<g /g)||[]).length,2);
  assert.ok(markup.length<240000);
});
