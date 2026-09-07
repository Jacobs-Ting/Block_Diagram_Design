(function(P){
  'use strict';
  function apply(){const theme=P.state.appearance?.theme==='light'?'light':'dark';document.documentElement.dataset.theme=theme;const button=document.getElementById('theme-toggle');button.textContent=theme==='dark'?'☀ 淺色':'☾ 深色';button.setAttribute('aria-label',theme==='dark'?'切換為淺色主題':'切換為深色主題');}
  document.getElementById('theme-toggle').addEventListener('click',()=>P.setTheme(P.state.appearance?.theme==='light'?'dark':'light'));
  P.subscribe(({type})=>{if(type==='theme'||type==='project-load')apply();});apply();
})(window.Planner);
