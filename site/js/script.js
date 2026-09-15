// ==========================================================
// Barback Inc. — menu data + interactions
// ==========================================================

const CATEGORY_LABELS = {
  classic: 'Classic',
  mojito: 'Mojito Bar',
  margarita: 'Margarita & Tequila',
  sangria: 'Sangria & Wine',
  tropical: 'Tropical & Tiki',
  punch: 'Punch & Batch',
  premium: 'Top-Shelf',
  mocktail: 'Mocktail / Kids',
};

const DRINKS = [
  // ---- Classic Cocktails ----
  { name: 'Old Fashioned', cat: 'classic', desc: 'Bourbon, sugar, bitters, orange peel — the benchmark classic.' },
  { name: 'Whiskey Sour', cat: 'classic', desc: 'Whiskey, fresh lemon, simple syrup, silky egg-white foam.' },
  { name: 'Manhattan', cat: 'classic', desc: 'Rye whiskey, sweet vermouth, bitters, a brandied cherry.' },
  { name: 'Negroni', cat: 'classic', desc: 'Gin, Campari, sweet vermouth — bitter, bold, in equal parts.' },
  { name: 'Classic Martini', cat: 'classic', desc: 'Gin or vodka, dry vermouth, olive or a twist.' },
  { name: 'Cosmopolitan', cat: 'classic', desc: 'Vodka, triple sec, cranberry, fresh lime.' },
  { name: 'Moscow Mule', cat: 'classic', desc: 'Vodka, spicy ginger beer, lime, served in a copper mug.' },
  { name: 'Sidecar', cat: 'classic', desc: 'Cognac, orange liqueur, fresh lemon, sugar rim.' },

  // ---- Mojito Bar ----
  { name: 'Classic Mojito', cat: 'mojito', desc: 'White rum, fresh mint, lime, soda — muddled to order.' },
  { name: 'Strawberry Mojito', cat: 'mojito', desc: 'Classic mojito muddled fresh with strawberry.' },
  { name: 'Blue Lagoon Mojito', cat: 'mojito', desc: 'Blue curaçao twist — the go-to for beach and pool events.' },
  { name: 'Passion Fruit Mojito', cat: 'mojito', desc: 'Tropical passion fruit puree layered into the classic build.' },
  { name: 'Espresso Mojito', cat: 'mojito', desc: 'Mint, lime, and a shot of espresso for a late-night twist.' },
  { name: 'Virgin Mojito', cat: 'mojito', desc: 'All the mint and lime, none of the alcohol.' },

  // ---- Margarita & Tequila ----
  { name: 'Classic Margarita', cat: 'margarita', desc: 'Tequila, orange liqueur, fresh lime, salted rim.' },
  { name: 'Spicy Mango Margarita', cat: 'margarita', desc: 'Mango puree, tequila, jalapeño-infused finish.' },
  { name: 'Mezcal Margarita', cat: 'margarita', desc: 'Smoky mezcal in place of tequila for a bolder pour.' },
  { name: 'Paloma', cat: 'margarita', desc: 'Tequila, grapefruit soda, lime — light and effervescent.' },
  { name: 'Tequila Sunrise', cat: 'margarita', desc: 'Tequila, orange juice, grenadine sunrise layers.' },
  { name: 'Don Julio 1942 Margarita', cat: 'margarita', desc: 'Top-shelf build on Don Julio 1942 — a showpiece pour.', premium: true },
  { name: 'Clase Azul Reposado Sipper', cat: 'margarita', desc: 'Served neat over a single large cube in the signature decanter pour.', premium: true },

  // ---- Sangria & Wine ----
  { name: 'Classic Red Sangria', cat: 'sangria', desc: 'Red wine, brandy, orange, seasonal fruit, batch-made.' },
  { name: 'White Peach Sangria', cat: 'sangria', desc: 'White wine, peach, citrus — bright and summery.' },
  { name: 'Sparkling Rosé Sangria', cat: 'sangria', desc: 'Rosé and prosecco with berries for a celebratory pour.' },
  { name: 'Homemade Infused Wine', cat: 'sangria', desc: 'House-made fruit-infused wine, built to your recipe or mine.' },
  { name: 'House Red Wine Service', cat: 'sangria', desc: 'Full-bottle service, poured and restocked all night.' },
  { name: 'House White Wine Service', cat: 'sangria', desc: 'Chilled and ready, refreshed throughout the event.' },
  { name: 'Prosecco / Champagne Toast', cat: 'sangria', desc: 'A proper toast service for speeches and send-offs.' },

  // ---- Tropical & Tiki ----
  { name: 'Piña Colada', cat: 'tropical', desc: 'Rum, coconut cream, pineapple — blended or shaken.' },
  { name: 'Mai Tai', cat: 'tropical', desc: 'Aged rum, orgeat, lime, orange liqueur.' },
  { name: 'Painkiller', cat: 'tropical', desc: 'Dark rum, pineapple, orange, cream of coconut, nutmeg.' },
  { name: 'Hurricane', cat: 'tropical', desc: 'Rum blend with passion fruit and a splash of grenadine.' },
  { name: 'Dark & Stormy', cat: 'tropical', desc: 'Dark rum and spicy ginger beer over ice.' },
  { name: 'El Dorado 12yr Old Fashioned', cat: 'tropical', desc: 'Aged Guyanese rum in place of whiskey — rich and layered.', premium: true },

  // ---- Punch & Event Batch ----
  { name: 'Rum Punch', cat: 'punch', desc: 'Multi-rum blend with tropical juices, batch-ready.' },
  { name: 'Event Punch Bowl', cat: 'punch', desc: 'Large-format batch cocktail, self-serve or bartended.' },
  { name: 'Sunrise Cooler', cat: 'punch', desc: 'Signature orange-and-sunset build, designed for sunrise-themed events.' },
  { name: 'Signature Event Color Cocktail', cat: 'punch', desc: 'Custom-built to match your event\'s color palette.' },
  { name: 'Fruit Punch (Family Base)', cat: 'punch', desc: 'Alcohol-optional punch base — spiked or family-friendly.' },

  // ---- Top-Shelf & Premium ----
  { name: 'Casamigos Reposado Old Fashioned', cat: 'premium', desc: 'Smooth reposado tequila in a classic Old Fashioned build.', premium: true },
  { name: 'Hennessy VSOP Sidecar', cat: 'premium', desc: 'Cognac-forward sidecar for a refined sipping crowd.', premium: true },
  { name: 'Macallan 12 Neat / Rocks', cat: 'premium', desc: 'Single malt Scotch, served exactly how your guest wants it.', premium: true },
  { name: 'Grey Goose Martini', cat: 'premium', desc: 'Premium vodka martini, ice-cold and properly stirred.', premium: true },
  { name: 'Johnnie Walker Blue Sipper', cat: 'premium', desc: 'A neat pour for the guest who wants the best in the room.', premium: true },
  { name: 'Espresso Martini', cat: 'premium', desc: 'Vodka, coffee liqueur, fresh espresso — the dessert-course favorite.' },

  // ---- Mocktails & Kids ----
  { name: 'Shirley Temple', cat: 'mocktail', desc: 'Ginger ale, grenadine, a cherry on top — a kids\' event staple.' },
  { name: 'Sparkling Fruit Punch', cat: 'mocktail', desc: 'Fizzy, fruity, and alcohol-free for the youngest guests.' },
  { name: 'Strawberry Lemonade Fizz', cat: 'mocktail', desc: 'Fresh strawberry, lemonade, soda water.' },
  { name: 'Tropical Sunrise Mocktail', cat: 'mocktail', desc: 'All the color of a Tequila Sunrise, none of the alcohol.' },
  { name: 'Cotton Candy Fizz', cat: 'mocktail', desc: 'A playful, color-changing soda drink built for kids\' tables.' },
];

function renderMenu(filter = 'all') {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;
  grid.innerHTML = DRINKS
    .filter((d) => filter === 'all' || d.cat === filter)
    .map(
      (d) => `
      <div class="menu-item cat-${d.cat}${d.premium ? ' premium-item' : ''}">
        <h4>${d.name}</h4>
        <p>${d.desc}</p>
        <div class="m-meta">
          <span class="m-tag">${CATEGORY_LABELS[d.cat]}</span>
          ${d.premium ? '<span class="m-badge">Top Shelf</span>' : ''}
        </div>
      </div>`
    )
    .join('');
}

function initMenuFilters() {
  const filterBar = document.getElementById('menuFilters');
  if (!filterBar) return;
  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    filterBar.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    renderMenu(btn.dataset.filter);
  });
}

function initNavToggle() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  links.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    })
  );
}

function initBookingForm() {
  const form = document.getElementById('bookingForm');
  const note = document.getElementById('formNote');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    note.textContent =
      "Thanks! This form isn't wired to send email yet — connect it to a form backend (e.g. Formspree, Netlify Forms) or update it to mailto so requests reach your inbox.";
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderMenu();
  initMenuFilters();
  initNavToggle();
  initBookingForm();
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
