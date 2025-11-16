// public/js/home-carousel.js
(() => {
  const TRACK_ID = 'homeCarouselTrack';
  const WRAPPER_ID = 'homeCarouselWrapper';
  const INTERVAL_MS = 5000; // 5 seconds
  const MAX_IMAGES = 30;    // tries home1..home30.jpg

  function buildSlides(track) {
    for (let i = 1; i <= MAX_IMAGES; i++) {
      const src = `/img/home/home${i}.jpg`;

      const slide = document.createElement('div');
      slide.className = 'home-slide';

      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';

      // If the file doesn't exist, remove this slide
      img.addEventListener('error', () => {
        if (slide.parentNode) {
          slide.parentNode.removeChild(slide);
        }
      });

      slide.appendChild(img);
      track.appendChild(slide);
    }
  }

  function startAutoScroll(track) {
    let index = 0;

    setInterval(() => {
      const slides = track.children;
      const count = slides.length;
      if (!count) return;

      index = (index + 1) % count;
      const target = slides[index];

      track.scrollTo({
        left: target.offsetLeft,
        behavior: 'smooth'
      });
    }, INTERVAL_MS);
  }

  window.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById(TRACK_ID);
    const wrapper = document.getElementById(WRAPPER_ID);
    if (!track || !wrapper) return;

    // Create slides for home1.jpg, home2.jpg, ... (missing ones get removed)
    buildSlides(track);

    // After the browser has had a moment to fire error events, decide what to do
    setTimeout(() => {
      if (!track.children.length) {
        // No valid images found – hide the carousel area
        wrapper.style.display = 'none';
        return;
      }
      startAutoScroll(track);
    }, 500);
  });
})();
