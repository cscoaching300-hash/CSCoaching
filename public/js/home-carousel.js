// public/js/home-carousel.js
document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('homeCarouselTrack');
  if (!track) return;

  // 1) List your home images here (add/remove as needed)
  const imagePaths = [
    '/img/home/home1.jpg',
    '/img/home/home2.jpg',
    '/img/home/home3.jpg',
    '/img/home/home4.jpg'
    // add more: '/img/home/home5.jpg', ...
  ];

  // 2) Shuffle once for random order
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const shuffled = shuffle(imagePaths);

  // 3) Helper to add a set of slides to the track
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

  // 4) Add two identical sets for seamless looping
  addSlides(shuffled);  // first set
  addSlides(shuffled);  // second set
});
