// public/js/home-carousel.js
(() => {
  const TRACK_ID = 'homeCarouselTrack';
  const WRAPPER_ID = 'homeCarouselWrapper';
  const INTERVAL_MS = 5000; // 5 seconds between slides
  const MAX_IMAGES = 50;    // safety cap so we don't loop forever

  // Try /img/home/home1.jpg, home2.jpg, ... until one doesn't exist
  async function discoverPhotos() {
    const photos = [];

    for (let i = 1; i <= MAX_IMAGES; i++) {
      const filename = `home${i}.jpg`;
      const url = `/img/home/${filename}`;

      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (!res.ok) break;        // stop at first missing image
        photos.push(filename);
      } catch (e) {
        // network / other error – stop discovery
        break;
      }
    }

    return photos;
  }

  function buildCarousel(track, photos) {
    photos.forEach((file) => {
      const slide = document.createElement('div');
      slide.className = 'home-slide';

      const img = document.createElement('img');
      img.src = `/img/home/${file}`;
      img.alt = '';          // decorative only
      img.loading = 'lazy';

      slide.appendChild(img);
      track.appendChild(slide);
    });
  }

  function startAutoScroll(track) {
    let index = 0;

    setInterval(() => {
      const slides = track.children;
      if (!slides.length) return;

      index = (index + 1) % slides.length;
      const target = slides[index];
      track.scrollTo({
        left: target.offsetLeft,
        behavior: 'smooth'
      });
    }, INTERVAL_MS);
  }

  window.addEventListener('DOMContentLoaded', async () => {
    const track = document.getElementById(TRACK_ID);
    const wrapper = document.getElementById(WRAPPER_ID);
    if (!track || !wrapper) return;

    const photos = await discoverPhotos();

    if (!photos.length) {
      // nothing found – hide carousel area
      wrapper.style.display = 'none';
      return;
    }

    buildCarousel(track, photos);
    startAutoScroll(track);
  });
})();

  function startAutoScroll(track) {
    let index = 0;

    function scrollToIndex(i) {
      const slides = track.children;
      if (!slides.length) return;
      const target = slides[i];
      if (!target) return;

      const left = target.offsetLeft;
      track.scrollTo({ left, behavior: 'smooth' });
    }

    setInterval(() => {
      const slides = track.children;
      if (!slides.length) return;

      index = (index + 1) % slides.length;
      scrollToIndex(index);
    }, INTERVAL_MS);
  }

  window.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById(TRACK_ID);
    if (!track || !PHOTOS.length) return;

    buildCarousel(track);
    startAutoScroll(track);
  });
})();
