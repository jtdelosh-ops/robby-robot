import {RobbyRenderer} from './robot.js';
import {PerformanceController} from './performance.js';
import {renderVehicle} from './vehicle.js';
const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const mix=(a,b,t)=>a+(b-a)*t;
const yawDelta=(a,b)=>((b-a+540)%360)-180;
const vehiclePosition=theta=>({x:-42+210*Math.sin(theta),y:40+50*(1-Math.cos(theta)),scale:.81});
const OUTSIDE={x:-35,depth:88,yaw:0};

export class RobbyRobot extends HTMLElement {
  constructor(){
    super();this.attachShadow({mode:'open'});
    this.shadowRoot.innerHTML='<style>:host{display:block;width:100%;height:100%;min-height:300px;touch-action:pan-y}svg{width:100%;height:100%;overflow:visible;display:block;cursor:grab}svg:active{cursor:grabbing}:host([hidden]){display:none}</style><svg role="img" aria-label="Animated Robby the Robot with transparent dome, blue voice tubes and articulated legs" xmlns="http://www.w3.org/2000/svg"></svg>';
    this.svg=this.shadowRoot.querySelector('svg');this.controller=new PerformanceController();this.renderer=new RobbyRenderer(this.svg);
    this.vehicleTime=null;this.vehicleAction=null;this.angle=-12;this.speed=1;this.zoom=1;
    this._tick=this._tick.bind(this);this._change=()=>{this._reduceVehicle();this._emit()};
    this.controller.addEventListener('change',this._change);
    this._visibility=()=>{if(document.hidden)this.stop();this.last=0;};
    this.addEventListener('keydown',e=>{if(e.key==='Escape'){this.stop();e.preventDefault()}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){this.face(this.angle+(e.key==='ArrowLeft'?-15:15));e.preventDefault();}});
    this._drag=null;this.svg.addEventListener('pointerdown',e=>{this._drag={x:e.clientX,angle:this.angle,id:e.pointerId};this.svg.setPointerCapture(e.pointerId)});
    this.svg.addEventListener('pointermove',e=>{if(this._drag)this.face(this._drag.angle+(e.clientX-this._drag.x)*.55)});
    const end=()=>{this._drag=null};this.svg.addEventListener('pointerup',end);this.svg.addEventListener('pointercancel',end);
  }
  connectedCallback(){if(this._disposed){this.controller=new PerformanceController();this.controller.addEventListener('change',this._change);if(this.clipUrl)this.controller.setClip(this.clipUrl,this.clipCaption);this._disposed=false}this.setAttribute('tabindex','0');this.setAttribute('aria-label','Robby viewer. Drag or use left and right arrows to turn. Escape stops the performance.');document.addEventListener('visibilitychange',this._visibility);this.last=0;cancelAnimationFrame(this.raf);this.raf=requestAnimationFrame(this._tick)}
  disconnectedCallback(){cancelAnimationFrame(this.raf);document.removeEventListener('visibilitychange',this._visibility);this.controller.removeEventListener('change',this._change);this.controller.destroy();this._clearVehicle();this._disposed=true}
  destroy(){this.remove();if(!this._disposed)this.disconnectedCallback()}
  _clearVehicle(){this.vehicleTime=null;this.vehicleAction=null;this._vehiclePose=null;this._exit=null;this._outsideWalk=false;this._vehicleOutside=false;this._parkWalkTime=0;this._wheelDistance=0}
  _phase(){
    if(!this.vehicleAction)return null;
    if(this.vehicleAction==='parked')return this._outsideWalk&&!this.controller.state.reducedMotion?'walking outside':'parked';
    if(this.vehicleAction==='exit'){
      const e=this._exit;
      return e.elapsed<e.openFor?'opening for exit':e.elapsed<e.openFor+e.turnFor?'turning outward':'walking out';
    }
    if(this.controller.state.reducedMotion)return 'parked';
    const v=this.vehicleTime;
    return v<1.4?'opening gate':v<4.4?'boarding':v<5.3?'turning into position':v<6.7?'closing gate':'driving';
  }
  _emit(){this._lastVehiclePhase=this._phase();this.dispatchEvent(new CustomEvent('robotstatechange',{detail:this.debugState(),bubbles:true}))}
  debugState(){
    const p=this._vehiclePose;
    return {...this.controller.state,vehicleAction:this.vehicleAction,vehiclePhase:this._phase(),vehicleElapsed:this.vehicleTime,
      vehiclePosition:p?{...p.position}:null,vehicleGate:p?.gate??null,vehicleWheel:p?.wheel??null,vehiclePathAngle:p?.theta??null,
      robotPosition:p?{x:p.x,depth:p.depth,yaw:p.yaw}:null,vehicleOutside:!!this._vehicleOutside,
      angle:this.angle,speed:this.speed,zoom:this.zoom};
  }
  perform(mode){
    if(mode==='walk'&&this.vehicleAction){this._startExit();return}
    if(mode==='drive'){this.drive();return}
    this._clearVehicle();this.controller.setMode(mode);this._emit();
  }
  walk(){this.perform('walk')} talk(){this.perform('talk')} mechanisms(){this.perform('lights')} showcase(){this.perform('showcase')}
  drive(){
    if(this.vehicleAction==='drive')return;
    const previous=this._vehiclePose;
    this._driveFrom=previous?{x:previous.x,depth:previous.depth,yaw:previous.yaw,gate:previous.gate,inFront:previous.inFront}:{x:-19,depth:65,yaw:170,gate:0,inFront:true};
    this._driveTheta=previous?.theta||0;this._wheelDistance=(previous?.wheel||0)*12;
    this.vehicleTime=0;this.vehicleAction='drive';this._exit=null;this._outsideWalk=false;this._vehicleOutside=false;
    this._vehiclePose=this._drivePose(0);this.controller.setMode('drive');this._reduceVehicle();this._emit();
  }
  _drivePose(v){
    const from=this._driveFrom,board=ease((v-1.4)/3),theta=this._driveTheta+Math.max(0,v-6.7)*.55;
    return {position:vehiclePosition(theta),theta,wheel:(this._wheelDistance||0)/12,
      gate:v<1.4?mix(from.gate,1,ease(v/1.4)):v<5.3?1:1-ease((v-5.3)/1.4),
      x:from.x*(1-board),depth:from.depth*(1-board),
      yaw:v<1.4?from.yaw+yawDelta(from.yaw,170)*ease(v/1.4):170-182*ease((v-4.4)/.9),
      inFront:v<1.4?from.inFront:v<4.4,walkWeight:v>=1.4&&v<4.4?.8:0};
  }
  _startExit(){
    if(this.vehicleAction==='exit')return;
    if(this.vehicleAction==='parked'&&this._vehicleOutside){
      if(!this._outsideWalk){this._outsideWalk=true;this._parkWalkOrigin={x:this._vehiclePose.x,depth:this._vehiclePose.depth};this._parkWalkTime=0;this.controller.setMode('walk');this._emit()}
      return;
    }
    const p=this._vehiclePose;
    this._exit={elapsed:0,from:{x:p.x,depth:p.depth,yaw:p.yaw,gate:p.gate},
      openFor:1.4*(1-p.gate),turnFor:Math.abs(yawDelta(p.yaw,OUTSIDE.yaw))/180*.9,
      walkFor:Math.max(.8,2.6*Math.hypot(OUTSIDE.x-p.x,OUTSIDE.depth-p.depth)/Math.hypot(OUTSIDE.x,OUTSIDE.depth))};
    this.vehicleAction='exit';this._outsideWalk=false;
    // Capture the displayed vehicle/wheel pose before changing performance.
    this.controller.setMode('walk');this._reduceVehicle();this._emit();
  }
  _finishExit(){
    Object.assign(this._vehiclePose,OUTSIDE,{gate:1,inFront:true,walkWeight:0});
    this.vehicleAction='parked';this._vehicleOutside=true;this._outsideWalk=true;
    this._parkWalkTime=0;this._parkWalkOrigin={x:OUTSIDE.x,depth:OUTSIDE.depth};this._exit=null;
  }
  _reduceVehicle(){
    if(!this.controller.state.reducedMotion||!this._vehiclePose)return;
    if(this.vehicleAction==='exit')this._finishExit();
    else if(this.vehicleAction==='drive'){
      this.vehicleTime=6.7;this._driveTheta=this._vehiclePose.theta;
      Object.assign(this._vehiclePose,{x:0,depth:0,yaw:-12,gate:0,inFront:false,walkWeight:0});
    }
  }
  stop(){
    // Freeze an interrupted gate/exit in place; do not remove the parked car.
    if(this.vehicleAction){this.vehicleAction='parked';this._exit=null;this._outsideWalk=false;this._vehiclePose.walkWeight=0}
    this.controller.stop();this.renderer.offset=0;this._emit();
  }
  show(){this.hidden=false;this._emit()} hide(){this.stop();this.hidden=true;this._emit()}
  face(degrees){this.angle=Math.max(-180,Math.min(180,degrees));this.renderer.yaw=this.angle*Math.PI/180;this._emit()}
  setMotion(enabled){this.controller.setReducedMotion(!enabled);this._reduceVehicle();this._emit()}
  setVoice(enabled){this.controller.setMuted(!enabled);this._emit()}
  setClip(url,caption){this.clipUrl=url;this.clipCaption=caption;this.controller.setClip(url,caption)}
  setSpeed(speed){this.speed=Math.max(.4,Math.min(1.5,Number(speed)));this._emit()}
  setZoom(zoom){this.zoom=Math.max(.65,Math.min(1.15,Number(zoom)));this._emit()}
  _stepVehicle(step,s){
    const p=this._vehiclePose;
    if(s.reducedMotion){this._reduceVehicle();return}
    if(this.vehicleAction==='drive'){
      this.vehicleTime+=step;const next=this._drivePose(this.vehicleTime);
      this._wheelDistance+=Math.hypot(next.position.x-p.position.x,next.position.y-p.position.y);
      next.wheel=this._wheelDistance/12;this._vehiclePose=next;
    }else if(this.vehicleAction==='exit'){
      const e=this._exit;e.elapsed+=step;
      p.gate=e.openFor?mix(e.from.gate,1,ease(e.elapsed/e.openFor)):1;p.walkWeight=0;
      const turning=e.elapsed-e.openFor;
      if(turning>=0)p.yaw=e.from.yaw+yawDelta(e.from.yaw,OUTSIDE.yaw)*(e.turnFor?ease(turning/e.turnFor):1);
      const walking=turning-e.turnFor;
      if(walking>=0){
        const fraction=ease(walking/e.walkFor);p.x=mix(e.from.x,OUTSIDE.x,fraction);p.depth=mix(e.from.depth,OUTSIDE.depth,fraction);p.walkWeight=.8;p.inFront=true;
        if(walking>=e.walkFor)this._finishExit();
      }
    }else if(this._outsideWalk){
      this._parkWalkTime+=step;const a=this._parkWalkTime*.65,origin=this._parkWalkOrigin;
      p.x=origin.x+38*Math.sin(a);p.depth=origin.depth+9*(1-Math.cos(a));
      const heading=Math.atan2(38*Math.cos(a),9*Math.sin(a))*180/Math.PI;
      p.yaw+=yawDelta(p.yaw,heading)*Math.min(1,step*3);p.walkWeight=s.walkWeight;
    }
  }
  _renderVehicle(s){
    const p=this._vehiclePose;
    this.renderer.zoom=1;this.renderer.offset=0;this.renderer.yaw=p.yaw*Math.PI/180;
    this.renderer.render({...s,phase:this.vehicleAction==='drive'?this.vehicleTime*5:s.phase,walkWeight:s.reducedMotion?0:p.walkWeight,
      lightLevel:0,speechLevel:0,registerLevel:0,speaking:false});
    const vehicle=renderVehicle({gate:p.gate,wheel:p.wheel}),robot=this.svg.innerHTML;
    this.svg.setAttribute('viewBox','-520 -70 1040 720');
    const robotMarkup='<g class="boarding-robot" data-depth="'+p.depth.toFixed(2)+'" transform="translate('+p.x+' '+p.depth+')">'+robot+'</g>';
    // Fixed upright 2.5D artwork follows a ground-plane ellipse without spins.
    const loop='<g class="vehicle-ground-loop" aria-hidden="true"><ellipse cx="-42" cy="478.8" rx="210" ry="50" fill="#94b6b4" fill-opacity=".035" stroke="#d8e2c9" stroke-opacity=".5" stroke-width="1.6" stroke-dasharray="5 9"/><ellipse cx="-42" cy="478.8" rx="222" ry="56" fill="none" stroke="#d8e2c9" stroke-opacity=".2" stroke-width="1"/></g>';
    this.svg.innerHTML='<defs>'+(vehicle.defs||'')+'</defs>'+loop+'<g transform="translate('+p.position.x+' '+p.position.y+') scale('+p.position.scale+')">'+vehicle.back+(p.inFront?vehicle.front+robotMarkup:robotMarkup+vehicle.front)+'</g>';
  }
  _tick(now){
    const dt=this.last?Math.min(.05,(now-this.last)/1000):0;this.last=now;
    const raw=this.controller.update(dt,this.speed);
    if(!raw.reducedMotion&&(raw.mode!=='idle'||this.vehicleAction==='drive'||this.vehicleAction==='exit'))this.animationTime=(this.animationTime||0)+dt*this.speed;
    const s={...raw,time:this.animationTime||0};this.renderer.zoom=this.zoom;this.renderer.offset=(s.walkWeight||0)*Math.sin((s.time||0)*.42)*40;
    if(this.vehicleAction){this._stepVehicle(dt*this.speed,s);this._renderVehicle(s);if(this._phase()!==this._lastVehiclePhase)this._emit()}
    else{this.renderer.yaw=this.angle*Math.PI/180;this.svg.setAttribute('viewBox','-300 -24 600 554');this.renderer.render(s)}
    this.raf=requestAnimationFrame(this._tick);
  }
}
if(!customElements.get('robby-robot'))customElements.define('robby-robot',RobbyRobot);
