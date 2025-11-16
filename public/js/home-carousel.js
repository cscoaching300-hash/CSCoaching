document.addEventListener("DOMContentLoaded", () => {
  const track = document.querySelector(".home-carousel-track");
  if (!track) return;

  // 1. Detect all images in /img/home/ (home1.jpg, home2.jpg, ...)
  const maxImages = 50; // safety limit
  const images = [];

  for (let i = 1; i <= maxImages; i++) {
    const url = `/img/home/home${i}.jpg`;
    images.push(url);
  }

  // 2. Preload & validate which images actually exist
  const validImages = [];

  let loaded = 0;
  images.forEach(src => {
    const img = new Image();
    img.onload = () => {
      validImages.push(src);
      loadedCheck();
    };
    img.onerror = loadedCheck;
    img.src = src;
  });

  function loadedCheck() {
    loaded++;
    if (loaded === images.length) buildCarousel();
  }

  // 3. Fisher–Yates shuffle for true randomness
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // 4. Build the final carousel with shuffled images + duplicates
  function buildCarousel() {
    if (validImages.length === 0) return;

    const shuffled = shuffle(validImages);

    const makeSlides = imgs =>
      imgs.map(src => `<div class="home-slide"><img src="${src}" /></div>`).join("");

    track.innerHTML = makeSlides(shuffled) + makeSlides(shuffled); // duplicate for seamless loop
  }
});
