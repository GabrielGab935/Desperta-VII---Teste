// Scroll reveal
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.5, rootMargin: '0px 0px -50px 0px' });

    reveals.forEach(el => observer.observe(el));


    // Nav menu toggle (hamburger simples)
    const menuBtn = document.querySelector('.nav-menu');
    const drawer = document.querySelector('.nav-drawer');
    const overlay = document.querySelector('.nav-overlay');
    const closeBtn = document.querySelector('.nav-close');

    menuBtn.addEventListener('click', () => {
      drawer.classList.add('active');
      overlay.classList.add('active');
    });

    closeBtn.addEventListener('click', () => {
      drawer.classList.remove('active');
      overlay.classList.remove('active');
    });

    overlay.addEventListener('click', () => {
      drawer.classList.remove('active');
      overlay.classList.remove('active');
    });


    // Smooth scroll para âncoras internas
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

(function(){
  const iconSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5.5-5.5L9 17"/></svg>';

  const spreads = [
    {
      left:[
        {year:'2013', title:'Onde tudo começou', desc:' Entre violão, amizades e muita vontade de evangelizar, os primeiros passos do Grupo', img:'../static/imagens/yeshua2013.jpg'},
        {year:'2014', title:'Crescendo Juntos', desc:'O Yeshua já começava a reunir mais jovens.', img:'../static/imagens/yeshua2014.jpg'}
      ],
      right:[
        {year:'2015', title:'Evoluindo na fé', desc:'Yeshua já reunia muitos jovens dispostos a viver a alegria do Evangelho.', img:'../static/imagens/yeshua2015.jpg'},
        {year:'2016', title:' Unidos em um Só Propósito', desc:'Yeshua vivia um tempo de crescimento e fortalecimento.', img:'../static/imagens/yeshua2016.jpg'}
      ]
    },
    {
      left:[
        {year:'2017', title:'Celebrando a Caminhada', desc:'Cada jovem presente ajudava a tornar o grupo um lugar de acolhida, fé e transformação.', img:'../static/imagens/yeshua2017.jpg'},
        {year:'2018', title:'Juntos à distância', desc:'Mais do que apenas um encontro de jovens, foi uma verdadeira família reunida pelo mesmo propósito.', img:'../static/imagens/yeshua2018.jpg'}
      ],
      right:[
        {year:'2019', title:'Reencontro', desc:'A alegria de voltar', img:'../static/imagens/yeshua2019.jpg'},
        {year:'2020', title:' Um Tempo de Oração e Esperança', desc:'Mesmo em um ano desafiador, a fé continuou nos reunindo em momentos de oração e reflexão.', img:'../static/imagens/yeshua2020.jpg'}
      ]
    },
    {
      left:[
        {year:'2021', title:'O Reencontro da Esperança', desc:'após um período de desafios e distância, marcou o reencontro de muitos jovens com alegria no coração.', img:'../static/imagens/yeshua2021.jpg'},
        {year:'2022', title:' Um Retiro', desc:'depois de tantos desafios, chegou o momento de viver dias intensos de encontro com Deus.', img:'../static/imagens/yeshua2022.jpg'}
      ],
      right:[
        {year:'2023', title:'Nossa História Continua', desc:'Foi um momento de união, alegria e fé, onde cada jovem fez parte de uma história que continua crescendo a cada ano.', img:'../static/imagens/yeshua2023.jpg'},
        {year:'2024', title:' Chamados Para Algo Maior', desc:'Foi mais do que um retiro, foram almas unidas a Jesus mesmo na juventude.', img:'../static/imagens/yeshua2024.jpg'}
      ]
    },
    {
      left:[
        {year:'2025', title:'Desperta VI', desc:'Um retiro inesquecível', img:'../static/imagens/yeshua2025.jpg', big:true}
      ],
      right:'invite'
    }
  ];

  // flatten every spread into individual "leaves" (one side each).
  // Desktop shows two leaves at a time (a spread); mobile shows one leaf at a time.
  const leaves = [];
  spreads.forEach(function(s){ leaves.push(s.left); leaves.push(s.right); });

  let cursor = 0; // index of the first visible leaf
  let animating = false;

  function isMobile(){ return window.matchMedia('(max-width:820px)').matches; }
  function step(){ return isMobile() ? 1 : 2; }
  function isFirstView(){ return cursor === 0; }
  function isLastView(){
    return isMobile() ? cursor === leaves.length - 1 : cursor >= leaves.length - 2;
  }

  const stageInner = document.getElementById('stageInner');
  const coverBtn = document.getElementById('coverBtn');
  const bookOverlay = document.getElementById('bookOverlay');
  const closeBtn = document.getElementById('closeBtn');
  const pageLeft = document.getElementById('pageLeft');
  const pageRight = document.getElementById('pageRight');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageIndicator = document.getElementById('pageIndicator');
  const flipEl = document.getElementById('flipEl');
  const flipFront = document.getElementById('flipFront');
  const flipBack = document.getElementById('flipBack');
  const bookCoverOverlay = document.getElementById('bookCoverOverlay');

  function polaroidHTML(item){
    const tilt = (Math.random()*4-2).toFixed(1);
    const photo = item.img
      ? '<img src="'+item.img+'" alt="'+item.title+'">'
      : iconSVG;
    return '<div class="polaroid'+(item.big?' big':'')+'" style="--tilt:'+tilt+'deg">'+
      '<div class="polaroid-photo">'+photo+'</div>'+
      '<div class="polaroid-caption">'+
        '<div class="polaroid-year">'+item.year+'</div>'+
        '<div class="polaroid-title display">'+item.title+'</div>'+
        '<div class="polaroid-desc">'+item.desc+'</div>'+
      '</div>'+
    '</div>';
  }

  function inviteHTML(){
    return '<div class="polaroid" style="--tilt:2deg">'+
        '<div class="polaroid-photo" style="color:#b9b2a0;font-size:22px;">?</div>'+
        '<div class="polaroid-caption">'+
          '<div class="polaroid-year">seu retrato aqui</div>'+
        '</div>'+
      '</div>'+
      '<p class="invite-quote">"Venha você também fazer parte desses momentos e entrar no nosso álbum de memórias."</p>'+
      '<button class="invite-btn" type="button">Participe do Yeshua</button>';
  }

  function sideHTML(side){
    if(side === 'invite') return inviteHTML();
    return side.map(polaroidHTML).join('');
  }

  function fillPage(el, content, sideClass){
    el.className = 'page ' + sideClass + (content === 'invite' ? ' invite' : '');
    el.innerHTML = sideHTML(content);
  }

  function renderView(){
    const mobile = isMobile();

    if(mobile){
      pageRight.style.display = 'none';
      fillPage(pageLeft, leaves[cursor], 'left');
    } else {
      pageRight.style.display = 'flex';
      fillPage(pageLeft, leaves[cursor], 'left');
      fillPage(pageRight, leaves[cursor+1], 'right');
    }

    const totalViews = mobile ? leaves.length : spreads.length;
    const currentView = mobile ? cursor + 1 : Math.floor(cursor/2) + 1;
    pageIndicator.textContent = currentView + ' / ' + totalViews;

    prevBtn.disabled = isFirstView();
    const last = isLastView();
    nextBtn.setAttribute('aria-label', last ? 'Fechar álbum' : 'Próxima página');
    nextBtn.innerHTML = last ? '&times;' : '&rsaquo;';
  }

  function turnPage(direction){
    if(animating) return;
    if(direction === 'next' && isLastView()) return;
    if(direction === 'prev' && isFirstView()) return;
    animating = true;

    const mobile = isMobile();
    const s = step();
    const fromCursor = cursor;
    const toCursor = direction === 'next' ? cursor + s : cursor - s;

    // Mobile: simple, robust fade + slide (avoids 3D-flip clipping issues on mobile browsers)
    if(mobile){
      const outX = direction === 'next' ? '-18px' : '18px';
      const inX = direction === 'next' ? '18px' : '-18px';
      pageLeft.style.transition = 'opacity .22s ease, transform .22s ease';
      pageLeft.style.opacity = '0';
      pageLeft.style.transform = 'translateX(' + outX + ')';

      window.setTimeout(function(){
        cursor = toCursor;
        renderView();
        pageLeft.style.transition = 'none';
        pageLeft.style.transform = 'translateX(' + inX + ')';
        void pageLeft.offsetWidth; // force reflow before animating in
        pageLeft.style.transition = 'opacity .22s ease, transform .22s ease';
        pageLeft.style.opacity = '1';
        pageLeft.style.transform = 'translateX(0)';

        window.setTimeout(function(){
          pageLeft.style.transition = '';
          pageLeft.style.transform = '';
          animating = false;
        }, 230);
      }, 220);
      return;
    }

    // Desktop: 3D page-flip
    flipEl.style.display = 'block';
    flipEl.className = 'flip ' + direction;

    let frontContent, backContent;
    if(direction === 'next'){
      frontContent = leaves[fromCursor+1];
      backContent = leaves[toCursor];
      pageRight.style.visibility = 'hidden';
    } else {
      frontContent = leaves[fromCursor];
      backContent = leaves[toCursor+1];
      pageLeft.style.visibility = 'hidden';
    }

    flipFront.className = 'flip-face front' + (frontContent === 'invite' ? ' invite' : '');
    flipFront.innerHTML = sideHTML(frontContent);
    flipBack.className = 'flip-face back' + (backContent === 'invite' ? ' invite' : '');
    flipBack.innerHTML = sideHTML(backContent);

    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        flipEl.classList.add('turning');
      });
    });

    flipEl.addEventListener('transitionend', function handler(){
      flipEl.removeEventListener('transitionend', handler);
      cursor = toCursor;
      renderView();
      pageLeft.style.visibility = 'visible';
      pageRight.style.visibility = 'visible';
      flipEl.style.display = 'none';
      flipEl.classList.remove('turning');
      animating = false;
    }, {once:true});
  }

  function openBook(){
    cursor = 0;
    renderView();

    // reset the cover flap to its closed state before showing it again
    bookCoverOverlay.style.display = 'flex';
    bookCoverOverlay.classList.remove('opening');
    void bookCoverOverlay.offsetWidth; // force reflow so the reset is applied

    stageInner.classList.add('hidden');
    bookOverlay.classList.add('open');

    // let the album arrive at the center first, then flip the cover open
    window.setTimeout(function(){
      bookCoverOverlay.classList.add('opening');
    }, 600);
  }

  bookCoverOverlay.addEventListener('transitionend', function(e){
    if(e.propertyName === 'transform' && bookCoverOverlay.classList.contains('opening')){
      bookCoverOverlay.style.display = 'none';
    }
  });

  function closeBook(){
    bookOverlay.classList.remove('open');
    stageInner.classList.remove('hidden');
  }

  coverBtn.addEventListener('click', openBook);
  closeBtn.addEventListener('click', closeBook);
  prevBtn.addEventListener('click', function(){ turnPage('prev'); });
  nextBtn.addEventListener('click', function(){
    if(isLastView()) closeBook();
    else turnPage('next');
  });

  document.addEventListener('keydown', function(e){
    if(!bookOverlay.classList.contains('open')) return;
    if(e.key === 'ArrowRight'){
      if(isLastView()) closeBook();
      else turnPage('next');
    }
    if(e.key === 'ArrowLeft') turnPage('prev');
    if(e.key === 'Escape') closeBook();
  });

  // if the viewport crosses the mobile breakpoint while the book is open,
  // snap the cursor to a valid position for the new layout and re-render
  let resizeTimer;
  window.addEventListener('resize', function(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      if(!bookOverlay.classList.contains('open') || animating) return;
      if(!isMobile() && cursor % 2 !== 0) cursor -= 1;
      renderView();
    }, 150);
  });
})();
