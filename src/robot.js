// Original procedural artwork drawn from the supplied full-body photograph.
// Crown = 0; soles = 480. Orthographic depth keeps orbiting independent of WebGL.
const PI = Math.PI, clamp = (n,a,b) => Math.max(a,Math.min(b,n)), f = n => Number(n.toFixed(2));
export class RobbyRenderer {
  constructor(svg) { this.svg=svg; this.yaw=-.22; this.zoom=1; this.offset=0; svg.setAttribute('viewBox','-300 -24 600 554'); }
  render(s) {
    const t=s.time||0, phase=s.phase||0, motion=s.reducedMotion?0:1, walk=(s.walkWeight||0)*motion;
    const c=Math.cos(this.yaw), sn=Math.sin(this.yaw), sway=Math.sin(phase)*2*walk, bob=-Math.abs(Math.sin(phase))*1.6*walk;
    // A signal alone must never make an idle robot glow.
    const speech=s.speaking?clamp(s.speechLevel||0,0,1):0, registers=clamp(s.registerLevel||0,0,1);
    const mechanism=motion*Math.max(registers,speech*.7,s.activeMode==='lights'?.65:0);
    const p=(x,y,z=0)=>[f(x*c+z*sn+sway),f(y-z*.065+bob)], pt=(x,y,z=0)=>p(x,y,z).join(',');
    const radius=(x,z=x)=>Math.sqrt((x*c)**2+(z*sn)**2);
    const ell=(x,y,z,rx,ry,fill='url(#rb-black)',rz=rx,stroke='#465056',sw=.65)=>{const [cx,cy]=p(x,y,z);return `<ellipse cx="${cx}" cy="${cy}" rx="${f(radius(rx,rz))}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;};
    const line=(a,b,color,width=1,extra='')=>`<path d="M${p(...a)} L${p(...b)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;
    const tube=(a,b,r,fill='url(#rb-black)')=>line(a,b,'#465056',r*2+.8)+line(a,b,fill,r*2);
    const path=(commands,fill,stroke='#414b51',sw=.7,extra='')=>`<path d="${commands.map(([cmd,...coords])=>cmd+Array.from({length:coords.length/3},(_,i)=>pt(...coords.slice(i*3,i*3+3))).join(' ')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
    const volume=(y,width,depth,d,fill='url(#rb-body)')=>{const [x,yy]=p(0,y),scale=radius(width,depth)/width;return `<path d="${d}" transform="translate(${x} ${yy}) scale(${f(scale)} 1)" fill="${fill}" stroke="#3d484e" stroke-width=".85"/>`;};
    const defs=`<defs>
      <radialGradient id="rb-black" cx="29%" cy="23%" r="83%"><stop stop-color="#7d888b"/><stop offset=".14" stop-color="#455055"/><stop offset=".34" stop-color="#20292e"/><stop offset=".68" stop-color="#11171b"/><stop offset=".89" stop-color="#080d11"/><stop offset="1" stop-color="#38444b"/></radialGradient>
      <linearGradient id="rb-body" x1="0" x2="1" y1="0" y2=".12"><stop stop-color="#0b1116"/><stop offset=".13" stop-color="#4e5a61"/><stop offset=".28" stop-color="#252f35"/><stop offset=".59" stop-color="#161e23"/><stop offset=".86" stop-color="#10171b"/><stop offset="1" stop-color="#424f57"/></linearGradient>
      <linearGradient id="rb-hood"><stop stop-color="#12191e"/><stop offset=".17" stop-color="#4d595e"/><stop offset=".36" stop-color="#283239"/><stop offset=".72" stop-color="#192229"/><stop offset="1" stop-color="#3d494f"/></linearGradient>
      <linearGradient id="rb-chrome"><stop stop-color="#5c656a"/><stop offset=".19" stop-color="#e7e6dd"/><stop offset=".34" stop-color="#8f9b9f"/><stop offset=".56" stop-color="#343f45"/><stop offset=".78" stop-color="#bdc6c7"/><stop offset="1" stop-color="#677278"/></linearGradient>
      <radialGradient id="rb-amber" cx="31%" cy="28%"><stop stop-color="#ac9470"/><stop offset=".38" stop-color="#725a3d"/><stop offset=".7" stop-color="#443728"/><stop offset="1" stop-color="#242421"/></radialGradient>
      <linearGradient id="rb-ivory"><stop stop-color="#6c756d"/><stop offset=".38" stop-color="#bdc4ac"/><stop offset=".65" stop-color="#8d9787"/><stop offset="1" stop-color="#4e5c58"/></linearGradient>
      <linearGradient id="rb-glass"><stop stop-color="#d7edf1" stop-opacity=".23"/><stop offset=".21" stop-color="#dbeff2" stop-opacity=".025"/><stop offset=".75" stop-color="#dbeff2" stop-opacity=".01"/><stop offset="1" stop-color="#dcebef" stop-opacity=".16"/></linearGradient>
      <radialGradient id="rb-bulb"><stop stop-color="#c7c0a3" stop-opacity=".7"/><stop offset=".6" stop-color="#9b947b" stop-opacity=".3"/><stop offset="1" stop-color="#c4c6b3" stop-opacity=".5"/></radialGradient>
      <filter id="rb-blue-glow" x="-25%" y="-200%" width="150%" height="500%"><feGaussianBlur stdDeviation="1.5"/></filter>
      <filter id="rb-lamp-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2"/></filter>
      <filter id="rb-shadow"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>`;
    const leg=side=>{
      const cycle=phase+(side<0?PI:0),lift=Math.max(0,Math.sin(cycle))*7*walk,z=Math.cos(cycle)*10*walk,x=side*32;
      let out='';
      for(const [i,y] of [335,374,415].entries()) {
        const yy=y-lift*(.42+i*.25);
        out+=ell(x,yy,z,28.7-i*.45,27,'url(#rb-black)',27);
        out+=path([['M',x-26,yy+11,z+7],['Q',x,yy+20,z+24,x+26,yy+11,z+7]],'none','#080e12',.9);
      }
      out+=ell(x,442-lift,z,20,5,'url(#rb-body)',22,'#0b1216');
      const [bx,by]=p(x,441-lift,z+10),bw=radius(32,37)/32;
      out+=`<path d="M-24 1 C-30 6-33 17-32 27 L-29 34 Q0 42 29 34 L32 27 C33 17 28 6 23 1 Q0-7-24 1Z" transform="translate(${bx} ${by}) scale(${f(bw)} 1)" fill="url(#rb-black)" stroke="#38434a" stroke-width=".8"/>`;
      out+=`<path d="M-30 24 Q0 12 30 24 M-29 34 Q0 39 29 34" transform="translate(${bx} ${by}) scale(${f(bw)} 1)" fill="none" stroke="#080e12" stroke-width="1.1"/>`;
      return {depth:-x*sn+z*c,markup:out};
    };
    const arms=[-1,1].map(side=>{
      const swing=Math.sin(phase+(side<0?PI:0))*8*walk,sx=side*62,ex=side*73,hx=side*78;
      let a=tube([sx,181,1],[ex,214,15+swing],24);
      a+=ell(sx,185,1,29,32,'url(#rb-black)',30);
      // Large overlapping tapered shells give the arms their characteristic heavy profile.
      for(const [y,rx,ry,z,x] of [[197,28,28,10,side*67],[208,26.5,26,18,side*72],[219,24.5,24,24,side*75]]) {
        a+=ell(x,y,z+swing,rx,ry,'url(#rb-black)',rx);
        a+=path([['M',x-rx*.92,y-7,z+swing+7],['Q',x,y-ry,z+swing+rx,x+rx*.92,y-7,z+swing+7]],'none','#849094',.65,'opacity=".5"');
      }
      a+=ell(hx,238,33+swing,13,13,'url(#rb-body)',13,'#586469',.75);
      a+=tube([hx,240,35+swing],[hx+side,253,40+swing],9);
      for(let j=0;j<3;j++) {
        const fx=hx+side*(j-1)*5.7,fy=251+(j===1?2:0),zz=44+swing+j*.6;
        a+=tube([fx,fy,zz],[fx+side*1.8,fy+14,zz+4],3.9);
        a+=line([fx-2,fy+5,zz+5],[fx+3,fy+5,zz+5],'#657078',.6);
        a+=line([fx-1,fy+9,zz+6],[fx+3.6,fy+9,zz+6],'#657078',.6);
      }
      a+=tube([hx-side*9,246,40+swing],[hx-side*15,255,46+swing],4.5);
      return {depth:-sx*sn+(22+swing)*c,markup:a};
    });
    let pelvis=volume(247,59,42,'M-44 0 Q-59 8-59 27 L-55 54 Q-41 69 0 74 Q41 69 55 54 L59 27 Q59 8 44 0Z');
    if(c>.08) {
      pelvis+=path([['M',-55,267,15],['Q',0,281,44,55,267,15]],'none','#080e12',1);
      pelvis+=path([['M',-55,294,19],['Q',-31,308,38,-5,309,42],['L',0,317,42],['L',5,309,42],['Q',31,308,38,55,294,19]],'none','#101619',1.3);
      pelvis+=line([0,291,43],[0,316,43],'#0a1013',.8);
    }
    for(const side of [-1,1]) {
      pelvis+=path([['M',side*60,259,0],['L',side*64,259,0],['L',side*64,312,0],['Q',side*59,318,2,side*55,323,3],['L',side*54,309,2],['Q',side*60,296,0,side*60,259,0]],'url(#rb-body)','#556269',.8);
      pelvis+=ell(side*61,275,0,4,8,'url(#rb-chrome)',6,'#28343b');
    }
    let body=volume(154,76,47,'M-55 0 Q-74 1-76 20 L-74 69 Q-72 84-56 90 Q0 97 56 90 Q72 84 74 69 L76 20 Q74 1 55 0Z');
    body+=ell(0,244,0,66,5,'url(#rb-body)',40,'#0b1216',.7);
    if(c>.09) {
      body+=path([['M',-22,166,44],['Q',-29,166,45,-29,174,45],['L',-29,229,46],['Q',-29,239,46,-20,239,46],['L',20,239,46],['Q',29,239,46,29,229,46],['L',29,174,45],['Q',29,166,45,22,166,44],['Z']],'#090f13','#656b68',2.2);
      body+=path([['M',-24,175,46],['Q',0,171,48,24,175,46],['L',24,190,47],['Q',0,194,48,-24,190,47],['Z']],'url(#rb-black)','#121a20',1.2);
      body+=line([-23,199,48],[23,199,48],'#3c3c32',.65);
      if(speech>.01) body+=line([-17,190,49],[17,190,49],'#dfae65',2,`opacity="${f(speech*.6)}" filter="url(#rb-lamp-glow)"`);
      for(const side of [-1,1]) {
        body+=ell(side*12.5,212,49,8.6,8.6,'url(#rb-chrome)',.2,'#838b8d',.7);
        body+=ell(side*12.5,212,49.2,6.1,6.1,side<0?'url(#rb-chrome)':'url(#rb-amber)',.2,'#657072',.5);
        for(let j=0;j<3;j++) {
          const angle=j*PI*2/3+t*mechanism*(side<0?.8:-.65);
          body+=ell(side*12.5+Math.cos(angle)*3.5,212+Math.sin(angle)*3.5,49.4,1.9,1.9,side<0?'#d0d3c8':'#bd9c67',.1,'none');
        }
        if(speech>.01) {const [gx,gy]=p(side*12.5,212,50);body+=`<ellipse cx="${gx}" cy="${gy}" rx="${f(radius(6.5,.2))}" ry="6.5" fill="${side<0?'#eef4df':'#ffc066'}" opacity="${f(speech*.7)}" filter="url(#rb-lamp-glow)"/>`;}
      }
      for(let j=0;j<4;j++) body+=path([['M',-22+j*13,226,48],['L',-18+j*13,226,48],['L',-18+j*13,235,48],['L',-22+j*13,235,48],['Z']],'#293134','#6d7168',.5);
    }
    // The dark tapered mechanism hood has a transparent rounded upper cap.
    const headW=radius(59,38),capW=radius(41,31),[hc,hy]=p(0,0);
    let head=`<path d="M${f(hc-headW)},147 Q${f(hc-headW+3)},96 ${f(hc-capW)},45 Q${hc},40 ${f(hc+capW)},45 Q${f(hc+headW-3)},96 ${f(hc+headW)},147 Q${hc},157 ${f(hc-headW)},147Z" fill="url(#rb-hood)" stroke="#626d72" stroke-width=".8"/>`;
    const cap=`M${f(hc-capW)},${f(hy+45)} C${f(hc-capW+9)},${f(hy+16)} ${f(hc-18)},${f(hy-1)} ${hc},${f(hy)} C${f(hc+18)},${f(hy-1)} ${f(hc+capW-9)},${f(hy+16)} ${f(hc+capW)},${f(hy+45)}Z`;
    head+=`<path d="${cap}" fill="url(#rb-glass)" stroke="#96a5ab" stroke-width="1" stroke-opacity=".8"/>`;
    head+=tube([0,44,-4],[0,20,-4],3.4,'url(#rb-chrome)');
    for(let j=0;j<6;j++) head+=line([-4.4,24+j*1.5,0],[4.4,24+j*1.5,0],'#8b918c',.8);
    head+=ell(0,15,-3,5.7,8,'url(#rb-bulb)',5.7,'#b7b9a7',.6)+line([0,20,1],[0,11,1],'#c2bca3',.8);
    if(speech>.01) {const [gx,gy]=p(0,15,0);head+=`<ellipse cx="${gx}" cy="${gy}" rx="5.6" ry="7.6" fill="#fff0bd" opacity="${f(speech*.85)}" filter="url(#rb-lamp-glow)"/>`;}
    for(const side of [-1,1]) {
      const [gx,gy]=p(side*14,35,1),ang=side*(22+Math.sin(t*5)*45*mechanism);
      head+=`<g transform="translate(${gx} ${gy}) rotate(${f(ang)})"><ellipse rx="8.7" ry="9.8" fill="none" stroke="#172024" stroke-width="1.1"/><ellipse rx="6.7" ry="8" fill="none" stroke="#172024" stroke-width=".9"/><ellipse rx="4.4" ry="6.1" fill="none" stroke="#172024" stroke-width=".9"/><ellipse rx="2.2" ry="4" fill="none" stroke="#273136" stroke-width=".8"/><path d="M-10 0H10 M0-10V10 M-6-7L6 7" stroke="#222b2e" stroke-width=".8"/><circle r="1.8" fill="#525c5c"/></g>`;
      head+=tube([side*5,43,-1],[side*15,38,0],1.6,'#20292c');
    }
    if(c>.10) {
      // These upper fins stay black. They are not the speaking lights.
      for(const side of [-1,1]) for(let j=0;j<4;j++) {const x=side*(19+j*4.2);head+=tube([x,47,31],[x+side*.5,63,34],1.55,'#080f14');head+=line([x-.7,48,33],[x-.7,61,36],'#586266',.65);}
      head+=path([['M',-7,50,33],['L',10,49,33],['L',10,51,33],['L',-7,52,33],['Z']],'#bbc1b9','#6d7673',.45);
      head+=line([-12,48,32],[-9,64,35],'#99a29d',1);
      // Six upright valves across one horizontal manifold, with register-driven relay travel.
      head+=tube([-31,72,34],[31,72,34],1.65,'url(#rb-chrome)');
      for(const [j,x] of [-29,-17,-6,6,17,29].entries()) {
        const relay=Math.sin(t*16+j*1.35)*mechanism*1.7;
        head+=ell(x,72,35,2.9,2.9,'url(#rb-amber)',2.9,'#747e73',.5);
        head+=tube([x,74,36],[x,81+relay,37],1.15,'url(#rb-chrome)');
        head+=ell(x,82+relay,37,2.25,2,'url(#rb-chrome)',2.25,'#8c978f',.4);
        head+=path([['M',x-2.7,87,36],['L',x-3.3,99,36],['Q',x,101,37,x+3.3,99,36],['L',x+2.7,87,36],['Z']],'url(#rb-ivory)','#adb5a0',.45);
        head+=tube([x,86,37],[x,97,38],.65,'#475454');
        head+=ell(x,88,38,1.65,2.5,'url(#rb-chrome)',1.65,'#626d68',.4);
        head+=path([['M',x,100,35],['L',x,103+(j%2)*2,35],['Q',x,105+(j%2)*2,35,x+(x<0?4:-4),105+(j%2)*2,35]],'none','#717b76',.75);
      }
      for(const side of [-1,1]) {head+=ell(side*35,91,31,3.3,5.3,'url(#rb-amber)',3.3,'#656359',.5);for(let j=0;j<5;j++) head+=line([side*29-2.4,105+j*1.4,34],[side*29+2.4,105+j*1.4,34],'#7a8988',.55);}
      for(let j=0;j<5;j++) head+=line([-9,103+j*1.1,37],[9,103+j*1.1,37],'#7c8582',.7);
    }
    // The swept lower arch exposes the horizontal speaking grille beneath the hood.
    const archScale=radius(67,41)/67,[ax,ay]=p(0,113,7);
    head+=`<path d="M-67 38 Q-67 13-42 5 Q0-11 42 5 Q67 13 67 38 Q0 46-67 38Z" transform="translate(${ax} ${ay}) scale(${f(archScale)} 1)" fill="#0a1116" stroke="#61696b" stroke-width="1"/>`;
    if(c>.10) {
      for(let j=0;j<8;j++) {
        const y=127+j*3.3,d=`M${pt(-36,y+1.9,27)} Q${pt(0,y-4,42)} ${pt(36,y+1.9,27)}`;
        head+=`<path d="${d}" fill="none" stroke="#586669" stroke-width="1.1" opacity=".65"/>`;
        if(speech>.01) {const intensity=clamp(speech*(.8+.2*Math.sin(t*10+j*.9)),0,1);head+=`<path d="${d}" fill="none" stroke="#40baff" stroke-width="4" opacity="${f(intensity*.65)}" filter="url(#rb-blue-glow)"/><path d="${d}" fill="none" stroke="#b5efff" stroke-width="1.2" opacity="${f(intensity)}"/>`;}
        for(const side of [-1,1]) head+=path([['M',side*38,y+2,27],['L',side*(50+j*1.5),y+2.7,17]],'none','#394449',.7);
      }
      head+=line([0,125,43],[0,153,43],'#243c42',.7);
    }
    head+=ell(0,154,0,69,3.6,'url(#rb-body)',42,'#151d22',1);
    head+=path([['M',-49,118,18],['Q',-43,72,24,-37,49,25]],'none','#d2e4e7',1.3,'opacity=".19"');
    head+=`<path d="M${f(hc-capW+8)},${f(hy+36)} Q${f(hc-24)},${f(hy+8)} ${f(hc-6)},${f(hy+4)}" fill="none" stroke="#edf5f3" stroke-width="2.1" opacity=".23"/>`;
    const scanner=side=>{
      let out=tube([side*44,67,0],[side*59,67,0],9);
      out+=ell(side*54,67,1,13,12,'url(#rb-black)',10);
      out+=ell(side*55,67,11,5.6,5.6,'url(#rb-chrome)',2.5,'#a1abad',.7);
      out+=ell(side*55,67,13,2.4,2.4,'#526e81',1.4,'#9fb1b9',.55);
      out+=ell(side*55-.6,66.3,14,.8,.8,'#c0d1d4',.6,'none');
      if(side<0) {
        out+=tube([-62,65,0],[-72,65,0],1.4,'url(#rb-chrome)');
        const [rx,ry]=p(-85,65,0),scan=.88+.12*Math.cos(t*1.5)*mechanism;
        out+=`<ellipse cx="${rx}" cy="${ry}" rx="${f(radius(12.8*scan,3.7))}" ry="11.2" fill="none" stroke="#a4aeb0" stroke-width="3"/><ellipse cx="${rx}" cy="${ry}" rx="${f(radius(12.8*scan,3.7))}" ry="11.2" fill="none" stroke="#e0e4df" stroke-width="1"/>`;
        out+=line([-58,62,6],[-61,43,4],'#bbc4c5',.85)+line([-53,61,7],[-48,42,3],'#9eabad',.75);
      } else {
        out+=tube([65,59,0],[65,41,0],1.1,'url(#rb-chrome)');
        const [rx,ry]=p(65,29,0),scan=1-.35*mechanism*(1+Math.sin(t*1.7))*.5;
        out+=`<ellipse cx="${rx}" cy="${ry}" rx="${f(radius(6.6*scan,3))}" ry="13" fill="none" stroke="#97a0a4" stroke-width="3"/><ellipse cx="${rx}" cy="${ry}" rx="${f(radius(6.6*scan,3))}" ry="13" fill="none" stroke="#d9ddda" stroke-width=".8"/>`;
        out+=line([59,67,8],[79,62,2],'#b4bec0',.8)+line([59,69,8],[79,73,2],'#a7b4b8',.75);
      }
      for(let j=0;j<6;j++) out+=line([side*(54+j*.8),82+j*4.5,2],[side*(60+j*.8),80+j*4.5,2],'#94a2a6',.75);
      return {depth:-side*55*sn,markup:out};
    };
    const scanners=[-1,1].map(scanner).sort((a,b)=>a.depth-b.depth),legs=[-1,1].map(leg).sort((a,b)=>a.depth-b.depth);
    const backArms=arms.filter(a=>a.depth<-5).map(a=>a.markup).join('');
    const frontArms=arms.filter(a=>a.depth>=-5).sort((a,b)=>a.depth-b.depth).map(a=>a.markup).join('');
    const shift=this.offset*motion;
    this.svg.innerHTML=defs+`<ellipse cx="${shift}" cy="488" rx="92" ry="11" fill="#07151c" opacity=".3" filter="url(#rb-shadow)"/><g transform="translate(${shift} 0) translate(0 480) scale(${this.zoom}) translate(0 -480)">${backArms}${legs.map(l=>l.markup).join('')}${pelvis}${body}${frontArms}${scanners[0].markup}${head}${scanners[1].markup}</g>`;
  }
}
