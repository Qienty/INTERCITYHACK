// Presentation state only; quotation and project state live in existing modules.
let briefOpen=false;
export function syncStudioShell(){
  document.body.classList.remove('nav-open');
  const main=document.querySelector('.main');if(main)main.inert=false;
  const bench=document.querySelector('.workbench');if(bench)bench.dataset.briefOpen=String(briefOpen);
  const toggle=document.querySelector('[data-ui-brief]');if(toggle)toggle.setAttribute('aria-expanded',String(briefOpen));
}
function toggleNavigation(open){
  document.body.classList.toggle('nav-open',open);
  const trigger=document.querySelector('[data-ui-nav]'),sidebar=document.querySelector('.sidebar'),main=document.querySelector('.main');
  trigger?.setAttribute('aria-expanded',String(open));
  if(main)main.inert=open;
  if(open)sidebar?.querySelector('[aria-current=page]')?.focus();else trigger?.focus();
}
document.addEventListener('click',event=>{
  if(event.target.closest('[data-page]')&&document.body.classList.contains('nav-open'))queueMicrotask(()=>document.querySelector('#workspace')?.focus({preventScroll:true}));
  if(event.target.closest('[data-ui-nav]'))toggleNavigation(!document.body.classList.contains('nav-open'));
  if(event.target.closest('[data-ui-nav-close]'))toggleNavigation(false);
  if(event.target.closest('[data-ui-brief]')){briefOpen=!briefOpen;syncStudioShell();}
},true);
document.addEventListener('keydown',event=>{
  if(!document.body.classList.contains('nav-open'))return;
  if(event.key==='Escape'){
    // Dismiss a search result before closing its navigation drawer.
    if(document.querySelector('.materials-results-panel')?.checkVisibility())return;
    event.preventDefault();toggleNavigation(false);
  }
  if(event.key==='Tab'){
    const items=[...document.querySelectorAll('.sidebar button,.sidebar input')].filter(el=>el.getClientRects().length&&!el.disabled);
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
},true);
matchMedia('(max-width: 1100px)').addEventListener('change',event=>{if(!event.matches)toggleNavigation(false);});
