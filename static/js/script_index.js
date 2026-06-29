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