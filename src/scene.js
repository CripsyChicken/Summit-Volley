import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, clamp } from './physics.js';
import { SoftwareRenderer } from './software-renderer.js';
import { SKINS,COURTS } from './progression.js';

const PALETTE = { pine: 0x347c64, orange: 0xe97851, paper: 0xf5f0d6, ink: 0x233d38, grass: 0xa8bd7a };
let seed = 84;
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

export class World {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb8d8d0);
    this.scene.fog = new THREE.Fog(0xb8d8d0, 55, 150);
    let gl=null;
    try{gl=canvas.getContext('webgl2',{antialias:true,powerPreference:'high-performance'});}catch{}
    this.renderer = gl ? new THREE.WebGLRenderer({ canvas, context:gl, antialias: true }) : new SoftwareRenderer(canvas);
    canvas.dataset.renderer=this.renderer.isSoftware?'software':'webgl';
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 220);
    this.camera.position.set(20, 17, 28);
    this.look = new THREE.Vector3(-5, 1, 0);
    this.ray = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmp = new THREE.Vector3();
    this.materials = new Map();
    const levels = new Uint8Array([125, 200, 255]);
    this.gradient = new THREE.DataTexture(levels, 3, 1, THREE.RedFormat);
    this.gradient.minFilter = this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.needsUpdate = true;
    this.scene.add(new THREE.HemisphereLight(0xf9f6df, 0x667c68, 2.3));
    this.sun = new THREE.DirectionalLight(0xfff0ce, 3.1);
    this.sun.position.set(-17, 30, 12);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -18;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 18;
    this.sun.shadow.camera.near = 0.5; this.sun.shadow.camera.far = 75;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sun);
    this.staticGroups = new Map();
    this.environment();
    this.court();
    this.flushStatic();
    this.characters = [];
    this.ball = this.makeBall();
    this.ballShadow = this.circle(0.32, 0x283c35, 0.19);
    this.scene.add(this.ballShadow);
    this.target = this.ring(0.48, 0xf5cf61);
    this.target2 = this.ring(0.48, 0xef7955);
    this.landing = this.ring(0.42, 0xf5f2de, true);
    this.scene.add(this.target, this.target2, this.landing);
    this.target.visible = this.target2.visible = this.landing.visible = false;
    this.practiceTargets = [];
    for (const [x,z] of [[-2.7,-6.8],[2.7,-6.8],[0,-3.5]]) {
      const target = this.ring(0.9, 0xf5ce5c, true);
      target.position.set(x, 0.045, z); target.visible = false;
      this.practiceTargets.push(target); this.scene.add(target);
    }
    this.particles = [];
    const particleGeo = new THREE.IcosahedronGeometry(0.07, 0);
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(particleGeo, this.mat(i % 3 === 0 ? PALETTE.orange : PALETTE.paper));
      mesh.visible = false; this.scene.add(mesh);
      mesh.userData.dynamic=true;
      this.particles.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
    }
    this.trail = [];
    const trailGeo = new THREE.SphereGeometry(R * 0.65, 8, 6);
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xffdf8a, transparent: true, opacity: 0.15 * (1 - i / 7), depthWrite: false }));
      mesh.visible = false; this.trail.push(mesh); this.scene.add(mesh);
      mesh.userData.dynamic=true;
    }
    this.trailCounter = 0;
    this.setQuality(settings.quality);
    this.resize();
  }
  mat(color) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshToonMaterial({ color, gradientMap: this.gradient }));
    return this.materials.get(color);
  }
  mesh(geo, color, x = 0, y = 0, z = 0, parent = this.scene, shadow = true) {
    const m = new THREE.Mesh(geo, this.mat(color));
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  }
  box(w,h,d,color,x,y,z,parent=this.scene) { return this.mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z,parent); }
  staticMesh(geo, color, pos, rot, scale, cast = false, layer = 0) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot||[0,0,0]))), new THREE.Vector3(...(scale||[1,1,1])));
    const clone = geo.clone().applyMatrix4(matrix);
    if (clone.index) { const n = clone.toNonIndexed(); clone.dispose(); geo = n; } else geo = clone;
    const key = color + ':' + cast + ':' + layer;
    if (!this.staticGroups.has(key)) this.staticGroups.set(key, { color, cast, layer, geos: [] });
    this.staticGroups.get(key).geos.push(geo);
  }
  flushStatic() {
    for (const { color, cast, layer, geos } of this.staticGroups.values()) {
      const geo = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(geo, this.mat(color));
      mesh.castShadow = cast; mesh.receiveShadow = true; mesh.userData.softwareLayer=layer; this.scene.add(mesh);
      geos.forEach(g => g.dispose());
    }
    this.staticGroups.clear();
  }
  environment() {
    const disc = this.mesh(new THREE.CylinderGeometry(22, 24, 3, 12), 0x849d6a, 0, -1.65, 0);
    disc.userData.softwareLayer=-60;
    disc.receiveShadow = true;
    this.mesh(new THREE.CylinderGeometry(25, 19, 10, 9), 0x6e8174, 0, -8, 0).userData.softwareLayer=-61;
    this.mesh(new THREE.CylinderGeometry(22, 22, 0.1, 12), PALETTE.grass, 0, -0.1, 0).userData.softwareLayer=-50;
    const lake=this.mesh(new THREE.CircleGeometry(180, 32), 0x85bdb1, 0, -8, -20);lake.rotation.x=-Math.PI/2;lake.userData.softwareLayer=-100;
    // Layered, faceted peaks; shared geometry and materials keep the scene inexpensive.
    for (let i = 0; i < 18; i++) {
      const x = (i - 8) * 12 + rand() * 6;
      const z = -48 - rand() * 40;
      const height = 16 + rand() * 23;
      const radius = 13 + rand() * 9;
      const rotation=rand()*3;
      this.staticMesh(new THREE.ConeGeometry(radius, height, 5, 1), i % 3 === 0 ? 0x9caaa4 : i % 3 === 1 ? 0x8faaa3 : 0xb4bab0, [x, height / 2 - 8, z], [0,rotation,0],null,false,-90);
      if (height > 26) this.staticMesh(new THREE.ConeGeometry(radius*0.35,height*0.35,5,1),0xe6e6d5,[x,height*0.825-8+.04,z],[0,rotation,0],null,false,-89);
    }
    const trunk = new THREE.CylinderGeometry(0.15,0.22,1.6,5);
    const crown = new THREE.ConeGeometry(1.2,3,6);
    for (let i = 0; i < 78; i++) {
      const angle = rand()*Math.PI*2, radius = 14+rand()*8;
      const x = Math.cos(angle)*radius, z = Math.sin(angle)*radius;
      // Keep the view to the near court clear.
      if (z > 6 && Math.abs(x) < 15) continue;
      const scale = .65+rand()*.7;
      this.staticMesh(trunk,0x756b4b,[x,.65,z],null,[scale,scale,scale],true);
      const color = [0x5b8c6d,0x4b7c63,0x76976c][i%3];
      this.staticMesh(crown,color,[x,2*scale,z],null,[scale,scale,scale],true);
      this.staticMesh(crown,color,[x,3.3*scale,z],null,[scale*.72,scale*.85,scale*.72],true);
    }
    // Pebbles and little flower patches, merged by material.
    const pebble = new THREE.IcosahedronGeometry(1,0);
    for (let i=0;i<80;i++) {
      const x=(rand()-.5)*38,z=(rand()-.5)*35;
      if(Math.abs(x)<7.4&&Math.abs(z)<11.6)continue;
      const s=.12+rand()*.4;
      this.staticMesh(pebble,i%2?0x879375:0xc2c2a0,[x,s*.25,z],[rand(),rand(),rand()],[s,s*.5,s*.7]);
    }
    const grass = new THREE.ConeGeometry(.14,.5,3);
    for(let i=0;i<140;i++){
      const x=(rand()-.5)*37,z=(rand()-.5)*34;
      if(Math.abs(x)<7&&Math.abs(z)<11)continue;
      this.staticMesh(grass,i%5?0x8aab71:0xefe0a2,[x,.16,z],null,[1, .5+rand(),1]);
    }
    // Low timber rail on the plateau's back edge.
    for (let x=-15;x<=15;x+=3) this.staticMesh(new THREE.BoxGeometry(.18,1.1,.18),0x8a805b,[x,.55,-14.3],null,null,true);
    for (const y of [.43,.88]) this.staticMesh(new THREE.BoxGeometry(30,.12,.12),0xb2a276,[0,y,-14.3],null,null,true);
    this.bench(-9,2,Math.PI/2); this.bench(9,-4,-Math.PI/2);
    this.sign(8,7,'HIGH COURT','ALT. 2,400 M');
    this.sign(-9,-8,'SUMMIT','VOLLEY CLUB');
    // Festival bunting creates a readable silhouette without textures.
    const rope = [];
    for(let i=0;i<=20;i++){const z=-11+i*1.1;rope.push(new THREE.Vector3(7.9,3.7-Math.sin(i/20*Math.PI)*.45,z));}
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(rope),new THREE.LineBasicMaterial({color:0x6c7859}));this.scene.add(line);
    for(const z of[-11,11])this.box(.1,4,.1,0xa58c59,7.9,2,z);
    for(let i=0;i<18;i++){
      const z=-10+i*1.15,y=3.7-Math.sin((z+11)/22*Math.PI)*.45;
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([7.9,y,z,7.9,y,z+.65,7.9,y-.75,z+.3],3));geo.computeVertexNormals();
      const material=new THREE.MeshBasicMaterial({color:[0xef865e,0xf5d36e,0xf1edcf,0x4d8a71][i%4],side:THREE.DoubleSide});
      this.scene.add(new THREE.Mesh(geo,material));
    }
    // Quiet cloud shapes beyond the mountains.
    for(let i=0;i<6;i++)for(let j=0;j<3;j++)this.staticMesh(new THREE.IcosahedronGeometry(3,1),0xe7eadb,[-65+i*25+j*3,31+Math.sin(i*4)*8,-100],[0,0,0],[2.2, .7+j*.12,1],false,-95);
  }
  bench(x,z,rotation) {
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;this.scene.add(g);
    this.box(2.8,.13,.65,0xc8aa70,0,.65,0,g);
    this.box(2.8,.5,.13,0xc8aa70,0,1.1,-.27,g);
    for(const dx of[-1,1])this.box(.15,.65,.5,0x5e6c52,dx,.32,0,g);
    this.mesh(new THREE.CylinderGeometry(.16,.16,.65,8),0xf1d576,1,.99,.05,g);
  }
  sign(x,z,title,subtitle) {
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=-.15;this.scene.add(g);
    this.box(.13,2,.13,0x7e7b57,0,1,0,g);
    const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');
    ctx.fillStyle='#f5f0d6';ctx.fillRect(0,0,512,256);ctx.strokeStyle='#3e6551';ctx.lineWidth=8;ctx.strokeRect(14,14,484,228);
    ctx.fillStyle='#2f5546';ctx.textAlign='center';ctx.font='900 63px Arial';ctx.fillText(title,256,120);ctx.font='bold 26px Arial';ctx.fillText(subtitle,256,172);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.BoxGeometry(2.8,1.4,.1),new THREE.MeshToonMaterial({map:t,gradientMap:this.gradient}));m.position.y=2;g.add(m);
  }
  court() {
    this.box(13,.07,22,0xd5c8a0,0,-.015,0);
    this.box(9,.035,18,0x699c83,0,.032,0);
    this.box(9,.005,9,0x74a78a,0,.053,4.5);
    const white=0xf9f1d6;
    for(const x of[-4.5,4.5])this.box(.065,.012,18.07,white,x,.063,0);
    for(const z of[-9,-3,0,3,9])this.box(9.06,.012,.065,white,0,.063,z);
    this.box(9,.01,6,0x82ac8d,0,.055,0);
    // Restore attack and centre lines above the lighter attack zone.
    for(const z of[-3,0,3])this.box(9,.013,.06,white,0,.069,z);
    const netGeo=new THREE.BufferGeometry();const points=[];
    for(let x=-5;x<=5.001;x+=.25)points.push(x,1.2,0,x,2.35,0);
    for(let y=1.2;y<=2.351;y+=.19)points.push(-5,y,0,5,y,0);
    netGeo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    const net=new THREE.LineSegments(netGeo,new THREE.LineBasicMaterial({color:0x2d5348,transparent:true,opacity:.6}));net.userData.dynamic=true;this.scene.add(net);
    this.box(10.2,.09,.065,white,0,2.35,0).userData.dynamic=true;
    this.box(10.1,.045,.04,white,0,1.2,0).userData.dynamic=true;
    for(const x of[-5.02,5.02]){
      this.mesh(new THREE.CylinderGeometry(.105,.105,3,8),PALETTE.ink,x,1.5,0).userData.dynamic=true;
      this.mesh(new THREE.CylinderGeometry(.21,.21,1.4,8),PALETTE.orange,x,.72,0).userData.dynamic=true;
      for(let y=2.35;y<3.3;y+=.15)this.box(.035,.15,.035,Math.round(y*100)%30<15?PALETTE.paper:PALETTE.orange,x,y,.02);
      const rope=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,2.8,0),new THREE.Vector3(x*1.3,.02,1.3)]),new THREE.LineBasicMaterial({color:0xa28f64}));this.scene.add(rope);
    }
    const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#f1e8c9';ctx.font='900 80px Arial';ctx.textAlign='center';ctx.fillText('S U M M I T   V O L L E Y',512,150);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
    const decal=new THREE.Mesh(new THREE.PlaneGeometry(7.8,1.95),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,opacity:.65}));decal.rotation.x=-Math.PI/2;decal.position.set(0,.045,10.2);decal.userData.softwareLayer=-20;this.scene.add(decal);
  }
  circle(radius,color,opacity) {
    const mesh=new THREE.Mesh(new THREE.CircleGeometry(radius,24),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.y=.082;mesh.userData.softwareLayer=-10;mesh.userData.dynamic=true;return mesh;
  }
  ring(radius,color,dashed=false) {
    const group=new THREE.Group();
    group.userData.dynamic=true;
    const m=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.92,depthWrite:false});
    if(dashed){for(let i=0;i<12;i++){const arc=new THREE.Mesh(new THREE.RingGeometry(radius-.025,radius,3,1,i*Math.PI/6,.32),m);arc.rotation.x=-Math.PI/2;group.add(arc);}}
    else{
      const ring=new THREE.Mesh(new THREE.RingGeometry(radius-.04,radius,40),m);ring.rotation.x=-Math.PI/2;group.add(ring);
      for(let i=0;i<4;i++){const bar=new THREE.Mesh(new THREE.BoxGeometry(.22,.012,.035),m);bar.position.set(Math.cos(i*Math.PI/2)*(radius+.13),0,Math.sin(i*Math.PI/2)*(radius+.13));bar.rotation.y=-i*Math.PI/2;group.add(bar);}
      const dot=this.circle(.045,color,1);dot.position.y=0;group.add(dot);
    }
    group.position.y=.095;return group;
  }
  makeBall() {
    const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');
    ctx.fillStyle='#f7efd3';ctx.fillRect(0,0,512,256);
    for(let panel=0;panel<6;panel++){
      ctx.fillStyle=['#eeb75d','#faf4dc','#478b7b'][panel%3];
      ctx.beginPath();
      for(let y=0;y<=256;y+=4){const x=panel*512/6+18*Math.sin(y/256*Math.PI*2);y?ctx.lineTo(x,y):ctx.moveTo(x,y);}
      for(let y=256;y>=0;y-=4)ctx.lineTo((panel+1)*512/6+18*Math.sin(y/256*Math.PI*2),y);
      ctx.closePath();ctx.fill();ctx.strokeStyle='#657567';ctx.lineWidth=2;ctx.stroke();
      for(const off of[.34,.67]){ctx.beginPath();for(let y=0;y<=256;y+=4){const x=(panel+off)*512/6+18*Math.sin(y/256*Math.PI*2);y?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.strokeStyle='rgba(75,90,70,.4)';ctx.lineWidth=1;ctx.stroke();}
    }
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const ball=new THREE.Mesh(new THREE.SphereGeometry(R,this.renderer.isSoftware?12:20,this.renderer.isSoftware?8:14),new THREE.MeshToonMaterial({map:texture,gradientMap:this.gradient}));ball.castShadow=true;ball.userData.dynamic=true;this.scene.add(ball);
    const shell=new THREE.Mesh(new THREE.SphereGeometry(R*1.045,16,12),new THREE.MeshBasicMaterial({color:0x354c3f,side:THREE.BackSide}));ball.add(shell);return ball;
  }
  makeCharacter(side,index,controlled,color,skinId='club') {
    const kit=SKINS.find(s=>s.id===skinId)||SKINS[0],teamColor=color;if(kit.id!=='club')color=Number(kit.color.replace('#','0x'));
    const soft=this.renderer.isSoftware;
    const root=new THREE.Group(), body=new THREE.Group();root.userData.dynamic=true;root.add(body);this.scene.add(root);
    const skin=[0xf0c18d,0xb77f59,0xe6aa75,0x81553e][index%4];
    const outlineMat=new THREE.MeshBasicMaterial({color:0x304c3e,side:THREE.BackSide});
    const outlined=(geo,col,x,y,z,parent=body)=>{const m=this.mesh(geo,col,x,y,z,parent);const outline=new THREE.Mesh(geo,outlineMat);outline.scale.setScalar(1.045);m.add(outline);return m;};
    const torso=outlined(new THREE.CylinderGeometry(.31,.37,.62,8),color,0,1.05,0);torso.scale.z=.8;
    outlined(new THREE.CylinderGeometry(.37,.33,.25,8),0xf0ead2,0,.64,0).scale.z=.8;
    const head=outlined(new THREE.SphereGeometry(.32,soft?8:12,soft?6:9),skin,0,1.61,0);head.scale.set(1,1.05,.95);
    const hair=outlined(new THREE.SphereGeometry(.325,soft?8:12,soft?4:7,0,Math.PI*2,0,1.3),index%2?0x533d32:0x38413b,0,1.65,0);
    this.mesh(new THREE.CylinderGeometry(.328,.328,.075,12),color,0,1.73,0,body);
    // Local forward is negative Z. Face has two eyes, brows, and a small nose.
    for(const x of[-.106,.106]){
      const eye=this.mesh(new THREE.SphereGeometry(.033,soft?4:6,soft?2:5),0x273b34,x,1.62,-.293,body,false);eye.scale.y=1.2;
      this.box(.07,.018,.02,0x473e32,x,1.72,-.276,body);
    }
    this.mesh(new THREE.SphereGeometry(.056,6,5),skin,0,1.56,-.32,body);
    const armGeo=new THREE.CylinderGeometry(.105,.115,.48,7);
    const legGeo=new THREE.CylinderGeometry(.115,.14,.5,7);
    const arms=[],legs=[];
    for(const s of[-1,1]){
      const arm=new THREE.Group();arm.position.set(s*.35,1.3,0);body.add(arm);
      outlined(armGeo,color,0,-.20,0,arm);
      outlined(new THREE.SphereGeometry(.12,soft?6:8,soft?4:6),skin,0,-.47,0,arm);arms.push(arm);
      const leg=new THREE.Group();leg.position.set(s*.18,.64,0);body.add(leg);
      outlined(legGeo,skin,0,-.24,0,leg);
      outlined(new THREE.CylinderGeometry(.12,.13,.16,7),0xf6f0d9,0,-.43,0,leg);
      const shoe=outlined(new THREE.BoxGeometry(.26,.16,.41),color,0,-.53,-.07,leg);legs.push(leg);
    }
    if(kit.style==='cap'){this.box(.52,.07,.37,Number(kit.accent.replace('#','0x')),0,1.83,-.18,body);}else if(kit.style==='beanie'){this.mesh(new THREE.SphereGeometry(.34,8,5,0,Math.PI*2,0,1.45),Number(kit.accent.replace('#','0x')),0,1.73,0,body);this.mesh(new THREE.SphereGeometry(.09,6,4),color,0,2.05,0,body);}
    const badge=this.circle(.1,teamColor,1);badge.rotation.x=Math.PI/2;badge.position.set(.13,1.15,-.265);body.add(badge);
    const shadow=this.circle(.4,0x243f34,.16);this.scene.add(shadow);
    const ring=this.ring(controlled?.48:.35,teamColor);ring.visible=!!controlled;this.scene.add(ring);
    const arrow=new THREE.Mesh(new THREE.ConeGeometry(.13,.23,3),new THREE.MeshBasicMaterial({color:controlled===2?PALETTE.orange:PALETTE.paper}));arrow.rotation.z=Math.PI;arrow.position.y=2.22;root.add(arrow);arrow.visible=!!controlled;
    const result={root,body,head,arms,legs,shadow,ring,arrow,side,index,dispose:()=>{this.scene.remove(root,shadow,ring);root.traverse(o=>{if(o.isMesh){o.geometry.dispose();}});outlineMat.dispose();}};
    this.characters.push(result);return result;
  }
  setCourt(id='alpine'){
    const court=COURTS.find(c=>c.id===id)||COURTS[0];this.courtId=court.id;const [sky,...colors]=court.colors;
    this.scene.background.setHex(sky);this.scene.fog.color.setHex(sky);
    [0xa8bd7a,0xd5c8a0,0x699c83,0x74a78a,0x82ac8d].forEach((original,i)=>this.materials.get(original)?.color.setHex(colors[i]));
    if(this.renderer.isSoftware){this.renderer.materialCache=new WeakMap();this.renderer.backgroundKey='';}
    const label=document.querySelector('.location-label>div');if(label){label.replaceChildren(document.createTextNode(court.name.toUpperCase()));const sub=document.createElement('small');sub.textContent=court.description;label.append(sub);}
  }
  clearLabels(){this.labels?.forEach(x=>x.node.remove());this.labels=[];}
  refreshLabels(players){this.clearLabels();this.labels=players.map(p=>{const node=document.createElement('div');node.className='player-nametag'+(p.human?'':' ai');node.textContent=p.username+(p.human?' · Lv '+(p.level||1):'');node.style.borderColor=p.side===1?'#347c64':'#e97851';document.body.append(node);return {node,p};});}
  updateLabels(game){if(!this.labels?.length)return;for(const {node,p} of this.labels){node.hidden=game.phase==='menu'||!!game.modalType;if(node.hidden)continue;const v=this.tmp.set(p.x,p.y+2.65,p.z).project(this.camera);node.hidden=v.z>1||Math.abs(v.x)>1||Math.abs(v.y)>1;node.style.left=((v.x+1)*.5*innerWidth)+'px';node.style.top=((-v.y+1)*.5*innerHeight)+'px';node.classList.toggle('you',p.human===game.activeHumans()[0]);}}
  clearCharacters(){this.characters.forEach(c=>c.dispose());this.characters=[];}
  animateCharacter(p,time,dt) {
    const c=p.visual; c.root.position.set(p.x,p.y,p.z);
    const forward=p.side===1?0:Math.PI;
    let targetRot=forward;
    if(!p.human&&Number.isFinite(p.lookX)&&Number.isFinite(p.lookZ))targetRot=Math.atan2(p.x-p.lookX,p.z-p.lookZ);
    if(Math.hypot(p.vx,p.vz)>.4)targetRot=Math.atan2(-p.vx,-p.vz);
    if(p.actionTime>0||p.block)targetRot=forward;
    const diff=Math.atan2(Math.sin(targetRot-c.body.rotation.y),Math.cos(targetRot-c.body.rotation.y));c.body.rotation.y+=diff*Math.min(1,dt*14);
    const speed=Math.hypot(p.vx,p.vz), run=Math.sin(time*12+ p.index)*Math.min(1,speed/5);
    c.legs[0].rotation.x=run*.65;c.legs[1].rotation.x=-run*.65;
    c.arms[0].rotation.x=-run*.7;c.arms[1].rotation.x=run*.7;
    c.arms[0].rotation.z=.16;c.arms[1].rotation.z=-.16;
    if(p.y>.05){c.legs[0].rotation.x=-.35;c.legs[1].rotation.x=.3;}
    if(p.actionTime>0){
      const t=clamp(p.actionTime/.33,0,1);
      if(p.action==='set'||p.action==='block'){c.arms[0].rotation.x=c.arms[1].rotation.x=2.5*t;c.arms[0].rotation.z=.3;c.arms[1].rotation.z=-.3;}
      else if(p.action==='spike'||p.action==='serve'){c.arms[1].rotation.x=2.4*t;c.arms[0].rotation.x=.8*t;c.body.rotation.z=-Math.sin(t*Math.PI)*.12;}
      else{c.arms[0].rotation.x=c.arms[1].rotation.x=1.3*t;c.arms[0].rotation.z=-.2;c.arms[1].rotation.z=.2;}
    }else c.body.rotation.z*=.7;
    if(p.block){c.arms[0].rotation.x=c.arms[1].rotation.x=2.9;c.arms[0].rotation.z=.2;c.arms[1].rotation.z=-.2;}
    c.body.position.y=Math.abs(run)*.035+(p.y<=0?Math.sin(time*2+p.index)*.014:0);
    c.body.scale.set(1,1-Math.max(0,p.land||0)*.12,1);
    c.shadow.position.set(p.x,.084,p.z);c.shadow.scale.setScalar(1+p.y*.08);c.shadow.material.opacity=.18/(1+p.y*.5);
    c.ring.position.set(p.x,.09,p.z);c.arrow.position.y=2.25+Math.sin(time*3)*.035;
  }
  burst(x,y,z,power=1) {
    let count=0;
    for(const p of this.particles){if(p.life>0)continue;p.life=.35+rand()*.25;p.mesh.visible=true;p.mesh.position.set(x,y,z);p.mesh.scale.setScalar(1);p.vx=(rand()-.5)*5*power;p.vz=(rand()-.5)*5*power;p.vy=2+rand()*3*power;if(++count>=Math.floor(8*power))break;}
    this.ball.scale.set(1.2,.8,1.15);
  }
  updateEffects(dt,ball,live) {
    for(const p of this.particles){if(p.life<=0)continue;p.life-=dt;p.mesh.visible=p.life>0;p.vy-=9*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.mesh.scale.setScalar(Math.max(0,p.life*2));}
    this.ball.position.set(ball.x,ball.y,ball.z);
    this.ball.rotation.x+=ball.vz*dt*1.5;this.ball.rotation.z-=ball.vx*dt*1.5;
    this.ball.scale.lerp(new THREE.Vector3(1,1,1),Math.min(1,dt*15));
    this.ballShadow.position.set(ball.x,.087,ball.z);this.ballShadow.scale.setScalar(1+ball.y*.09);this.ballShadow.material.opacity=.28/(1+ball.y*.17);
    this.ballShadow.visible=Math.abs(ball.x)<21&&Math.abs(ball.z)<21;
    this.trailCounter+=dt;
    const fast=live&&Math.hypot(ball.vx,ball.vy,ball.vz)>13;
    if(this.trailCounter>.027){this.trailCounter=0;for(let i=this.trail.length-1;i>0;i--)this.trail[i].position.copy(this.trail[i-1].position);this.trail[0].position.copy(this.ball.position);}
    this.trail.forEach(m=>m.visible=fast);
  }
  aimAt(clientX,clientY) {
    const r=this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),this.camera);
    const hit=this.ray.ray.intersectPlane(this.groundPlane,this.tmp);
    return hit?{x:clamp(hit.x,-5.4,5.4),z:clamp(hit.z,-10,10)}:null;
  }
  setQuality(quality) {
    this.quality=quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,quality==='low'?1:quality==='high'?2:1.35));
    this.renderer.shadowMap.enabled=quality!=='low';this.renderer.shadowMap.needsUpdate=true;
    this.resize();
  }
  resize(){const w=window.innerWidth,h=window.innerHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  render(state,dt,time) {
    let pos,look;
    const narrow=window.innerWidth/window.innerHeight<1.15;
    if(state.phase==='menu'){
      const a=.05*Math.sin(time*.13);
      pos=new THREE.Vector3(20+Math.sin(a)*15,17,28+Math.cos(a)*.5);
      look=new THREE.Vector3(narrow?-3.5:-6,1.4,0);
      this.camera.fov=narrow?58:43;
    }else{
      const p=state.players[0];const wide=['local','lan'].includes(state.mode)||state.settings.camera==='wide';
      pos=new THREE.Vector3(wide?0:p.x*.18,wide?17:14.5,(narrow?31:24)+(wide?3:p.z*.08));
      look=new THREE.Vector3(wide?0:(p.x*.10+state.ball.x*.06),1.4,wide?0:state.ball.z*.04);
      this.camera.fov=narrow?57:46;
    }
    if(this.renderer.isSoftware){
      if(state.phase==='menu'){this.camera.position.set(20,17,28.5);this.look.set(narrow?-3.5:-6,1.4,0);}
      else{this.camera.position.set(0,16,narrow?34:25.5);this.look.set(0,1.4,0);}
    }else{this.camera.position.lerp(pos,Math.min(1,dt*3));this.look.lerp(look,Math.min(1,dt*4));}
    this.camera.lookAt(this.look);this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);
  }
}
