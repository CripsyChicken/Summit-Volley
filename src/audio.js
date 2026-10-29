export class AudioBus {
  constructor(settings){this.settings=settings;this.ctx=null;}
  unlock(){try{this.ctx??=new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume();}catch{}}
  tone(freq,duration=.12,type='sine',gain=.16,delay=0,end=freq){
    if(!this.ctx||this.settings.muted||this.settings.volume===0)return;
    const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(gain*this.settings.volume,t+.008);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+duration+.02);
  }
  play(kind){
    if(kind==='point'){this.tone(440,.15,'sine',.15);this.tone(554,.15,'sine',.13,.1);this.tone(659,.23,'sine',.13,.2);}
    else if(kind==='spike'){this.tone(180,.14,'triangle',.35,0,42);this.tone(570,.045,'square',.035);}
    else if(kind==='block'){this.tone(145,.14,'triangle',.25,0,70);}
    else if(kind==='net'){this.tone(90,.12,'triangle',.12,0,40);}
    else if(kind==='floor'){this.tone(170,.09,'sine',.18,0,65);}
    else if(kind==='menu'){this.tone(650,.055,'sine',.06,0,850);}
    else if(kind==='jump'){this.tone(180,.085,'sine',.035,0,280);}
    else{this.tone(290,.09,'triangle',.2,0,90);this.tone(780,.04,'sine',.04);}
  }
}
