export const SKINS = [
  {id:'club',name:'Club Original',price:0,color:'#347c64',accent:'#f5f0d6',style:'band'},
  {id:'sunrise',name:'Sunrise Scout',price:60,color:'#ed9a49',accent:'#fff0c2',style:'cap'},
  {id:'glacier',name:'Glacier Guide',price:200,color:'#629fc5',accent:'#d9f5fa',style:'beanie'},
  {id:'berry',name:'Berry Hiker',price:280,color:'#a569aa',accent:'#f3c5df',style:'cap'},
  {id:'night',name:'Night Ranger',price:400,color:'#37475e',accent:'#e9ca65',style:'beanie'}
];
export const COURTS = [
  {id:'alpine',name:'Alpine Club',price:0,description:'Pine trees, mint court, mountain air.',colors:[0xb8d8d0,0xa8bd7a,0xd5c8a0,0x699c83,0x74a78a,0x82ac8d]},
  {id:'sunset',name:'Golden Hour',price:180,description:'Warm peach skies and a terracotta court.',colors:[0xecc4ac,0xbcb879,0xe6c292,0xb8735b,0xc38c69,0xd29b76]},
  {id:'glacier',name:'Glacier Pass',price:320,description:'Snowy ground and a blue ice court.',colors:[0xcbdfe9,0xe0e9df,0xc3d3db,0x6796b5,0x80adc4,0x98c0cc]},
  {id:'twilight',name:'Twilight Ridge',price:450,description:'Violet dusk and a lavender court.',colors:[0x8891b5,0x899795,0xb8b0bd,0x6c729e,0x8383ab,0x9897ba]}
];
export const QUESTS=[{id:'rallies',name:'Find your rhythm',goal:12,coins:50,xp:40,label:'rallies played'}, {id:'touches',name:'Good hands',goal:25,coins:70,xp:60,label:'clean touches'}, {id:'wins',name:'Reach the summit',goal:2,coins:100,xp:100,label:'match wins'}];
export const dayKey=()=>new Date().toISOString().slice(0,10);
export const levelFor=xp=>1+Math.floor(Math.sqrt(Math.max(0,xp)/100));
export function freshProfile(){return {coins:80,xp:0,skin:'club',court:'alpine',skins:['club'],courts:['alpine'],matches:0,wins:0,daily:{day:dayKey(),rallies:0,touches:0,wins:0,claimed:[]},events:[]};}
export function normalizeProfile(p={}){const f=freshProfile();p={...f,...p};for(const k of['coins','xp','matches','wins'])p[k]=Math.max(0,Math.min(1e9,Number(p[k])||0));p.skins=SKINS.filter(s=>s.price===0||p.skins?.includes(s.id)).map(s=>s.id);p.courts=COURTS.filter(s=>s.price===0||p.courts?.includes(s.id)).map(s=>s.id);if(!p.skins.includes(p.skin))p.skin='club';if(!p.courts.includes(p.court))p.court='alpine';if(p.daily?.day!==dayKey())p.daily=f.daily;p.events=Array.isArray(p.events)?p.events.slice(-100):[];return p;}
export function reward(profile,event){
  const p=normalizeProfile(profile);if(!event.id||p.events.includes(event.id))return p;p.events.push(event.id);p.events=p.events.slice(-100);
  const rallies=Math.min(1,Math.max(0,event.rallies||0)),touches=Math.min(15,Math.max(0,event.touches||0)),finished=!!event.finished,won=finished&&!!event.won;
  p.xp+=rallies*8+touches*2+(finished?50:0)+(won?30:0);p.coins+=rallies*3+(finished?25:0)+(won?20:0);p.matches+=Number(finished);p.wins+=Number(won);
  p.daily.rallies+=rallies;p.daily.touches+=touches;p.daily.wins+=Number(won);
  for(const q of QUESTS)if(p.daily[q.id]>=q.goal&&!p.daily.claimed.includes(q.id)){p.daily.claimed.push(q.id);p.coins+=q.coins;p.xp+=q.xp;}
  return p;
}
export function customize(profile,kind,id){const p=normalizeProfile(profile),list=kind==='skin'?SKINS:kind==='court'?COURTS:null;if(!list)throw new Error('Unknown cosmetic.');const item=list.find(i=>i.id===id);if(!item)throw new Error('Unknown cosmetic.');const owned=kind==='skin'?p.skins:p.courts;if(!owned.includes(id)){if(p.coins<item.price)throw new Error('Play more rallies to earn enough coins.');p.coins-=item.price;owned.push(id);}p[kind]=id;return p;}
