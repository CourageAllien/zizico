/* ============================================================
   Akobs Landing Page — JavaScript
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // ---------- MOBILE NAV ----------
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('active');
    });

    // Close mobile menu on link click
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('active');
      });
    });
  }

  // ---------- STICKY NAV STYLE ----------
  const nav = document.getElementById('nav');
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (scrollY > 100) {
      nav.style.background = 'rgba(10, 10, 30, 0.95)';
    } else {
      nav.style.background = 'rgba(10, 10, 30, 0.85)';
    }
    lastScroll = scrollY;
  });

  // ---------- SMOOTH SCROLL ----------
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offsetTop = target.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
    });
  });

  // ---------- FAQ ACCORDION ----------
  const faqItems = document.querySelectorAll('.faq__item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq__question');

    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      // Close all
      faqItems.forEach(i => {
        i.classList.remove('active');
        i.querySelector('.faq__question').setAttribute('aria-expanded', 'false');
      });

      // Open clicked (if it was closed)
      if (!isActive) {
        item.classList.add('active');
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ---------- SCROLL ANIMATIONS ----------
  const animatedElements = document.querySelectorAll('.animate-on-scroll');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  animatedElements.forEach(el => observer.observe(el));

  // ---------- EXIT INTENT POPUP ----------
  const popup = document.getElementById('exitPopup');
  const popupClose = document.getElementById('popupClose');
  const popupDismiss = document.getElementById('popupDismiss');
  let popupShown = false;

  function showPopup() {
    if (!popupShown && popup) {
      popup.classList.add('active');
      popupShown = true;
    }
  }

  function hidePopup() {
    if (popup) {
      popup.classList.remove('active');
    }
  }

  // Exit intent on desktop (mouse leaves viewport top)
  document.addEventListener('mouseout', (e) => {
    if (e.clientY <= 0 && !popupShown) {
      showPopup();
    }
  });

  if (popupClose) popupClose.addEventListener('click', hidePopup);
  if (popupDismiss) popupDismiss.addEventListener('click', hidePopup);

  // Close popup on overlay click
  if (popup) {
    popup.addEventListener('click', (e) => {
      if (e.target === popup) hidePopup();
    });
  }

  // Close popup on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePopup();
  });

  // ---------- HAMBURGER ANIMATION ----------
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      const spans = hamburger.querySelectorAll('span');
      if (hamburger.classList.contains('active')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
      } else {
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
      }
    });
  }
});

