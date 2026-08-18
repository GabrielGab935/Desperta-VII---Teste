(() => {

  // ---------------------------------------------------------------
  // DADOS — troque fotos, nomes, cargos e números de WhatsApp aqui
  // ---------------------------------------------------------------
  const DATA = {
    coordenacao: [
      {
        name: "Ana Carmem",
        role: "Coordenadora",
        quote: "“Eis a serva do Senhor, faça-se em mim segundo a tua palavra.”",
        source: "— Lc 1,38",
        photo: "../static/imagens/Ana_coord.png",
        whatsapp: "5541920049569"
      },
      {
        name: "Isabella Kayane",
        role: "Coordenadora",
        quote: "“Tudo o que fizerem, façam de coração, como para o Senhor.”",
        source: "— Cl 3,23",
        photo: "../static/imagens/Bella_coord.jpeg",
        whatsapp: "554188964460"
      },
      {
        name: "Marllon Setim",
        role: "Coordenador",
        quote: "“Cada um dê conforme decidiu em seu coração, não com pesar ou por obrigação.”",
        source: "— 2Cor 9,7",
        photo: "../static/imagens/marlon_coor.PNG",
        whatsapp: "554191044959"
      },
      {
        name: "Rayane Santos",
        role: "Coordenadora",
        quote: "“A santidade não consiste em fazer coisas extraordinárias, mas em fazer bem as coisas pequenas.”",
        source: "— Santa Teresinha do Menino Jesus",
        photo: "../static/imagens/Ray_coord.png",
        whatsapp: "554192398995"
      }
    ],
    servos: [
      {
        name: "Giovanna Rocha ",
        role: "Equipe de apoio/pascom",
        quote: "“O Meu Imaculado Coração será o teu refúgio e o caminho que te conduzirá até Deus.”",
        source: "— Nossa senhora de fátima",
        photo: "../static/imagens/foto-coord&servos/giih_serv.jpeg"
      },
      {
        name: "Mirian Reis",
        role: "Equipe de apoio/pascom",
        quote: "“Faz o que deves e estás no que fazes.”",
        source: "— São Josemaria Escrivá",
        photo: "../static/imagens/foto-coord&servos/mirian_serv.jpeg"
      },
      {
        name: "Pyetro Henrique ",
        role: "Equipe de apoio",
        quote: "“A medida do amor é amar sem medida.”",
        source: "— Santo Agostinho",
        photo: "../static/imagens/foto-coord&servos/pyetro_serv.jpeg"
      },
    ]
  };

  const whatsappIcon = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.02 2C6.5 2 2.02 6.48 2.02 12c0 1.85.5 3.58 1.36 5.07L2 22l5.08-1.33A9.94 9.94 0 0012.02 22c5.52 0 10-4.48 10-10s-4.48-10-10-10zm0 18.2a8.2 8.2 0 01-4.18-1.15l-.3-.18-3.02.79.81-2.94-.2-.3A8.2 8.2 0 1120.22 12a8.2 8.2 0 01-8.2 8.2zm4.5-6.14c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.28.18-.53.06-.24-.12-1.03-.38-1.96-1.2-.72-.65-1.21-1.44-1.35-1.68-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.02 0 1.2.87 2.35.99 2.51.12.16 1.7 2.6 4.13 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28z"/>
    </svg>`;

  function initials(name){
    return name.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase();
  }

  function buildCard(person, isCoordenacao){
    const card = document.createElement("article");
    card.className = "card";

    const cta = isCoordenacao && person.whatsapp
      ? `<a class="card-cta" href="https://wa.me/${person.whatsapp}" target="_blank" rel="noopener">
           ${whatsappIcon}<span>Falar no WhatsApp</span>
         </a>`
      : "";

    card.innerHTML = `
      <div class="card-photo" style="background-image:url('${person.photo}')" role="img" aria-label="Foto de ${person.name}"></div>
      <div class="card-body">
        <p class="card-role">${person.role}</p>
        <h3 class="card-name">${person.name}</h3>
        <p class="card-quote">${person.quote}<span class="card-quote-source">${person.source}</span></p>
        ${cta}
      </div>`;
    return card;
  }

  function buildThumb(person, index){
    const btn = document.createElement("button");
    btn.className = "thumb";
    btn.type = "button";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", index === 0 ? "true" : "false");
    btn.dataset.index = index;
    btn.innerHTML = `
      <img class="thumb-photo" src="${person.photo}" alt="" loading="lazy">
      <span class="thumb-name">${person.name.split(" ")[0]}</span>`;
    return btn;
  }

  function initCarousel(groupEl, people, isCoordenacao){
    const track     = groupEl.querySelector("[data-track]");
    const thumbRow   = groupEl.querySelector("[data-thumbs]");
    const prevBtn    = groupEl.querySelector("[data-prev]");
    const nextBtn    = groupEl.querySelector("[data-next]");

    people.forEach((person, i) => {
      track.appendChild(buildCard(person, isCoordenacao));
      thumbRow.appendChild(buildThumb(person, i));
    });

    const cards  = Array.from(track.children);
    const thumbs = Array.from(thumbRow.children);

    function scrollToCard(index){
      const card = cards[index];
      if (!card) return;
      track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: "smooth" });
    }

    function setActive(index){
      thumbs.forEach((t, i) => t.setAttribute("aria-selected", i === index ? "true" : "false"));
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === cards.length - 1;
    }

    // clique nas miniaturas
    thumbs.forEach((thumb, i) => {
      thumb.addEventListener("click", () => {
        scrollToCard(i);
        setActive(i);
      });
    });

    // setas
    prevBtn.addEventListener("click", () => {
      const current = currentIndex();
      if (current > 0) { scrollToCard(current - 1); setActive(current - 1); }
    });
    nextBtn.addEventListener("click", () => {
      const current = currentIndex();
      if (current < cards.length - 1) { scrollToCard(current + 1); setActive(current + 1); }
    });

    function currentIndex(){
      let closest = 0;
      let closestDist = Infinity;
      cards.forEach((card, i) => {
        const dist = Math.abs(card.offsetLeft - track.offsetLeft - track.scrollLeft);
        if (dist < closestDist){ closestDist = dist; closest = i; }
      });
      return closest;
    }

    // mantém miniaturas e setas sincronizadas ao arrastar/deslizar manualmente
    let scrollTimeout;
    track.addEventListener("scroll", () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => setActive(currentIndex()), 100);
    });

    // navegação por teclado quando o carrossel está focado
    track.addEventListener("keydown", (e) => {
      const current = currentIndex();
      if (e.key === "ArrowRight" && current < cards.length - 1){
        scrollToCard(current + 1); setActive(current + 1);
      } else if (e.key === "ArrowLeft" && current > 0){
        scrollToCard(current - 1); setActive(current - 1);
      }
    });

    setActive(0);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const coordEl  = document.querySelector('[data-group="coordenacao"]');
    const servosEl = document.querySelector('[data-group="servos"]');

    initCarousel(coordEl, DATA.coordenacao, true);
    initCarousel(servosEl, DATA.servos, false);
  });

})();
