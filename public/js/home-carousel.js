document.addEventListener("DOMContentLoaded", () => {
  const track = document.querySelector(".home-carousel-track");
  if (!track) return;

  // --- 1. Build list of possible files: /img/home/home1.jpg ... home50.jpg ---
  const maxImages = 50; // adjust if you ever need more
  const candidates = [];
  for (let i = 1; i <= maxImages; i++) {
    candidates.push(`/img/home/home${i}.jpg`);
  }

  const validImages = [];
  let loadedCount = 0;

  // When all preload attempts are done, build the carousel
  const maybeBuild = () => {
    loadedCount++;
    if (loadedCount === candidates.length) {
      if (validImages.length === 0) return;

      // --- 2. Shuffle (random order each page load) ---
      shuffle(validImages);

      // --- 3. Duplicate list so ticker loops seamlessly ---
      const finalList = validImages.concat(validImages);

      // --- 4. Render slides in the track ---
      track.innerHTML = "";
      finalList.forEach(src => {
        const slide = document.createElement("div");
        slide.className = "home-slide";

        const img = document.createElement("img");
        img.src = src;
        img.alt = "";

        slide.appendChild(img);
        track.appendChild(slide);
      });
    }
  };

  // Preload & check which files actually exist
  candidates.forEach(src => {
    const img = new Image();
    img.onload = () => {
      validImages.push(src);
      maybeBuild();
    };
    img.onerror = maybeBuild;
    img.src = src;
  });

  // Fisher–Yates shuffle
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
});
