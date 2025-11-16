// public/js/home-carousel.js
document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('homeCarouselTrack');
  if (!track) return;

  // 👉 Set how many home images you have:
  //    /public/img/home/home1.jpg ... homeN.jpg
  const IMAGE_COUNT = 16; // change this when you add more

  // Build the list automatically: ['/img/home/home1.jpg', ...]
  const imagePaths = [];
  for (let i = 1; i <= IMAGE_COUNT; i++) {
    imagePaths.push(`/img/home/home${i}.jpg`);
  }

  // Shuffle once for random order on each page load
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const shuffled = shuffle(imagePaths);

  // Helper to add a set of slides to the track
  function addSlides(list) {
    list.forEach((src) => {
      const slide = document.createElement('div');
      slide.className = 'home-slide';

      const img = document.createElement('img');
      img.src = src;
      img.alt = 'CSCoaching in action';

      slide.appendChild(img);
      track.appendChild(slide);
    });
  }

  // Add two identical sets so the ticker can loop seamlessly
  addSlides(shuffled);  // first set (random order)
  addSlides(shuffled);  // second set (same order for seamless loop)
});

