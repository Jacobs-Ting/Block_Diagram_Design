(function(P){
  'use strict';
  const size=p=>p.rotation%180?{w:p.height,h:p.width}:{w:p.width,h:p.height};
  const rect=p=>({...size(p),x:p.x,y:p.y});
  const hit=(a,b)=>a.x<b.x+b.w-1e-8&&a.x+a.w>b.x+1e-8&&a.y<b.y+b.h-1e-8&&a.y+a.h>b.y+1e-8;
  const side=p=>p.side||'top';
  function zones(p,c){const r=rect(p),out=[];if(c.keepOutSame){const m=c.keepOutMargin;out.push({x:r.x-m,y:r.y-m,w:r.w+2*m,h:r.h+2*m,side:side(p),owner:p.componentId,kind:'same'});}if(c.keepOutOpposite)out.push({...r,side:side(p)==='top'?'bottom':'top',owner:p.componentId,kind:'opposite'});return out;}
  function conflict(p,state=P.state){
    const c=state.components.find(c=>c.id===p.componentId);if(!c)return '找不到元件';
    for(const other of state.placements){if(other.componentId===p.componentId)continue;const owner=state.components.find(c=>c.id===other.componentId);if(!owner)continue;
      if(zones(other,owner).some(z=>z.side===side(p)&&hit(z,rect(p))))return `進入 ${owner.name} 的 Keep Out 區域`;
      if(zones(p,c).some(z=>z.side===side(other)&&hit(z,rect(other))))return `${c.name} 的 Keep Out 區域會涵蓋 ${owner.name}`;
    }return '';
  }
  function valid(p,state=P.state){if(!['x','y','width','height','rotation'].every(k=>Number.isFinite(p[k]))||p.width<=0||p.height<=0||![0,90,180,270].includes(p.rotation)||!['top','bottom'].includes(side(p)))return '擺件座標或尺寸無效';const s=size(p),b=state.board;if(p.x<0||p.y<0||p.x+s.w>b.width+1e-8||p.y+s.h>b.height+1e-8)return 'IC 超出電路板範圍';return conflict(p,state);}
  function all(state=P.state){for(const p of state.placements){const message=valid(p,state);if(message)return message;}return '';}
  function findSpace(p,state=P.state){
    const c=state.components.find(c=>c.id===p.componentId),s=size(p),xs=new Set([p.x,0,state.board.width-s.w]),ys=new Set([p.y,0,state.board.height-s.h]);
    const margin=c.keepOutSame?c.keepOutMargin:0;
    for(const other of state.placements){if(other.componentId===p.componentId)continue;const owner=state.components.find(c=>c.id===other.componentId),r=rect(other);
      // Obstacle edges plus the candidate's own clearance cover free rectangular corners.
      for(const z of [r,...zones(other,owner)]){for(const pad of [0,margin]){xs.add(z.x+z.w+pad);xs.add(z.x-s.w-pad);ys.add(z.y+z.h+pad);ys.add(z.y-s.h-pad);}}
    }
    for(const y of ys)for(const x of xs){const q={...p,x,y};if(!valid(q,state))return q;}return null;
  }
  P.boardRules={size,rect,zones,conflict,valid,all,findSpace};
  P.componentExtraDefaults={keepOutSame:false,keepOutOpposite:false,keepOutMargin:1,cpuCores:null,cpuClockMHz:null,memoryCapacity:null,memoryUnit:'GB'};
  P.validComponentExtras=c=>typeof c.keepOutSame==='boolean'&&typeof c.keepOutOpposite==='boolean'&&Number.isFinite(c.keepOutMargin)&&c.keepOutMargin>=0&&c.keepOutMargin<=1000&&(c.cpuCores===null||Number.isInteger(c.cpuCores)&&c.cpuCores>=1&&c.cpuCores<=1024)&&(c.cpuClockMHz===null||Number.isFinite(c.cpuClockMHz)&&c.cpuClockMHz>0&&c.cpuClockMHz<=100000)&&(c.memoryCapacity===null||Number.isFinite(c.memoryCapacity)&&c.memoryCapacity>0&&c.memoryCapacity<=1e9)&&['Mb','Gb','MB','GB','TB'].includes(c.memoryUnit);
})(window.Planner);
