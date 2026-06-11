const header=document.getElementById('header');
window.addEventListener('scroll',()=>header.classList.toggle('scrolled',window.scrollY>20));

const menuBtn=document.getElementById('menuBtn'),mobileNav=document.getElementById('mobileNav');
function mnav(open){mobileNav.classList.toggle('open',open);document.body.style.overflow=open?'hidden':'';}
menuBtn.addEventListener('click',()=>mnav(!mobileNav.classList.contains('open')));
var mnClose=document.getElementById('mobileNavClose');if(mnClose)mnClose.addEventListener('click',()=>mnav(false));
mobileNav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>mnav(false)));

const tabs=document.getElementById('tabs');
tabs.addEventListener('click',e=>{const t=e.target.closest('.tab');if(!t)return;const i=+t.dataset.tab;
    tabs.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',+x.dataset.tab===i));
    document.querySelectorAll('#clientPanels .client__panel').forEach(p=>p.hidden=(+p.dataset.tab!==i));});

const streamSlides=[...document.querySelectorAll('#streamTrack .stream__slide')];
const streamDots=[...document.querySelectorAll('#streamDots i')];
let cur=0;
function streamShow(i){cur=(i+streamSlides.length)%streamSlides.length;
    streamSlides.forEach((s,k)=>s.hidden=(k!==cur));
    streamDots.forEach((d,k)=>d.classList.toggle('on',k===cur));}
document.getElementById('streamNext').addEventListener('click',()=>streamShow(cur+1));
document.getElementById('streamPrev').addEventListener('click',()=>streamShow(cur-1));
document.getElementById('streamDots').addEventListener('click',e=>{const d=e.target.closest('i');if(!d)return;streamShow(streamDots.indexOf(d));});
streamShow(0);

(function(){var p=document.getElementById('preloader');if(!p)return;function hide(){p.classList.add('hide');}window.addEventListener('load',function(){setTimeout(hide,600);});setTimeout(hide,5000);})();

/* ===== PC fullpage: one wheel/key = one screen ===== */
(function(){
    var screens = Array.prototype.slice.call(document.querySelectorAll('.screen'));
    if(!screens.length) return;
    var animating=false, lockT;
    function pcMode(){ return window.matchMedia('(min-width:1201px) and (min-height:700px)').matches; }
    function nearest(){ var b=0,bd=Infinity; screens.forEach(function(s,i){var d=Math.abs(s.getBoundingClientRect().top); if(d<bd){bd=d;b=i;}}); return b; }
    function go(i){
        i=Math.max(0,Math.min(screens.length-1,i));
        animating=true;
        screens[i].scrollIntoView({behavior:'smooth',block:'start'});
        clearTimeout(lockT); lockT=setTimeout(function(){animating=false;},850);
    }
    window.addEventListener('wheel',function(e){
        if(!pcMode()) return;            /* tablets/phones: native scroll */
        e.preventDefault();
        if(animating || Math.abs(e.deltaY)<4) return;
        go(nearest() + (e.deltaY>0?1:-1));
    },{passive:false});
    window.addEventListener('keydown',function(e){
        if(!pcMode()) return;
        var k=e.key;
        if(k==='ArrowDown'||k==='PageDown'||k===' '){ e.preventDefault(); if(!animating) go(nearest()+1); }
        else if(k==='ArrowUp'||k==='PageUp'){ e.preventDefault(); if(!animating) go(nearest()-1); }
        else if(k==='Home'){ e.preventDefault(); go(0); }
        else if(k==='End'){ e.preventDefault(); go(screens.length-1); }
    });
    /* nav anchor links (e.g. #files) still land on the right screen */
})();