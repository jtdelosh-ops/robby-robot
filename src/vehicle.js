/** Original projected SVG landcar study, drawn from the supplied reference photographs.
 * Local x is lateral; +z is the openable front; Robby stands at (0, 480, 0).
 * Insert back before Robby and front after him. No image mirroring or screen rotation.
 */
const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const f=n=>Math.round(n*1000)/1000;
export function projectVehiclePoint(x,y,z,heading=0,pitch=.5) {
  const c=Math.cos(heading),s=Math.sin(heading),depth=-x*s+z*c;
  return [x*c+z*s,y+depth*pitch,depth];
}
export function renderVehicle({gate=0,wheel=0,heading=0,steering=0,pitch=.5,robotDepth=0}={}) {
  const opened=clamp(finite(gate),0,1),h=finite(heading),tilt=clamp(finite(pitch,.5),0,.8);
  const spin=finite(wheel),steer=clamp(finite(steering),-.7,.7),plane=finite(robotDepth),surfaces=[];
  const hc=Math.cos(h),hs=Math.sin(h),depth=p=>-p[0]*hs+p[2]*hc;
  const project=p=>{const d=depth(p);return [p[0]*hc+p[2]*hs,p[1]+d*tilt,d];};
  const relativeDepth=p=>{const d=depth(p)-plane;return Math.abs(d)<1e-7?0:d;};
  const coords=p=>`${f(p[0]*hc+p[2]*hs)},${f(p[1]+depth(p)*tilt)}`;
  const defs=`
  <linearGradient id="rv-silver" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#d8e1df"/><stop offset=".25" stop-color="#94a5aa"/><stop offset=".64" stop-color="#6b818c"/><stop offset="1" stop-color="#3c5665"/></linearGradient>
  <linearGradient id="rv-deck" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c9d5d3"/><stop offset=".45" stop-color="#83989f"/><stop offset="1" stop-color="#465f6c"/></linearGradient>
  <linearGradient id="rv-shroud" gradientUnits="userSpaceOnUse" x1="-180" y1="285" x2="160" y2="560"><stop stop-color="#a3b2b5"/><stop offset=".28" stop-color="#7c919a"/><stop offset=".68" stop-color="#5a7482"/><stop offset="1" stop-color="#3b5868"/></linearGradient>
  <linearGradient id="rv-shroud-top" gradientUnits="userSpaceOnUse" x1="-180" y1="260" x2="170" y2="540"><stop stop-color="#c2ceca"/><stop offset=".48" stop-color="#97a9ad"/><stop offset="1" stop-color="#6b838e"/></linearGradient>
  <linearGradient id="rv-rib" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f0f5e9"/><stop offset=".35" stop-color="#c5d4d3"/><stop offset=".75" stop-color="#80979f"/><stop offset="1" stop-color="#c5d5d6"/></linearGradient>
  <linearGradient id="rv-glass" x1="0" y1="0" x2="1" y2=".4"><stop stop-color="#e7ffff" stop-opacity=".36"/><stop offset=".22" stop-color="#c9edf4" stop-opacity=".07"/><stop offset=".7" stop-color="#efffff" stop-opacity=".025"/><stop offset="1" stop-color="#d7f6fa" stop-opacity=".24"/></linearGradient>
  <radialGradient id="rv-tire"><stop stop-color="#65777e"/><stop offset=".43" stop-color="#293e48"/><stop offset=".67" stop-color="#13252e"/><stop offset="1" stop-color="#061219"/></radialGradient>`;
  // Clip every surface at the driver's depth so an orbit never puts the whole car
  // on one side of him. Intersections are interpolated in the car's local space.
  const clip=(points,side)=>{
    if(side<0&&points.every(p=>relativeDepth(p)===0))return [];
    const out=[];
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length],da=relativeDepth(a)*side,db=relativeDepth(b)*side;
      if(da>=0) out.push(a);
      if((da<0&&db>0)||(da>0&&db<0)) {
        const k=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*k));
      }
    }
    return out;
  };
  const push=(points,markup,side)=>surfaces.push({depth:points.reduce((a,p)=>a+depth(p),0)/points.length,side,markup});
  const polygon=(points,fill,stroke='#8ca3ad',width=.8,attrs='')=>{
    for(const side of [-1,1]) {
      const pp=clip(points,side);if(pp.length<3)continue;
      const projected=pp.map(project),area=Math.abs(projected.reduce((a,p,i)=>{const q=projected[(i+1)%projected.length];return a+p[0]*q[1]-q[0]*p[1];},0));
      if(area<.03)continue;
      push(pp,`<path d="M${pp.map(coords).join(' L')}Z" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" ${attrs}/>`,side);
    }
  };
  const segment=(a,b,color='url(#rv-rib)',width=2,attrs='')=>{
    const da=relativeDepth(a),db=relativeDepth(b);
    if(da*db<0) {const k=da/(da-db),mid=a.map((v,j)=>v+(b[j]-v)*k);segment(a,mid,color,width,attrs);segment(mid,b,color,width,attrs);return;}
    push([a,b],`<path d="M${coords(a)} L${coords(b)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${attrs}/>`,da+db>=0?1:-1);
  };
  const lineStrip=(points,color,width,attrs='')=>{
    // A rib remains one path on each side of the driver, rather than adding a
    // separate DOM element for every short section of its projected curve.
    let run=[],runSide=0;
    const flush=()=>{if(run.length>1)push(run,`<path d="M${run.map(coords).join(' L')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`,runSide);run=[];};
    const append=(a,b)=>{
      const side=relativeDepth(a)+relativeDepth(b)>=0?1:-1;
      if(run.length&&side!==runSide)flush();
      if(!run.length){run=[a];runSide=side;}run.push(b);
    };
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],da=relativeDepth(a),db=relativeDepth(b);
      if(da*db<0){const k=da/(da-db),mid=a.map((v,j)=>v+(b[j]-v)*k);append(a,mid);append(mid,b);}else append(a,b);
    }
    flush();
  };
  const box=(x1,x2,y1,y2,z1,z2,fill='url(#rv-silver)',attrs='',enclosedSides=false)=>{
    const a=[x1,y1,z1],b=[x2,y1,z1],c=[x2,y1,z2],d=[x1,y1,z2],e=[x1,y2,z1],g=[x2,y2,z1],j=[x2,y2,z2],k=[x1,y2,z2];
    const faces=[[e,g,j,k],[a,e,g,b],[b,g,j,c],[c,j,k,d],[d,k,e,a]];
    for(let i=0;i<faces.length;i++){if(enclosedSides&&(i===2||i===4))continue;polygon(faces[i],fill,'#617d89',.8,attrs);}
    polygon([a,b,c,d],'url(#rv-deck)','#c1cfcc',1,attrs);
  };
  const circlePoints=(center,ax,ay,r,n=24)=>Array.from({length:n},(_,i)=>{const a=i*2*Math.PI/n;return center.map((v,j)=>v+r*(Math.cos(a)*ax[j]+Math.sin(a)*ay[j]));});
  // The opaque wheel covers hide everything above their lower clearance edge.
  // Clip that known hidden volume before projection: average-depth painter sorting
  // cannot otherwise guarantee that a large tire face stays behind a curved cover.
  const wheelClearance=474;
  const uncoveredWheel=points=>{
    const out=[];
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length],da=a[1]-wheelClearance,db=b[1]-wheelClearance;
      if(da>=0)out.push(a);
      if(da*db<0){const k=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*k));}
    }
    return out;
  };
  const tireFace=(points,...style)=>{const exposed=uncoveredWheel(points);if(exposed.length>=3)polygon(exposed,...style);};
  // The small exposed tire slivers retain front-axle steering and moving tread.
  for(const z of [-210,37])for(const side of [-1,1]) {
    const turn=z>0?steer:0,cs=Math.cos(turn),ss=Math.sin(turn),center=[side*91,457,z],ax=[cs,0,-ss],radial=[ss,0,cs],vertical=[0,1,0];
    const outer=center.map((v,j)=>v+ax[j]*side*8),inner=center.map((v,j)=>v-ax[j]*side*7);
    const op=circlePoints(outer,radial,vertical,23),ip=circlePoints(inner,radial,vertical,23);
    for(let j=0;j<24;j++)tireFace([ip[j],op[j],op[(j+1)%24],ip[(j+1)%24]],'#15262f','#263c46',.4,'class="vehicle-wheel-tread"');
    tireFace(ip,'#152832','#0a1720',1,'class="vehicle-wheel"');
    tireFace(op,'url(#rv-tire)','#061017',1.1,`class="vehicle-wheel" data-axle="${z>0?'front':'rear'}" data-steering="${f(turn)}"`);
    for(let j=0;j<18;j++) {
      const a=spin+j*2*Math.PI/18,dy=23*Math.sin(a);
      if(center[1]+dy<wheelClearance)continue;
      const contact=radial.map((v,k)=>23*Math.cos(a)*v+dy*vertical[k]);
      segment(inner.map((v,k)=>v+contact[k]),outer.map((v,k)=>v+contact[k]),'#526570',.7,`class="vehicle-wheel-tread-detail" data-wheel="${f(spin)}"`);
    }
  }
  // Rear passenger deck is raised; the front driver's footwell is at Robby's soles.
  // Its old exterior side walls now sit inside the opaque shroud volume. Omit
  // those buried faces so their long average depth cannot repaint a wheel cover.
  box(-87,87,430,459,-252,-82,'url(#rv-silver)','class="vehicle-chassis"',true);
  box(-87,87,448,477,-82,-53,'url(#rv-silver)','class="vehicle-chassis vehicle-step"');
  const floor=[[-88,476,-65],[88,476,-65],...Array.from({length:19},(_,i)=>{const a=-Math.PI/2+i*Math.PI/18;return [90*Math.sin(a),476,90*Math.cos(a)];}).reverse()];
  polygon(floor,'url(#rv-deck)','#c6d3d0',1.4,'class="vehicle-footwell"');
  lineStrip(floor.concat([floor[0]]),'#526f7c',3,'class="vehicle-footwell-rim"');
  // Rounded front and rear wheel shrouds are joined by a low continuous skirt.
  // Narrow sections and bevel faces preserve their volume at every car heading.
  const shroudProfile=[[-263,441],[-259,422],[-251,409],[-239,398],[-225,393],[-211,394],[-198,401],[-186,415],[-177,436],[-163,439],[-124,439],[-86,439],[-73,434],[-66,415],[-55,402],[-41,397],[-23,396],[0,396],[26,397],[48,402],[64,412],[75,431],[79,442]];
  for(const side of [-1,1]) {
    const inside=side*70,shoulder=side*105,outside=side*115;
    for(let i=1;i<shroudProfile.length;i++) {
      const [za,ya]=shroudProfile[i-1],[zb,yb]=shroudProfile[i],attrs=`class="vehicle-wheel-shroud vehicle-side-skirt" data-side="${side}"`;
      polygon([[inside,ya,za],[shoulder,ya,za],[shoulder,yb,zb],[inside,yb,zb]],'url(#rv-shroud-top)','url(#rv-shroud-top)',.35,attrs);
      polygon([[shoulder,ya,za],[outside,ya+6,za],[outside,yb+6,zb],[shoulder,yb,zb]],'url(#rv-shroud-top)','url(#rv-shroud-top)',.35,attrs);
      polygon([[outside,ya+6,za],[outside,474,za],[outside,474,zb],[outside,yb+6,zb]],'url(#rv-shroud)','url(#rv-shroud)',.35,attrs);
      polygon([[inside,ya,za],[inside,yb,zb],[inside,474,zb],[inside,474,za]],'url(#rv-shroud)','url(#rv-shroud)',.35,attrs);
      polygon([[outside,474,za],[shoulder,477,za],[shoulder,477,zb],[outside,474,zb]],'#354f5e','none',0,attrs);
    }
    for(const [z,y] of [shroudProfile[0],shroudProfile.at(-1)])polygon([[inside,y,z],[shoulder,y,z],[outside,y+6,z],[outside,474,z],[shoulder,477,z],[inside,474,z]],'url(#rv-shroud)','#8ca0a7',.6,'class="vehicle-shroud-end"');
    lineStrip(shroudProfile.map(([z,y])=>[shoulder,y+.3,z]),'#c8d5d1',1.25,'class="vehicle-shroud-shoulder"');
    lineStrip(shroudProfile.map(([z,y])=>[outside,y+7,z]),'#8ea4ad',.65,'class="vehicle-shroud-edge"');
    // Separate short trim runs sort with their corresponding section, avoiding
    // a single long bright stroke floating across either of the wheel covers.
    for(let i=1;i<shroudProfile.length;i++)segment([outside,472,shroudProfile[i-1][0]],[outside,472,shroudProfile[i][0]],'#9fb4bc',.8,'class="vehicle-side-trim"');
  }
  box(-87,87,416,451,-255,-249,'url(#rv-silver)','class="vehicle-rear-panel"');
  segment([-83,418,-255],[83,418,-255],'#d8e4dd',2.2);
  for(const x of [-68,68])polygon([[x-7,427,-255.5],[x+7,427,-255.5],[x+7,435,-255.5],[x-7,435,-255.5]],'#64432d','#b89b6c',.8,'class="vehicle-rear-reflector"');
  // Paired seats have solid cushions, transparent backs and slim supports.
  for(const x of [-44,44]) {
    box(x-23,x+23,399,407,-208,-157,'url(#rv-silver)','class="vehicle-seat"');
    for(const dx of [-16,16])segment([x+dx,407,-184],[x+dx,430,-195],'#aac0c4',2,'class="vehicle-seat-support"');
    polygon([[x-25,399,-208],[x-25,355,-224],[x-19,350,-226],[x+19,350,-226],[x+25,355,-224],[x+25,399,-208]],'url(#rv-glass)','#bfd6d9',1.1,'class="vehicle-seat-back"');
    segment([x-20,392,-211],[x-20,359,-223],'#d3e6e6',1,'opacity=".6"');
    // Each windshield stands ahead of its passenger, sweeping back at the crown.
    const shield=[[x-29,409,-126],[x-34,388,-127],[x-32,357,-132],[x-23,334,-140],[x-10,322,-145],[x+6,322,-145],[x+23,334,-140],[x+32,357,-132],[x+34,388,-127],[x+29,409,-126]];
    polygon(shield,'url(#rv-glass)','#cce2e2',1.2,'class="vehicle-windscreen"');
    lineStrip([[x-26,385,-128],[x-24,361,-133],[x-17,343,-139],[x-8,334,-143]],'#e7f6f2',1.8,'opacity=".62" class="vehicle-windscreen-highlight"');
    segment([x-26,410,-126],[x-26,430,-125],'#9eb7c1',2.5);
    segment([x+26,410,-126],[x+26,430,-125],'#9eb7c1',2.5);
    segment([x-28,407,-126],[x+28,407,-126],'#526d7d',2.3);
  }
  // Two tiers of open silver ribs. Rear halves stay fixed; front quarter leaves
  // swing in local 3D about the same side hinge axes, leaving a clear +z entrance.
  const swingPoint=(p,side)=>{
    const a=side*opened*1.75,dx=p[0]-side*92,cs=Math.cos(a),ss=Math.sin(a);
    return [side*92+dx*cs+p[2]*ss,p[1],-dx*ss+p[2]*cs];
  };
  for(const upper of [false,true]) {
    const r=upper?70:90,start=upper?260:367,end=upper?353:470,count=upper?16:18;
    for(let j=0;j<count;j++) {
      const y=start+(end-start)*j/(count-1),attrs=`class="vehicle-grille vehicle-grille-${upper?'upper':'lower'}"`;
      const rear=Array.from({length:19},(_,i)=>{const a=Math.PI/2+i*Math.PI/18;return [r*Math.sin(a),y,r*Math.cos(a)];});
      lineStrip(rear,'#3b5663',upper?3:3.5,attrs);
      lineStrip(rear,'url(#rv-rib)',upper?1.9:2.3,attrs);
      for(const side of [-1,1]) {
        const leaf=Array.from({length:10},(_,i)=>{const a=.014+(Math.PI/2-.014)*i/9;return swingPoint([side*r*Math.sin(a),y,r*Math.cos(a)],side);});
        const leafAttrs=`class="vehicle-grille vehicle-grille-${upper?'upper':'lower'} vehicle-gate-leaf" data-side="${side}" data-gate="${f(opened)}"`;
        lineStrip(leaf,'#425d69',upper?3.1:3.6,leafAttrs);
        lineStrip(leaf,'url(#rv-rib)',upper?2:2.5,leafAttrs);
      }
    }
    for(const side of [-1,1]) {
      const support=[swingPoint([side*r*.06,start,r*.998],side),swingPoint([side*r*.06,end,r*.998],side)];
      segment(...support,'#c7d7d5',upper?3:3.4,`class="vehicle-gate-support" data-side="${side}"`);
      segment([side*r,start,0],[side*92,start,0],'#b5c9cb',2.4);
      segment([side*r,end,0],[side*92,end,0],'#b5c9cb',2.4);
    }
  }
  for(const side of [-1,1]) {
    segment([side*92,258,0],[side*92,474,0],'#b2c7cb',3,'class="vehicle-gate-hinge"');
    segment(swingPoint([side*4.2,353,69.85],side),swingPoint([side*5.4,367,89.82],side),'#b7cbd0',2.8,'class="vehicle-gate-link"');
  }
  surfaces.sort((a,b)=>a.depth-b.depth);
  const shadowOutline=[[-110,482,-267],[110,482,-267],[115,482,35],[83,482,107],[-83,482,107],[-115,482,35]];
  const shadow=`<path class="vehicle-shadow" d="M${shadowOutline.map(coords).join(' L')}Z" fill="#06131a" opacity=".19"/>`;
  const layer=side=>surfaces.filter(s=>s.side===side).map(s=>`<path data-surface-depth="${f(s.depth)}" ${s.markup.slice(6)}`).join('');
  return {defs,back:`<g class="vehicle-back" aria-hidden="true" data-heading="${f(h)}">${shadow}${layer(-1)}</g>`,front:`<g class="vehicle-front" aria-hidden="true" data-gate="${f(opened)}" data-heading="${f(h)}">${layer(1)}</g>`};
}
