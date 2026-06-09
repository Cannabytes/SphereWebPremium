const lang=document.querySelector(".lang");const langButton=document.querySelector(".lang__button");langButton.addEventListener("click",(e)=>{e.stopPropagation();langButton.classList.toggle("active")});document.body.addEventListener("click",(e)=>{const innerButton=e.target.closest('.lang__inner-button')
  if(!lang.contains(e.target)&&langButton.classList.contains("active")){langButton.classList.remove("active")}})
const menu=document.querySelector(".header__menu");const menuButton=document.querySelector(".header__menu-button");const menuClose=document.querySelector(".header__close");menuButton.addEventListener("click",()=>{document.body.classList.add("body-overflow");menu.classList.add("active")});menuClose.addEventListener("click",()=>{document.body.classList.remove("body-overflow");menu.classList.remove("active")});class MySwiper extends Swiper{constructor(selector,options={}){super(selector,options);if(!document.querySelector(selector))return{}
  if(options.navigation){if(Array.isArray(this)){this.forEach(slide=>{const el=options.navigation.parent?slide.el.parentElement:slide.el;const next=el.querySelector(options.navigation.nextEl)
    const prev=el.querySelector(options.navigation.prevEl)
    if(next)next.addEventListener("click",()=>slide.slideNext())
    if(prev)prev.addEventListener('click',()=>slide.slidePrev())})}else{const el=options.navigation.parent?this.el.parentElement:this.el;const next=el.querySelector(options.navigation.nextEl)
    const prev=el.querySelector(options.navigation.prevEl)
    if(next)next.addEventListener("click",()=>this.slideNext())
    if(prev)prev.addEventListener('click',()=>this.slidePrev())}}}}
new MySwiper('.about__swiper',{loop:!0,spaceBetween:20,navigation:{nextEl:'.about__swiper-next',prevEl:'.about__swiper-prev',}})
class Acordeon{constructor({container,button,item}){this.container=document.querySelector(container);if(!this.container)return
  this.buttonClass=button;this.buttons=this.container.querySelectorAll(button);if(item){const items=this.container.querySelectorAll(item)
    if(items.length>0){this.items={};items.forEach(item=>{this.items[item.dataset.index]=item})}}
  if(this.buttons.length>0){this.activeButton=this.buttons[0]}else return
  this.init()}
  init(){this.container.addEventListener("click",(e)=>{const hasButton=e.target.closest(this.buttonClass);if(!hasButton||hasButton.classList.contains("active"))return;hasButton.classList.add("active");this.activeButton.classList.remove("active");if(this.items){this.items[this.activeButton.dataset.index].classList.remove("active");this.items[hasButton.dataset.index].classList.add("active")}
    this.activeButton=hasButton})}}
new Acordeon({container:'.about__list',button:'.about__item',});new Acordeon({container:'.media',button:'.media__switcher-button',item:'.media__item',});new Acordeon({container:'.bg',button:'.switcher__button',item:'.switcher-content',});new MySwiper('.media__swiper',{slidesPerView:1,spaceBetween:15,breakpoints:{768:{slidesPerView:2,},1280:{spaceBetween:30,slidesPerView:4,}},navigation:{parent:!0,nextEl:'.media__swiper-next',prevEl:'.media__swiper-prev',}})
const aboutServerSwiper=new MySwiper('.about-server__swiper',{slidesPerView:'auto',})
if(Object.keys(aboutServerSwiper).length>0){window.addEventListener('resize',()=>{if(window.innerWidth>1280){aboutServerSwiper.slideTo(0,0)}})}
new Acordeon({container:'.about-server',button:'.about-server__button',item:'.about-server__box',})