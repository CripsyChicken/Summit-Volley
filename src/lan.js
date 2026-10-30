import { PROTOCOL,validSnapshot } from './lan-protocol.js';
export class LanConnection {
  constructor(onMessage,onClose){this.onMessage=onMessage;this.onClose=onClose;this.socket=null;this.role=null;this.code='';this.peer=false;this.seq=0;this.timer=0;this.intentional=false;}
  async connect(){
    if(this.socket?.readyState===WebSocket.OPEN)return;
    this.intentional=false;
    const response=await fetch(new URL('lan-info',location.href),{signal:AbortSignal.timeout(3500)});
    if(!response.ok)throw new Error('Start the LAN server with npm start and open its printed address on both devices.');
    const info=await response.json();if(info.protocol!==PROTOCOL)throw new Error('This is not a compatible Summit Volley LAN server.');
    await new Promise((resolve,reject)=>{
      const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/lan`);this.socket=socket;
      const timeout=setTimeout(()=>{socket.close();reject(new Error('The LAN server did not respond.'));},5000);
      socket.onopen=()=>{clearTimeout(timeout);resolve();};
      socket.onerror=()=>{clearTimeout(timeout);reject(new Error('Could not connect to the LAN server.'));};
      socket.onclose=()=>{clearTimeout(timeout);if(this.socket===socket){this.role=null;this.peer=false;if(!this.intentional)this.onClose('Connection lost. Reopen LAN multiplayer to reconnect.');}};
      socket.onmessage=event=>{let m;try{m=JSON.parse(event.data);}catch{return;}
        if(m.type==='room'){this.role=m.role;this.code=m.code;this.id=m.id;this.peer=true;this.seq=0;}
        if(m.type==='start')this.seq=0;
        if(m.type==='guest-joined')this.peer=true;if(m.type==='guest-left')this.peer=false;
        if(m.type==='snapshot'&&!validSnapshot(m.state))return;
        this.onMessage(m);
      };
    });
  }
  send(message){if(this.socket?.readyState===WebSocket.OPEN&&this.socket.bufferedAmount<128*1024)this.socket.send(JSON.stringify(message));}
  input(data){this.send({type:'input',input:{...data,seq:this.seq++}});}
  action(action,power=.5){this.send({type:'action',action,power});}
  close(){this.intentional=true;this.send({type:'leave'});this.socket?.close();this.socket=null;this.role=null;this.code='';this.peer=false;}
}
