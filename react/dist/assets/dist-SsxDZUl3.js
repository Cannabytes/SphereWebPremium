import{a as e,n as t}from"./jsx-runtime-D57Vegw5.js";var n=e(t(),1),r={data:``},i=e=>{if(typeof window==`object`){let t=(e?e.querySelector(`#_goober`):window._goober)||Object.assign(document.createElement(`style`),{innerHTML:` `,id:`_goober`});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||r},a=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,o=/\/\*[^]*?\*\/|  +/g,s=/\n+/g,c=(e,t)=>{let n=``,r=``,i=``;for(let a in e){let o=e[a];a[0]==`@`?a[1]==`i`?n=a+` `+o+`;`:r+=a[1]==`f`?c(o,a):a+`{`+c(o,a[1]==`k`?``:t)+`}`:typeof o==`object`?r+=c(o,t?t.replace(/([^,])+/g,e=>a.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,t=>/&/.test(t)?t.replace(/&/g,e):e?e+` `+t:t)):a):o!=null&&(a=/^--/.test(a)?a:a.replace(/[A-Z]/g,`-$&`).toLowerCase(),i+=c.p?c.p(a,o):a+`:`+o+`;`)}return n+(t&&i?t+`{`+i+`}`:i)+r},l={},u=e=>{if(typeof e==`object`){let t=``;for(let n in e)t+=n+u(e[n]);return t}return e},d=(e,t,n,r,i)=>{let d=u(e),f=l[d]||(l[d]=(e=>{let t=0,n=11;for(;t<e.length;)n=101*n+e.charCodeAt(t++)>>>0;return`go`+n})(d));if(!l[f]){let t=d===e?(e=>{let t,n,r=[{}];for(;t=a.exec(e.replace(o,``));)t[4]?r.shift():t[3]?(n=t[3].replace(s,` `).trim(),r.unshift(r[0][n]=r[0][n]||{})):r[0][t[1]]=t[2].replace(s,` `).trim();return r[0]})(e):e;l[f]=c(i?{[`@keyframes `+f]:t}:t,n?``:`.`+f)}let p=n&&l.g?l.g:null;return n&&(l.g=l[f]),((e,t,n,r)=>{r?t.data=t.data.replace(r,e):t.data.indexOf(e)===-1&&(t.data=n?e+t.data:t.data+e)})(l[f],t,r,p),f},f=(e,t,n)=>e.reduce((e,r,i)=>{let a=t[i];if(a&&a.call){let e=a(n),t=e&&e.props&&e.props.className||/^go/.test(e)&&e;a=t?`.`+t:e&&typeof e==`object`?e.props?``:c(e,``):!1===e?``:e}return e+r+(a??``)},``);function p(e){let t=this||{},n=e.call?e(t.p):e;return d(n.unshift?n.raw?f(n,[].slice.call(arguments,1),t.p):n.reduce((e,n)=>Object.assign(e,n&&n.call?n(t.p):n),{}):n,i(t.target),t.g,t.o,t.k)}var m,h,g;p.bind({g:1});var _=p.bind({k:1});function v(e,t,n,r){c.p=t,m=e,h=n,g=r}function y(e,t){let n=this||{};return function(){let r=arguments;function i(a,o){let s=Object.assign({},a),c=s.className||i.className;n.p=Object.assign({theme:h&&h()},s),n.o=/ *go\d+/.test(c),s.className=p.apply(n,r)+(c?` `+c:``),t&&(s.ref=o);let l=e;return e[0]&&(l=s.as||e,delete s.as),g&&l[0]&&g(s),m(l,s)}return t?t(i):i}}var ee=e=>typeof e==`function`,b=(e,t)=>ee(e)?e(t):e,x=(()=>{let e=0;return()=>(++e).toString()})(),S=(()=>{let e;return()=>{if(e===void 0&&typeof window<`u`){let t=matchMedia(`(prefers-reduced-motion: reduce)`);e=!t||t.matches}return e}})(),C=20,w=`default`,T=(e,t)=>{let{toastLimit:n}=e.settings;switch(t.type){case 0:return{...e,toasts:[t.toast,...e.toasts].slice(0,n)};case 1:return{...e,toasts:e.toasts.map(e=>e.id===t.toast.id?{...e,...t.toast}:e)};case 2:let{toast:r}=t;return T(e,{type:+!!e.toasts.find(e=>e.id===r.id),toast:r});case 3:let{toastId:i}=t;return{...e,toasts:e.toasts.map(e=>e.id===i||i===void 0?{...e,dismissed:!0,visible:!1}:e)};case 4:return t.toastId===void 0?{...e,toasts:[]}:{...e,toasts:e.toasts.filter(e=>e.id!==t.toastId)};case 5:return{...e,pausedAt:t.time};case 6:let a=t.time-(e.pausedAt||0);return{...e,pausedAt:void 0,toasts:e.toasts.map(e=>({...e,pauseDuration:e.pauseDuration+a}))}}},E=[],D={toasts:[],pausedAt:void 0,settings:{toastLimit:C}},O={},k=(e,t=w)=>{O[t]=T(O[t]||D,e),E.forEach(([e,n])=>{e===t&&n(O[t])})},A=e=>Object.keys(O).forEach(t=>k(e,t)),te=e=>Object.keys(O).find(t=>O[t].toasts.some(t=>t.id===e)),j=(e=w)=>t=>{k(t,e)},M={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},N=(e={},t=w)=>{let[r,i]=(0,n.useState)(O[t]||D),a=(0,n.useRef)(O[t]);(0,n.useEffect)(()=>(a.current!==O[t]&&i(O[t]),E.push([t,i]),()=>{let e=E.findIndex(([e])=>e===t);e>-1&&E.splice(e,1)}),[t]);let o=r.toasts.map(t=>({...e,...e[t.type],...t,removeDelay:t.removeDelay||e[t.type]?.removeDelay||e?.removeDelay,duration:t.duration||e[t.type]?.duration||e?.duration||M[t.type],style:{...e.style,...e[t.type]?.style,...t.style}}));return{...r,toasts:o}},P=(e,t=`blank`,n)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:`status`,"aria-live":`polite`},message:e,pauseDuration:0,...n,id:n?.id||x()}),F=e=>(t,n)=>{let r=P(t,e,n);return j(r.toasterId||te(r.id))({type:2,toast:r}),r.id},I=(e,t)=>F(`blank`)(e,t);I.error=F(`error`),I.success=F(`success`),I.loading=F(`loading`),I.custom=F(`custom`),I.dismiss=(e,t)=>{let n={type:3,toastId:e};t?j(t)(n):A(n)},I.dismissAll=e=>I.dismiss(void 0,e),I.remove=(e,t)=>{let n={type:4,toastId:e};t?j(t)(n):A(n)},I.removeAll=e=>I.remove(void 0,e),I.promise=(e,t,n)=>{let r=I.loading(t.loading,{...n,...n?.loading});return typeof e==`function`&&(e=e()),e.then(e=>{let i=t.success?b(t.success,e):void 0;return i?I.success(i,{id:r,...n,...n?.success}):I.dismiss(r),e}).catch(e=>{let i=t.error?b(t.error,e):void 0;i?I.error(i,{id:r,...n,...n?.error}):I.dismiss(r)}),e};var L=1e3,R=(e,t=`default`)=>{let{toasts:r,pausedAt:i}=N(e,t),a=(0,n.useRef)(new Map).current,o=(0,n.useCallback)((e,t=L)=>{if(a.has(e))return;let n=setTimeout(()=>{a.delete(e),s({type:4,toastId:e})},t);a.set(e,n)},[]);(0,n.useEffect)(()=>{if(i)return;let e=Date.now(),n=r.map(n=>{if(n.duration===1/0)return;let r=(n.duration||0)+n.pauseDuration-(e-n.createdAt);if(r<0){n.visible&&I.dismiss(n.id);return}return setTimeout(()=>I.dismiss(n.id,t),r)});return()=>{n.forEach(e=>e&&clearTimeout(e))}},[r,i,t]);let s=(0,n.useCallback)(j(t),[t]),c=(0,n.useCallback)(()=>{s({type:5,time:Date.now()})},[s]),l=(0,n.useCallback)((e,t)=>{s({type:1,toast:{id:e,height:t}})},[s]),u=(0,n.useCallback)(()=>{i&&s({type:6,time:Date.now()})},[i,s]),d=(0,n.useCallback)((e,t)=>{let{reverseOrder:n=!1,gutter:i=8,defaultPosition:a}=t||{},o=r.filter(t=>(t.position||a)===(e.position||a)&&t.height),s=o.findIndex(t=>t.id===e.id),c=o.filter((e,t)=>t<s&&e.visible).length;return o.filter(e=>e.visible).slice(...n?[c+1]:[0,c]).reduce((e,t)=>e+(t.height||0)+i,0)},[r]);return(0,n.useEffect)(()=>{r.forEach(e=>{if(e.dismissed)o(e.id,e.removeDelay);else{let t=a.get(e.id);t&&(clearTimeout(t),a.delete(e.id))}})},[r,o]),{toasts:r,handlers:{updateHeight:l,startPause:c,endPause:u,calculateOffset:d}}},z=_`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,B=_`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,V=_`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,H=y(`div`)`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||`#ff4b4b`};
  position: relative;
  transform: rotate(45deg);

  animation: ${z} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${B} 0.15s ease-out forwards;
    animation-delay: 150ms;
    position: absolute;
    border-radius: 3px;
    opacity: 0;
    background: ${e=>e.secondary||`#fff`};
    bottom: 9px;
    left: 4px;
    height: 2px;
    width: 12px;
  }

  &:before {
    animation: ${V} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,U=_`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,W=y(`div`)`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||`#e0e0e0`};
  border-right-color: ${e=>e.primary||`#616161`};
  animation: ${U} 1s linear infinite;
`,G=_`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,K=_`
0% {
	height: 0;
	width: 0;
	opacity: 0;
}
40% {
  height: 0;
	width: 6px;
	opacity: 1;
}
100% {
  opacity: 1;
  height: 10px;
}`,ne=y(`div`)`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||`#61d345`};
  position: relative;
  transform: rotate(45deg);

  animation: ${G} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${K} 0.2s ease-out forwards;
    opacity: 0;
    animation-delay: 200ms;
    position: absolute;
    border-right: 2px solid;
    border-bottom: 2px solid;
    border-color: ${e=>e.secondary||`#fff`};
    bottom: 6px;
    left: 6px;
    height: 10px;
    width: 6px;
  }
`,q=y(`div`)`
  position: absolute;
`,J=y(`div`)`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,Y=_`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,X=y(`div`)`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${Y} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,Z=({toast:e})=>{let{icon:t,type:r,iconTheme:i}=e;return t===void 0?r===`blank`?null:n.createElement(J,null,n.createElement(W,{...i}),r!==`loading`&&n.createElement(q,null,r===`error`?n.createElement(H,{...i}):n.createElement(ne,{...i}))):typeof t==`string`?n.createElement(X,null,t):t},re=e=>`
0% {transform: translate3d(0,${e*-200}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,ie=e=>`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${e*-150}%,-1px) scale(.6); opacity:0;}
`,ae=`0%{opacity:0;} 100%{opacity:1;}`,oe=`0%{opacity:1;} 100%{opacity:0;}`,se=y(`div`)`
  display: flex;
  align-items: center;
  background: #fff;
  color: #363636;
  line-height: 1.3;
  will-change: transform;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05);
  max-width: 350px;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 8px;
`,Q=y(`div`)`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,ce=(e,t)=>{let n=e.includes(`top`)?1:-1,[r,i]=S()?[ae,oe]:[re(n),ie(n)];return{animation:t?`${_(r)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${_(i)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}},le=n.memo(({toast:e,position:t,style:r,children:i})=>{let a=e.height?ce(e.position||t||`top-center`,e.visible):{opacity:0},o=n.createElement(Z,{toast:e}),s=n.createElement(Q,{...e.ariaProps},b(e.message,e));return n.createElement(se,{className:e.className,style:{...a,...r,...e.style}},typeof i==`function`?i({icon:o,message:s}):n.createElement(n.Fragment,null,o,s))});v(n.createElement);var ue=({id:e,className:t,style:r,onHeightUpdate:i,children:a})=>{let o=n.useCallback(t=>{if(t){let n=()=>{let n=t.getBoundingClientRect().height;i(e,n)};n(),new MutationObserver(n).observe(t,{subtree:!0,childList:!0,characterData:!0})}},[e,i]);return n.createElement(`div`,{ref:o,className:t,style:r},a)},de=(e,t)=>{let n=e.includes(`top`),r=n?{top:0}:{bottom:0},i=e.includes(`center`)?{justifyContent:`center`}:e.includes(`right`)?{justifyContent:`flex-end`}:{};return{left:0,right:0,display:`flex`,position:`absolute`,transition:S()?void 0:`all 230ms cubic-bezier(.21,1.02,.73,1)`,transform:`translateY(${t*(n?1:-1)}px)`,...r,...i}},fe=p`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,$=16,pe=({reverseOrder:e,position:t=`top-center`,toastOptions:r,gutter:i,children:a,toasterId:o,containerStyle:s,containerClassName:c})=>{let{toasts:l,handlers:u}=R(r,o);return n.createElement(`div`,{"data-rht-toaster":o||``,style:{position:`fixed`,zIndex:9999,top:$,left:$,right:$,bottom:$,pointerEvents:`none`,...s},className:c,onMouseEnter:u.startPause,onMouseLeave:u.endPause},l.map(r=>{let o=r.position||t,s=de(o,u.calculateOffset(r,{reverseOrder:e,gutter:i,defaultPosition:t}));return n.createElement(ue,{id:r.id,key:r.id,onHeightUpdate:u.updateHeight,className:r.visible?fe:``,style:s},r.type===`custom`?b(r.message,r):a?a(r):n.createElement(le,{toast:r,position:o}))}))},me=I;export{I as n,me as r,pe as t};