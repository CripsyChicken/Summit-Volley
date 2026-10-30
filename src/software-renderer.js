// A small perspective renderer for browsers without a WebGL context.
// It draws the same 3D meshes and camera, with flat three-band lighting.
import * as THREE from 'three';

export class SoftwareRenderer {
  constructor(canvas){
    this.domElement=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    if(!this.ctx)throw new Error('A canvas renderer is unavailable.');
    this.isSoftware=true;this.shadowMap={enabled:false,needsUpdate:false};this.info={render:{calls:0,triangles:0}};
    this.ratio=1;this.geometryCache=new WeakMap();this.materialCache=new WeakMap();this.textureCache=new WeakMap();this.mvp=new THREE.Matrix4();this.view=new THREE.Matrix4();this.faces=[];this.facePool=[];
    this.light=new THREE.Vector3(-17,30,12).normalize();
    this.background=document.createElement('canvas');this.backgroundKey='';
  }
  setPixelRatio(r){this.ratio=Math.min(r,1);}
  setSize(w,h){this.width=w;this.height=h;this.domElement.width=Math.round(w*this.ratio);this.domElement.height=Math.round(h*this.ratio);this.background.width=this.domElement.width;this.background.height=this.domElement.height;this.backgroundKey='';}
  geometry(g){
    let cached=this.geometryCache.get(g);if(cached)return cached;
    const pos=g.attributes.position?.array;if(!pos)return null;
    const ix=g.index?.array;const count=ix?ix.length:pos.length/3;const triangles=[];
    const uv=g.attributes.uv?.array;
    for(let k=0;k<count;k+=3){
      const a=ix?ix[k]:k,b=ix?ix[k+1]:k+1,c=ix?ix[k+2]:k+2;
      if(c===undefined)break;
      const ax=pos[b*3]-pos[a*3],ay=pos[b*3+1]-pos[a*3+1],az=pos[b*3+2]-pos[a*3+2];
      const bx=pos[c*3]-pos[a*3],by=pos[c*3+1]-pos[a*3+1],bz=pos[c*3+2]-pos[a*3+2];
      let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;const l=Math.hypot(nx,ny,nz)||1;
      triangles.push({a,b,c,nx:nx/l,ny:ny/l,nz:nz/l,u:uv?(uv[a*2]+uv[b*2]+uv[c*2])/3:0,v:uv?(uv[a*2+1]+uv[b*2+1]+uv[c*2+1])/3:0});
    }
    cached={pos,triangles,projected:new Float32Array(pos.length),uv};this.geometryCache.set(g,cached);return cached;
  }
  color(material,level,fog=0,sampled=null){
    let cache=this.materialCache.get(material);if(!cache){cache=new Map();this.materialCache.set(material,cache);}
    const key=(sampled?sampled.join(','):'')+':'+level+':'+fog;
    let value=cache.get(key);if(value)return value;
    const col=material.color||new THREE.Color(1,1,1);
    const base=sampled||col.clone().convertLinearToSRGB().toArray().map(v=>Math.round(v*255));
    const multiplier=material.isMeshBasicMaterial||material.isLineBasicMaterial?1:[.64,.84,1][level];
    const sky=[184,216,208],alpha=fog/10;
    const rgb=base.map((n,i)=>Math.round(n*multiplier*(1-alpha)+sky[i]*alpha));value=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;cache.set(key,value);return value;
  }
  texture(texture){
    if(!texture?.image)return null;let cache=this.textureCache.get(texture);if(cache)return cache;
    try{const ctx=texture.image.getContext('2d');cache=ctx.getImageData(0,0,texture.image.width,texture.image.height);this.textureCache.set(texture,cache);return cache;}catch{return null;}
  }
  render(scene,camera){
    camera.updateMatrixWorld();
    const key=[...camera.matrixWorld.elements,...camera.projectionMatrix.elements].map(n=>n.toFixed(4)).join(',');
    if(key!==this.backgroundKey){
      this.renderPass(scene,camera,false);
      const bg=this.background.getContext('2d',{alpha:false});bg.drawImage(this.domElement,0,0);this.backgroundKey=key;
    }
    this.ctx.setTransform(1,0,0,1,0,0);this.ctx.globalAlpha=1;this.ctx.drawImage(this.background,0,0);
    this.renderPass(scene,camera,true);
  }
  renderPass(scene,camera,dynamic){
    const ctx=this.ctx,w=this.width,h=this.height;ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.globalAlpha=1;if(!dynamic){ctx.fillStyle='#'+scene.background.getHexString();ctx.fillRect(0,0,w,h);}
    scene.updateMatrixWorld();camera.updateMatrixWorld();this.view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.faces.length=0;let calls=0,pooled=0;
    const add=data=>{let f=this.facePool[pooled];if(!f){f={};this.facePool.push(f);}pooled++;Object.assign(f,data);this.faces.push(f);};
    scene.traverseVisible(obj=>{
      if((!obj.isMesh&&!obj.isLine)||!obj.geometry||!obj.material)return;
      let isDynamic=false;for(let parent=obj;parent;parent=parent.parent){if(parent.userData.dynamic){isDynamic=true;break;}}
      if(isDynamic!==dynamic)return;
      const material=Array.isArray(obj.material)?obj.material[0]:obj.material;
      // Outlines are optional in this path; flat bands preserve the cel style.
      if(material.side===THREE.BackSide)return;
      const g=this.geometry(obj.geometry);if(!g)return;calls++;
      let layer=obj.userData.softwareLayer||0;
      const gp=obj.geometry.parameters;
      if(gp?.height<=.1&&obj.matrixWorld.elements[13]<.15)layer=-40+obj.matrixWorld.elements[13]*20;
      if(obj.geometry.type==='RingGeometry')layer=-9;
      this.mvp.multiplyMatrices(this.view,obj.matrixWorld);const m=this.mvp.elements,p=g.pos,q=g.projected;
      for(let i=0;i<p.length;i+=3){const x=p[i],y=p[i+1],z=p[i+2],d=m[3]*x+m[7]*y+m[11]*z+m[15];q[i]=(m[0]*x+m[4]*y+m[8]*z+m[12])/d*w*.5+w*.5;q[i+1]=-(m[1]*x+m[5]*y+m[9]*z+m[13])/d*h*.5+h*.5;q[i+2]=d;}
      const wm=obj.matrixWorld.elements;const texture=this.texture(material.map);
      if(obj.isLine){
        const stride=obj.isLineSegments?2:1;
        for(let i=0;i<p.length/3-1;i+=stride){const a=i*3,b=(i+1)*3;if(q[a+2]<.2||q[b+2]<.2)continue;add({layer,line:true,x1:q[a],y1:q[a+1],x2:q[b],y2:q[b+1],depth:(q[a+2]+q[b+2])*.5,color:this.color(material,2),opacity:material.opacity,texture:null});}return;
      }
      for(const tri of g.triangles){
        const a=tri.a*3,b=tri.b*3,c=tri.c*3;
        if(q[a+2]<.2||q[b+2]<.2||q[c+2]<.2)continue;
        const x1=q[a],y1=q[a+1],x2=q[b],y2=q[b+1],x3=q[c],y3=q[c+1];
        if(Math.max(x1,x2,x3)<0||Math.min(x1,x2,x3)>w||Math.max(y1,y2,y3)<0||Math.min(y1,y2,y3)>h)continue;
        const cross=(x2-x1)*(y3-y1)-(y2-y1)*(x3-x1);
        if(material.side!==THREE.DoubleSide&&cross>=0)continue;
        if(Math.abs(cross)<.07)continue;
        const nx=wm[0]*tri.nx+wm[4]*tri.ny+wm[8]*tri.nz,ny=wm[1]*tri.nx+wm[5]*tri.ny+wm[9]*tri.nz,nz=wm[2]*tri.nx+wm[6]*tri.ny+wm[10]*tri.nz;
        const d=(nx*this.light.x+ny*this.light.y+nz*this.light.z)/(Math.hypot(nx,ny,nz)||1);const level=d<-.13?0:d<.45?1:2;
        const depth=(q[a+2]+q[b+2]+q[c+2])/3;const fog=material.fog===false?0:Math.round(Math.max(0,Math.min(.85,(depth-55)/95))*10);
        const textured=texture&&g.triangles.length<=12;
        let sampled=null;
        if(texture){const tx=Math.max(0,Math.min(texture.width-1,Math.floor(tri.u*texture.width))),ty=Math.max(0,Math.min(texture.height-1,Math.floor((1-tri.v)*texture.height)));const idx=(ty*texture.width+tx)*4;sampled=[texture.data[idx],texture.data[idx+1],texture.data[idx+2]];if(!textured&&texture.data[idx+3]<32)continue;}
        add({layer,line:false,x1,y1,x2,y2,x3,y3,depth,color:this.color(material,level,fog,sampled),opacity:material.opacity,texture:textured?material.map.image:null,uv:textured?[g.uv[tri.a*2],g.uv[tri.a*2+1],g.uv[tri.b*2],g.uv[tri.b*2+1],g.uv[tri.c*2],g.uv[tri.c*2+1]]:null});
      }
    });
    this.faces.sort((a,b)=>a.layer-b.layer||b.depth-a.depth);
    for(const f of this.faces){
      ctx.globalAlpha=f.opacity;ctx.beginPath();ctx.moveTo(f.x1,f.y1);ctx.lineTo(f.x2,f.y2);
      if(f.line){ctx.strokeStyle=f.color;ctx.lineWidth=.7;ctx.stroke();continue;}
      ctx.lineTo(f.x3,f.y3);ctx.closePath();
      if(f.texture){
        const iw=f.texture.width,ih=f.texture.height,u1=f.uv[0]*iw,v1=(1-f.uv[1])*ih,u2=f.uv[2]*iw,v2=(1-f.uv[3])*ih,u3=f.uv[4]*iw,v3=(1-f.uv[5])*ih;
        const den=u1*(v2-v3)+u2*(v3-v1)+u3*(v1-v2);if(Math.abs(den)<.001)continue;
        const a=(f.x1*(v2-v3)+f.x2*(v3-v1)+f.x3*(v1-v2))/den,b=(f.y1*(v2-v3)+f.y2*(v3-v1)+f.y3*(v1-v2))/den;
        const c=(f.x1*(u3-u2)+f.x2*(u1-u3)+f.x3*(u2-u1))/den,d=(f.y1*(u3-u2)+f.y2*(u1-u3)+f.y3*(u2-u1))/den;
        const e=f.x1-a*u1-c*v1,ff=f.y1-b*u1-d*v1;ctx.save();ctx.clip();ctx.transform(a,b,c,d,e,ff);ctx.drawImage(f.texture,0,0);ctx.restore();
      }else{ctx.fillStyle=f.color;ctx.fill();if(f.opacity>.98){ctx.strokeStyle=f.color;ctx.lineWidth=.5;ctx.stroke();}}
    }
    ctx.globalAlpha=1;this.info.render.calls=calls;this.info.render.triangles=this.faces.length;
  }
}
