// public/js/testimonials.js
document.addEventListener('DOMContentLoaded', () => {
  const quotes = document.querySelectorAll('.testimonial-quote');
  if (!quotes.length) return;

  const MAX_CHARS = 450; // adjust to taste – around the left card's length

  quotes.forEach((quoteEl) => {
    const fullText = quoteEl.textContent.trim();

    // If short enough, leave it alone
    if (fullText.length <= MAX_CHARS) return;

    // Build a nicer cut at a word boundary
    let shortText = fullText.slice(0, MAX_CHARS);
    const lastSpace = shortText.lastIndexOf(' ');
    if (lastSpace > 0) shortText = shortText.slice(0, lastSpace);
    shortText = shortText + '…';

    // Start collapsed
    quoteEl.textContent = shortText;

    // Create the toggle button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'testimonial-more-btn';
    btn.dataset.expanded = 'false';
    btn.textContent = 'Read full story';

    // Toggle behaviour
    btn.addEventListener('click', () => {
      const isExpanded = btn.dataset.expanded === 'true';
      if (isExpanded) {
        quoteEl.textContent = shortText;
        btn.dataset.expanded = 'false';
        btn.textContent = 'Read full story';
      } else {
        quoteEl.textContent = fullText;
        btn.dataset.expanded = 'true';
        btn.textContent = 'Show less';
      }
    });

    // Insert button at the bottom of the card, after the quote
    const card = quoteEl.closest('.testimonial-card');
    if (card) {
      // put the button just before the name/role
      const nameEl = card.querySelector('.testimonial-name');
      if (nameEl) {
        card.insertBefore(btn, nameEl);
      } else {
        card.appendChild(btn);
      }
    }
  });
});
