const header = document.getElementById('header');
if (header) {
  window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 20));
}

const menuBtn = document.getElementById('menuBtn');
const mobileNav = document.getElementById('mobileNav');
function mnav(open) {
  if (!mobileNav) return;
  mobileNav.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}
if (menuBtn && mobileNav) {
  menuBtn.addEventListener('click', () => mnav(!mobileNav.classList.contains('open')));
  const mnClose = document.getElementById('mobileNavClose');
  if (mnClose) mnClose.addEventListener('click', () => mnav(false));
  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mnav(false)));
}

(function(){var p=document.getElementById('preloader');if(!p)return;function hide(){p.classList.add('hide');}window.addEventListener('load',function(){setTimeout(hide,600);});setTimeout(hide,5000);})();
