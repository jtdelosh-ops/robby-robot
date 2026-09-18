/** Original SVG study, proportioned from the supplied landcar photographs.
 * https://silodrome.com/jeep-robby-robot-forbidden-planet/
 * Robby stands at x=0 inside the front cage; passenger chairs sit behind him.
 * Insert defs into <defs>, back before the robot and front after the robot.
 * gate: 0 closed / 1 front entry open. wheel: axle rotation in radians.
 */
const clamp = n => Math.max(0, Math.min(1, Number(n) || 0));
const f = n => Number(n.toFixed(3));
export function renderVehicle({gate=0, wheel=0}={}) {
  // Past edge-on, each leaf visibly swings outward beyond its own hinge.
  const opened=clamp(gate), leaf=f(1-opened*1.38);
  const angle=Number.isFinite(Number(wheel))?f(Number(wheel)*180/Math.PI%360):0;
  const defs=`
  <linearGradient id="rv-silver" x1="0" y1="0" x2=".15" y2="1"><stop stop-color="#dce3e0"/><stop offset=".14" stop-color="#89999e"/><stop offset=".57" stop-color="#606f77"/><stop offset=".86" stop-color="#7f9096"/><stop offset="1" stop-color="#334b58"/></linearGradient>
  <linearGradient id="rv-deck" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c6d1d0"/><stop offset=".4" stop-color="#829197"/><stop offset="1" stop-color="#354b58"/></linearGradient>
  <linearGradient id="rv-rib" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f1f7ed"/><stop offset=".26" stop-color="#c7d5d5"/><stop offset=".50" stop-color="#94a5a9"/><stop offset=".72" stop-color="#536a75"/><stop offset="1" stop-color="#b8cacc"/></linearGradient>
  <linearGradient id="rv-glass" x1="0" y1="0" x2="1" y2=".6"><stop stop-color="#e7ffff" stop-opacity=".37"/><stop offset=".22" stop-color="#cdf4fa" stop-opacity=".08"/><stop offset=".65" stop-color="#efffff" stop-opacity=".025"/><stop offset="1" stop-color="#cdf0f3" stop-opacity=".3"/></linearGradient>
  <radialGradient id="rv-tire"><stop stop-color="#6e7e82"/><stop offset=".4" stop-color="#253640"/><stop offset=".62" stop-color="#111e25"/><stop offset="1" stop-color="#030c12"/></radialGradient>`;
  const wheelMarkup=(x,y,r)=>`<g class="vehicle-wheel" transform="translate(${x} ${y}) scale(.8 1)"><circle r="${r}" fill="url(#rv-tire)" stroke="#061017" stroke-width="2"/><circle r="${r*.53}" fill="#455962"/><g transform="rotate(${angle})" stroke="#92a5ab" stroke-width="1.4" opacity=".65"><path d="M-${r*.4} 0H${r*.4}M0 -${r*.4}V${r*.4}"/><path d="M-${r*.28} -${r*.28}L${r*.28} ${r*.28}"/></g><circle r="3" fill="#b9c9c9"/></g>`;
  const shield=(x,y,scale=1)=>`<g class="vehicle-windscreen" transform="translate(${x} ${y}) scale(${scale})"><path d="M-18 32C-33 18-26-13-8-33Q0-43 10-33C30-13 37 20 24 37Q10 57-7 46Z" fill="url(#rv-glass)" stroke="#d4e4e2" stroke-opacity=".75" stroke-width="1.1"/><path d="M-20 12Q-20-13-6-28" fill="none" stroke="#efffff" stroke-opacity=".62" stroke-width="2" stroke-linecap="round"/><path d="M-21 3L-26 26L-12 30L-12 6Z" fill="#344d5c" fill-opacity=".9"/><path d="M${f((62-x)/scale)} 12L-15 12" stroke="#263d49" stroke-width="3.5"/><path d="M${f((62-x)/scale)} 10L-15 10" stroke="#d0dfdd" stroke-width="1.3"/></g>`;
  const chair=(x,y,scale=1)=>{
    const pedestal=f((411-y)/scale);
    return `<g class="vehicle-seat" transform="translate(${x} ${y}) scale(${scale})"><path d="M-3 33L-12 ${pedestal}M4 33L14 ${pedestal-4}" stroke="#344d59" stroke-width="4"/><path d="M-3 32L-12 ${pedestal-2}" stroke="#a4b7bd" stroke-width="1.3"/><path d="M-16 23L-8 8L4-25Q7-29 14-28L31-23L15 18Q10 32-9 29Z" fill="url(#rv-glass)" stroke="#b4c8cd" stroke-width="1"/><path d="M-19 18Q-3 28 16 17L20 24Q-5 39-22 27Z" fill="url(#rv-silver)" stroke="#c3d2d1" stroke-width="1"/></g>`;
  };
  const back=`<g class="vehicle-back" aria-hidden="true">
    <ellipse cx="65" cy="480" rx="156" ry="7" fill="#01090e" opacity=".42"/>
    ${wheelMarkup(-41,463,18)}${wheelMarkup(177,461,19)}
    <path d="M-84 400L-55 380L166 378L219 401L213 458L-65 476Z" fill="#142732" stroke="#435e6b"/>
    <path d="M-78 388L-51 375L159 372L216 393L191 414L-58 408Z" fill="url(#rv-deck)" stroke="#a7b9bc" stroke-width="1.4"/>
    <path d="M44 387L172 384L195 399L168 441L52 442Z" fill="#162b37" stroke="#687f89" stroke-width="1.5"/>
    <path d="M-64 257Q-8 248 63 255L63 352L-66 366Z" fill="#101f28" stroke="#81969c" stroke-width="1.2"/>
    <path d="M-65 256Q-6 248 62 254" fill="none" stroke="url(#rv-rib)" stroke-width="3"/>
    ${chair(127,313,.88)}${shield(89,241,1.15)}
    ${chair(161,335,1)}${shield(129,255,1.3)}
    <path d="M165 408Q185 368 216 378L219 423L196 439Z" fill="url(#rv-silver)" stroke="#a9b9bb" stroke-width="1.1"/>
    <path d="M170 403Q193 381 216 378M180 413L215 393" fill="none" stroke="#a6b8bd" stroke-width="1.5"/>
  </g>`;
  // Each grille tier opens with the same front entry. The gaps between ribs
  // remain transparent, so the standing robot is visible inside the cage.
  const grille=(upper)=>{
    const left=upper?-65:-86, right=upper?61:65, center=-19;
    const start=upper?258:367, step=upper?6.35:6.15, count=upper?16:18;
    const thickness=upper?2.45:2.9;
    const panel=(side)=>{
      // Both stacked tiers share the same physical left/right hinge axes.
      const hinge=side<0?-86:65;
      let ribs='';
      for(let i=0;i<count;i++){
        const y=f(start+i*step), d=side<0
          ?`M${left} ${y-5}Q${left+9} ${y-3} ${center-8} ${y+3}L${center} ${y+4}`
          :`M${center} ${y+4}Q${center+20} ${y+7} ${right-7} ${y-1}Q${right} ${y-2} ${right} ${y-5}`;
        ribs+=`<path d="${d}" fill="none" stroke="#1c333f" stroke-width="${thickness+1.3}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="url(#rv-rib)" stroke-width="${thickness}" stroke-linecap="round"/>`;
      }
      const end=f(start+(count-1)*step);
      const supports=side<0
        ?`<path d="M${left+7} ${start-5}L${left+3} ${end-4}" stroke="#839aa3" stroke-width="2"/><path d="M${center-1} ${start+4}L${center-14} ${end+3}" stroke="#bccdcd" stroke-width="3"/>`
        :`<path d="M${right-10} ${start-2}V${end-2}" stroke="#839ba4" stroke-width="1.1"/>`;
      return `<g class="vehicle-gate-leaf" data-side="${side}" transform="translate(${hinge} 0) skewY(${f(side*opened*16)}) scale(${leaf} 1) translate(${-hinge} 0)">${ribs}${supports}</g>`;
    };
    return `<g class="vehicle-grille vehicle-grille-${upper?'upper':'lower'}">${panel(-1)}${panel(1)}</g>`;
  };
  const front=`<g class="vehicle-front" aria-hidden="true" data-gate="${f(opened)}">
    <path d="M61 393Q91 384 104 401L111 425L146 417Q181 407 215 409L219 446Q213 458 200 462L60 478Z" fill="url(#rv-silver)" stroke="#a6b8bd" stroke-width="1.4"/>
    <path d="M67 398Q90 391 99 405L107 433L149 423L215 417" fill="none" stroke="#c5d1cf" stroke-width="2.3"/>
    <path d="M110 432L211 420L194 449L65 470" fill="none" stroke="#405d6d" stroke-width="1.4"/>
    <path d="M61 475L201 459Q215 455 218 447" fill="none" stroke="#d5ded6" stroke-width="1.2"/>
    <path d="M-87 474L-75 469L-15 477L64 470L65 477L-15 482L-88 479Z" fill="url(#rv-silver)" stroke="#718a96" stroke-width="1"/>
    ${grille(false)}${grille(true)}
    <path d="M-65 254L-65 354M63 255L63 354" stroke="#b2c4c5" stroke-width="2"/>
    <path d="M66 365L66 475" stroke="#d5dfd8" stroke-width="3"/>
  </g>`;
  return {back,front,defs};
}
