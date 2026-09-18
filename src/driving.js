/** Ground-plane route in world units. Distance, not angle, is the clock. */
export const VEHICLE_SCALE=.7;
export const GROUND_PITCH=.5;
const WIDTH=390,DEPTH=280,CORNER=260,STEPS=1024,HALF_PI=Math.PI/2;
const smooth=t=>t*t*(3-2*t);
const curve=[{x:0,z:0}];
for(let i=1;i<=STEPS;i++){
  const heading=HALF_PI*smooth((i-.5)/STEPS),last=curve[i-1],ds=CORNER/STEPS;
  curve.push({x:last.x+Math.sin(heading)*ds,z:last.z+Math.cos(heading)*ds});
}
const inset=(curve[STEPS].x+curve[STEPS].z)/2;
const horizontal=2*(WIDTH-inset),vertical=2*(DEPTH-inset);
const segments=[];
let distance=0,x=-WIDTH,z=-DEPTH+inset;
for(let side=0;side<4;side++){
  const heading=side*HALF_PI,length=side%2?horizontal:vertical;
  segments.push({start:distance,length,x,z,heading,corner:false});
  x+=Math.sin(heading)*length;z+=Math.cos(heading)*length;distance+=length;
  segments.push({start:distance,length:CORNER,x,z,heading,corner:true});
  x+=inset*(Math.cos(heading)+Math.sin(heading));z+=inset*(Math.cos(heading)-Math.sin(heading));distance+=CORNER;
}
export const routeLength=distance;
// Start at a three-quarter view on the lower-left bend, facing into the field.
export const routeStartDistance=vertical+CORNER*.5;

export function routeSample(distance=0){
  const wrapped=((Number(distance)||0)%routeLength+routeLength)%routeLength;
  const segment=segments.find(s=>wrapped<s.start+s.length)||segments.at(-1);
  const at=wrapped-segment.start;
  if(!segment.corner)return {x:segment.x+Math.sin(segment.heading)*at,z:segment.z+Math.cos(segment.heading)*at,
    heading:segment.heading,dx:Math.sin(segment.heading),dz:Math.cos(segment.heading),curvature:0,distance:wrapped};
  const u=at/CORNER,index=Math.min(STEPS-1,Math.floor(u*STEPS)),fraction=u*STEPS-index;
  const a=curve[index],b=curve[index+1],cx=a.x+(b.x-a.x)*fraction,cz=a.z+(b.z-a.z)*fraction;
  const c=Math.cos(segment.heading),s=Math.sin(segment.heading),heading=segment.heading+HALF_PI*smooth(u);
  return {x:segment.x+cx*c+cz*s,z:segment.z-cx*s+cz*c,heading,dx:Math.sin(heading),dz:Math.cos(heading),
    curvature:HALF_PI*6*u*(1-u)/CORNER,distance:wrapped};
}

export function projectLocal(x,z,heading,pitch=GROUND_PITCH){
  const c=Math.cos(heading),s=Math.sin(heading),depth=-x*s+z*c;
  return {x:x*c+z*s,y:depth*pitch,depth};
}

export function scenePosition(sample){
  return {x:sample.x,y:480+sample.z*GROUND_PITCH-480*VEHICLE_SCALE,scale:VEHICLE_SCALE};
}

export function routeGuidePath(){
  const count=320,points=[];
  for(let i=0;i<count;i++){
    const p=routeSample(routeLength*i/count);points.push((i?'L':'M')+p.x.toFixed(2)+' '+(480+p.z*GROUND_PITCH).toFixed(2));
  }
  return points.join(' ')+' Z';
}
