const heroImage = document.querySelector('#hero-image');
const heroTitle = document.querySelector('#hero-title');
const heroDescription = document.querySelector('#hero-description');
const heroYear = document.querySelector('#hero-year');
const heroGenre = document.querySelector('#hero-genre');
const heroLength = document.querySelector('#hero-length');
const heroRating = document.querySelector('#hero-rating');
const heroDotsContainer = document.querySelector('.hero-dots');
const searchInput = document.querySelector('#movie-search');
const emptyState = document.querySelector('.empty-state');
const catalogStatus = document.querySelector('#catalog-status');
const freeMovieGrid = document.querySelector('#free-movie-grid');
const freeMovieStatus = document.querySelector('#free-movies-status');
const freeMoviePlayer = document.querySelector('#free-movie-player');
const freeMovieEmbed = document.querySelector('#free-movie-embed');
const freeMovieTitle = document.querySelector('#free-movie-title');
const freeMovieSource = document.querySelector('#free-movie-source');
const watchlistNav = document.querySelector('.watchlist-nav');
const watchlistCount = document.querySelector('.watchlist-count');
const heroWatchlist = document.querySelector('.hero-watchlist');
const homePage = document.querySelector('#home');
const detailPage = document.querySelector('#movie-detail');
const accountPage = document.querySelector('#account');
const infoPage = document.querySelector('#info');
const detailStatus = document.querySelector('#detail-status');
const detailContent = document.querySelector('#detail-content');
const detailTrailerButton = document.querySelector('#detail-trailer-button');
const detailTrailer = document.querySelector('#detail-trailer');
const detailWatchlist = document.querySelector('#detail-watchlist');
const siteFooter = document.querySelector('.site-footer');
const catalogs = {
  trending: document.querySelector('[data-catalog="trending"]'),
  upcoming: document.querySelector('[data-catalog="upcoming"]'),
  series: document.querySelector('[data-catalog="series"]')
};

let homeCatalog = null;
let slides = [];
let currentSlide = 0;
let showingWatchlist = false;
let selectedGenre = '';
let searchRequest = 0;
let watchlist = new Set();
let legacyWatchlistTitles = new Set();
let savedItems = new Map();
const knownItems = new Map();
let detailRequest = 0;
let activeDetails = null;
let currentRoute = '';
let currentHash = '';
let displayName = 'Глядач';

try {
  const savedEntries = JSON.parse(localStorage.getItem('filmverse-watchlist') || '[]');
  const storedItems = Array.isArray(savedEntries) ? savedEntries : savedEntries.items;
  if (Array.isArray(storedItems)) {
    storedItems.forEach((entry) => {
      if (typeof entry === 'string') {
        if (entry.includes(':')) watchlist.add(entry);
        else legacyWatchlistTitles.add(entry);
        return;
      }
      if (entry && Number.isInteger(entry.id) && ['movie', 'tv'].includes(entry.media_type)) {
        const key = itemKey(entry);
        savedItems.set(key, entry);
        watchlist.add(key);
      }
    });
  }
  if (!Array.isArray(savedEntries) && Array.isArray(savedEntries.keys)) {
    savedEntries.keys.filter((key) => typeof key === 'string').forEach((key) => watchlist.add(key));
  }
} catch (error) {
  console.warn('Не вдалося прочитати список збережених фільмів.', error);
}

function itemKey(item) {
  return `${item.media_type}:${item.id}`;
}

function updateWatchlistCount() {
  watchlistCount.textContent = String(watchlist.size);
  document.querySelector('#account-watchlist-count').textContent = String(watchlist.size);
}

try {
  const storedName = localStorage.getItem('filmverse-display-name');
  if (storedName) displayName = storedName;
} catch (error) {
  console.warn('Не вдалося прочитати ім’я профілю.', error);
}

function saveWatchlist() {
  try {
    const keys = [...watchlist].filter((key) => !savedItems.has(key));
    localStorage.setItem('filmverse-watchlist', JSON.stringify({
      items: [...savedItems.values()],
      keys
    }));
  } catch (error) {
    console.warn('Не вдалося зберегти список фільмів у браузері.', error);
  }
}

function createCard(item) {
  const key = itemKey(item);
  knownItems.set(key, item);
  const card = document.createElement('article');
  card.className = 'movie-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  card.setAttribute('aria-label', `Детальніше про фільм «${item.title}»`);
  card.dataset.title = item.title;
  card.dataset.genre = item.genres.join('|');
  card.dataset.watchlistKey = key;

  const posterWrap = document.createElement('div');
  posterWrap.className = 'poster-wrap';
  if (item.poster) {
    const image = document.createElement('img');
    image.src = item.poster;
    image.alt = `Постер: ${item.title}`;
    image.loading = 'lazy';
    image.addEventListener('error', () => image.remove(), { once: true });
    posterWrap.append(image);
  } else {
    posterWrap.classList.add('poster-empty');
    posterWrap.textContent = item.title;
  }

  const saveButton = document.createElement('button');
  saveButton.className = 'card-save';
  saveButton.type = 'button';
  saveButton.dataset.action = 'save';
  saveButton.setAttribute('aria-label', `Додати ${item.title} у список`);
  saveButton.textContent = watchlist.has(key) ? '✓' : '＋';
  saveButton.classList.toggle('saved', watchlist.has(key));
  saveButton.setAttribute('aria-pressed', String(watchlist.has(key)));
  posterWrap.append(saveButton);

  const title = document.createElement('h3');
  title.textContent = item.title;
  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const rating = document.createElement('span');
  rating.innerHTML = `<b>★</b> ${Number(item.rating).toFixed(1)}`;
  const year = document.createElement('span');
  year.textContent = item.year;
  meta.append(rating, year);
  card.append(posterWrap, title, meta);
  return card;
}

function renderCards(grid, items) {
  grid.replaceChildren(...items.map(createCard));
}

function updateVisibleCards() {
  let visible = 0;
  document.querySelectorAll('.movie-card').forEach((card) => {
    const matchesGenre = !selectedGenre || card.dataset.genre.split('|').includes(selectedGenre);
    const matchesWatchlist = !showingWatchlist || watchlist.has(card.dataset.watchlistKey);
    card.hidden = !matchesGenre || !matchesWatchlist;
    if (!card.hidden && !card.closest('.catalog-section').hidden) visible += 1;
  });
  if (showingWatchlist) {
    emptyState.textContent = 'Ваш список поки порожній. Додавайте фільми кнопкою ＋.';
  } else {
    emptyState.textContent = 'Нічого не знайдено. Спробуйте інший запит.';
  }
  emptyState.hidden = visible !== 0;
}

function setSlide(index) {
  if (slides.length === 0) return;
  currentSlide = (index + slides.length) % slides.length;
  const slide = slides[currentSlide];
  heroImage.src = slide.backdrop || slide.poster;
  heroImage.alt = `Кадр із фільму ${slide.title}`;
  heroTitle.textContent = slide.title;
  heroDescription.textContent = slide.overview || 'Опис для цього фільму поки недоступний.';
  heroYear.textContent = slide.year;
  heroGenre.textContent = slide.genres[0] || (slide.media_type === 'tv' ? 'Серіал' : 'Фільм');
  heroLength.textContent = slide.media_type === 'tv' ? 'Серіал' : 'Фільм';
  heroRating.textContent = Number(slide.rating).toFixed(1);
  heroWatchlist.dataset.watchlistKey = itemKey(slide);
  const isSaved = watchlist.has(itemKey(slide));
  heroWatchlist.classList.toggle('saved', isSaved);
  heroWatchlist.innerHTML = isSaved
    ? '<span aria-hidden="true">✓</span> У моєму списку'
    : '<span aria-hidden="true">＋</span> Додати в список';
  [...heroDotsContainer.children].forEach((dot, dotIndex) => {
    dot.classList.toggle('selected', dotIndex === currentSlide);
  });
}

function setStatus(message, isError = false) {
  catalogStatus.textContent = message;
  catalogStatus.classList.toggle('error', isError);
  catalogStatus.hidden = !message;
  if (message) {
    emptyState.hidden = true;
  } else {
    updateVisibleCards();
  }
}

function applyLegacyWatchlist(items) {
  const byTitle = new Map(items.map((item) => [item.title, itemKey(item)]));
  legacyWatchlistTitles.forEach((title) => {
    const key = byTitle.get(title);
    if (key) {
      watchlist.add(key);
      const item = knownItems.get(key);
      if (item) savedItems.set(key, item);
    }
  });
  legacyWatchlistTitles.clear();
  saveWatchlist();
  updateWatchlistCount();
}

function renderHome(catalog) {
  homeCatalog = catalog;
  renderCards(catalogs.trending, catalog.trending);
  renderCards(catalogs.upcoming, catalog.upcoming);
  renderCards(catalogs.series, catalog.series);

  const topTen = document.querySelector('#top-ten-list');
  topTen.replaceChildren(...catalog.top_rated.slice(0, 10).map((item, index) => {
    const row = document.createElement('li');
    row.classList.add('top-ten-item');
    row.tabIndex = 0;
    row.setAttribute('role', 'link');
    row.setAttribute('aria-label', `Детальніше про фільм «${item.title}»`);
    row.dataset.mediaType = item.media_type;
    row.dataset.itemId = String(item.id);
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = String(index + 1);
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = item.poster;
    image.addEventListener('error', () => image.remove(), { once: true });
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title;
    const rating = document.createElement('small');
    rating.innerHTML = `<b>★</b> ${Number(item.rating).toFixed(1)}`;
    details.append(title, rating);
    row.append(rank, image, details);
    return row;
  }));

  slides = catalog.trending.slice(0, 4);
  heroDotsContainer.replaceChildren(...slides.map((_, index) => {
    const dot = document.createElement('button');
    dot.className = 'hero-dot';
    dot.type = 'button';
    dot.setAttribute('aria-label', `Фільм ${index + 1}`);
    dot.addEventListener('click', () => setSlide(index));
    return dot;
  }));
  applyLegacyWatchlist([
    ...catalog.trending,
    ...catalog.upcoming,
    ...catalog.series,
    ...catalog.top_rated
  ]);
  if (window.location.hash === '#watchlist') {
    renderCards(catalogs.trending, [...savedItems.values()]);
  }
  setSlide(0);
  updateVisibleCards();
}

function showSearchMode(mode) {
  const isFilteredView = mode !== '';
  document.querySelector('#new').hidden = isFilteredView;
  document.querySelector('#series').hidden = isFilteredView;
  document.querySelector('#free-movies').hidden = isFilteredView;
  document.querySelector('.top-ten').hidden = isFilteredView;
  document.querySelector('#popular h2').textContent = mode === 'search'
    ? 'Результати пошуку'
    : mode === 'watchlist' ? 'Мій список' : 'Популярні фільми';
}

async function loadHomeCatalog() {
  setStatus('Завантажуємо каталог фільмів та серіалів…');
  try {
    const response = await fetch('/api/home');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не вдалося завантажити каталог.');
    renderHome(payload);
    setStatus('');
    if (currentRoute === 'home' && history.state?.filmVerseView) {
      restoreHomeView(history.state.filmVerseView);
    }
  } catch (error) {
    setStatus(error.message || 'Не вдалося завантажити каталог. Спробуйте оновити сторінку.', true);
    document.querySelector('#hero-title').textContent = 'Каталог тимчасово недоступний';
  }
}

async function searchCatalog(query, requestId) {
  if (!query) {
    showingWatchlist = false;
    watchlistNav.setAttribute('aria-pressed', 'false');
    showSearchMode('');
    if (homeCatalog) {
      renderCards(catalogs.trending, homeCatalog.trending);
      updateVisibleCards();
    }
    setStatus('');
    return;
  }

  showingWatchlist = false;
  watchlistNav.setAttribute('aria-pressed', 'false');
  showSearchMode('search');
  renderCards(catalogs.trending, []);
  updateVisibleCards();
  setStatus('Шукаємо фільми та серіали…');
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const payload = await response.json();
    if (requestId !== searchRequest) return;
    if (!response.ok) throw new Error(payload.error || 'Не вдалося виконати пошук.');
    renderCards(catalogs.trending, payload.results);
    setStatus('');
  } catch (error) {
    if (requestId === searchRequest) setStatus(error.message || 'Не вдалося виконати пошук.', true);
  }
}

function createFreeMovieCard(item) {
  const card = document.createElement('article');
  card.className = 'free-movie-card';

  const image = document.createElement('img');
  image.src = `https://archive.org/services/img/${encodeURIComponent(item.identifier)}`;
  image.alt = `Постер: ${item.title}`;
  image.loading = 'lazy';
  image.addEventListener('error', () => image.remove(), { once: true });

  const content = document.createElement('div');
  content.className = 'free-movie-card-content';
  const title = document.createElement('h3');
  title.textContent = item.title;
  const metadata = document.createElement('p');
  metadata.textContent = [item.year, 'Public Domain'].filter(Boolean).join(' · ');
  const description = document.createElement('p');
  description.textContent = item.description || 'Опис на сторінці Internet Archive.';
  const play = document.createElement('button');
  play.className = 'button button-primary';
  play.type = 'button';
  play.dataset.freeMovieId = item.identifier;
  play.textContent = '▶ Дивитись';
  const license = document.createElement('a');
  license.href = item.license_url;
  license.target = '_blank';
  license.rel = 'noopener noreferrer';
  license.textContent = 'Ліцензія';

  content.append(title, metadata, description, play, license);
  card.append(image, content);
  return card;
}

async function loadFreeMovies() {
  freeMovieStatus.textContent = 'Завантажуємо безкоштовні фільми…';
  freeMovieStatus.classList.remove('error');
  try {
    const response = await fetch('/api/free-movies');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не вдалося завантажити каталог безкоштовних фільмів.');
    if (!Array.isArray(payload.results)) throw new Error('Каталог безкоштовних фільмів повернув некоректні дані.');
    freeMovieGrid.replaceChildren(...payload.results.map(createFreeMovieCard));
    freeMovieStatus.textContent = payload.results.length
      ? ''
      : 'Зараз немає доступних фільмів. Спробуйте пізніше.';
  } catch (error) {
    freeMovieStatus.textContent = error.message || 'Не вдалося завантажити фільми. Спробуйте пізніше.';
    freeMovieStatus.classList.add('error');
  }
}

function playFreeMovie(identifier) {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(identifier)) return;
  const item = freeMovieGrid.querySelector(`[data-free-movie-id="${CSS.escape(identifier)}"]`);
  if (!item) return;
  freeMovieTitle.textContent = item.closest('.free-movie-card').querySelector('h3').textContent;
  freeMovieEmbed.title = `Фільм: ${freeMovieTitle.textContent}`;
  freeMovieEmbed.src = `https://archive.org/embed/${encodeURIComponent(identifier)}`;
  freeMovieSource.href = `https://archive.org/details/${encodeURIComponent(identifier)}`;
  freeMoviePlayer.hidden = false;
  freeMoviePlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function toggleWatchlist(key, button) {
  if (!key) return;
  if (watchlist.has(key)) {
    watchlist.delete(key);
    savedItems.delete(key);
  } else {
    watchlist.add(key);
    const item = knownItems.get(key);
    if (item) savedItems.set(key, item);
  }
  saveWatchlist();
  updateWatchlistCount();

  const isSaved = watchlist.has(key);
  if (button === heroWatchlist) {
    button.classList.toggle('saved', isSaved);
    button.innerHTML = isSaved
      ? '<span aria-hidden="true">✓</span> У моєму списку'
      : '<span aria-hidden="true">＋</span> Додати в список';
  } else if (button) {
    button.textContent = isSaved ? '✓' : '＋';
    button.classList.toggle('saved', isSaved);
    button.setAttribute('aria-pressed', String(isSaved));
  }
  if (button === detailWatchlist) {
    button.innerHTML = isSaved
      ? '<span aria-hidden="true">✓</span> У моєму списку'
      : '<span aria-hidden="true">＋</span> Додати до списку';
    button.classList.toggle('saved', isSaved);
  }
  updateVisibleCards();
  if (showingWatchlist) renderCards(catalogs.trending, [...savedItems.values()]);
}

function appendMeta(text, isRating = false) {
  const value = document.createElement('span');
  if (isRating) {
    value.className = 'rating';
    value.innerHTML = `<span class="star">★</span> ${text}`;
  } else {
    value.textContent = text;
  }
  const meta = document.querySelector('#detail-meta');
  if (meta.childElementCount) {
    const separator = document.createElement('span');
    separator.className = 'meta-dot';
    meta.append(separator);
  }
  meta.append(value);
}

function formatRuntime(minutes) {
  if (!Number.isInteger(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) return `${hours} год ${remainder} хв`;
  return hours ? `${hours} год` : `${remainder} хв`;
}

function renderDetailFacts(item) {
  const facts = document.querySelector('#detail-facts');
  const entries = [
    ['Режисер', item.director],
    ['Країна', item.countries.join(', ')],
    ['Мова', item.languages.join(', ')],
    ['Прем’єра', item.release_date],
    ['Статус', item.status],
    ['Тривалість', formatRuntime(item.runtime)]
  ].filter(([, value]) => value);
  facts.replaceChildren(...entries.flatMap(([label, value]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    return [term, description];
  }));
}

function renderTrailer(item) {
  detailTrailer.replaceChildren();
  detailTrailerButton.hidden = !item.trailer;

  if (item.backdrop) {
    const image = document.createElement('img');
    image.src = item.backdrop;
    image.alt = `Кадр із фільму ${item.title}`;
    image.addEventListener('error', () => image.remove(), { once: true });
    detailTrailer.append(image);
  }

  if (!item.trailer) {
    const placeholder = document.createElement('span');
    placeholder.className = 'trailer-placeholder';
    placeholder.textContent = 'Трейлер поки недоступний';
    detailTrailer.append(placeholder);
    return;
  }

  const play = document.createElement('button');
  play.className = 'trailer-play';
  play.type = 'button';
  play.setAttribute('aria-label', 'Відтворити трейлер');
  play.textContent = '▶';
  play.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `${item.trailer}?autoplay=1&rel=0`;
    iframe.title = `Трейлер: ${item.title}`;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    detailTrailer.replaceChildren(iframe);
  }, { once: true });
  detailTrailer.append(play);
}

function renderCast(cast) {
  const container = document.querySelector('#detail-cast');
  container.replaceChildren(...cast.map((person) => {
    const card = document.createElement('article');
    card.className = 'cast-card';
    if (person.profile) {
      const image = document.createElement('img');
      image.src = person.profile;
      image.alt = person.name;
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        const placeholder = document.createElement('div');
        placeholder.className = 'cast-placeholder';
        placeholder.textContent = person.name;
        image.replaceWith(placeholder);
      }, { once: true });
      card.append(image);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'cast-placeholder';
      placeholder.textContent = person.name;
      card.append(placeholder);
    }
    const information = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = person.name;
    const character = document.createElement('span');
    character.textContent = person.character || 'У ролях';
    information.append(name, character);
    card.append(information);
    return card;
  }));
  container.closest('.detail-section').hidden = cast.length === 0;
}

function renderReviews(reviews) {
  const section = document.querySelector('#reviews-section');
  const container = document.querySelector('#detail-reviews');
  container.replaceChildren(...reviews.map((review) => {
    const card = document.createElement('article');
    card.className = 'review-card';
    const author = document.createElement('strong');
    author.textContent = review.author;
    card.append(author);
    if (Number.isFinite(review.rating)) {
      const rating = document.createElement('span');
      rating.className = 'review-rating';
      rating.textContent = `★ ${review.rating}`;
      card.append(rating);
    }
    const content = document.createElement('p');
    content.textContent = review.content;
    card.append(content);
    return card;
  }));
  section.hidden = reviews.length === 0;
}

function renderSimilar(items) {
  const section = document.querySelector('#similar-section');
  const container = document.querySelector('#detail-similar');
  container.replaceChildren(...items.map((item) => {
    const key = itemKey(item);
    knownItems.set(key, item);
    const row = document.createElement('article');
    row.className = 'similar-item';
    row.tabIndex = 0;
    row.setAttribute('role', 'link');
    row.setAttribute('aria-label', `Детальніше про фільм «${item.title}»`);
    row.dataset.mediaType = item.media_type;
    row.dataset.itemId = String(item.id);
    if (item.poster) {
      const image = document.createElement('img');
      image.src = item.poster;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => image.remove(), { once: true });
      row.append(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'similar-poster-placeholder';
      placeholder.textContent = item.title;
      row.append(placeholder);
    }
    const information = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title;
    const meta = document.createElement('span');
    meta.textContent = [item.year, `★ ${Number(item.rating).toFixed(1)}`].filter(Boolean).join(' · ');
    information.append(title, meta);
    row.append(information);
    return row;
  }));
  section.hidden = items.length === 0;
}

function renderDetails(item) {
  activeDetails = item;
  knownItems.set(itemKey(item), item);
  document.title = `${item.title} — FilmVerse`;
  document.querySelector('#detail-backdrop').src = item.backdrop || item.poster || '';
  document.querySelector('#detail-backdrop').alt = `Кадр із фільму ${item.title}`;
  document.querySelector('#detail-type').textContent = item.media_type === 'tv' ? 'Серіал' : 'Фільм';
  document.querySelector('#detail-title').textContent = item.title;
  document.querySelector('#detail-tagline').textContent = item.tagline || item.overview || '';
  document.querySelector('#detail-overview').textContent = item.overview || 'Опис для цього фільму поки недоступний.';
  const meta = document.querySelector('#detail-meta');
  meta.replaceChildren();
  if (item.year) appendMeta(item.year);
  item.genres.slice(0, 2).forEach((genre) => appendMeta(genre));
  const runtime = formatRuntime(item.runtime);
  if (runtime) appendMeta(runtime);
  appendMeta(Number(item.rating).toFixed(1), true);
  document.querySelector('#detail-rating-value').textContent = Number(item.rating).toFixed(1);
  document.querySelector('#detail-vote-count').textContent = `${Number(item.vote_count).toLocaleString('uk-UA')} оцінок`;
  document.querySelector('#detail-genres').replaceChildren(...item.genres.map((genre) => {
    const chip = document.createElement('span');
    chip.textContent = genre;
    return chip;
  }));
  renderDetailFacts(item);
  renderTrailer(item);
  renderCast(item.cast);
  renderReviews(item.reviews);
  renderSimilar(item.similar);
  const saved = watchlist.has(itemKey(item));
  detailWatchlist.classList.toggle('saved', saved);
  detailWatchlist.innerHTML = saved
    ? '<span aria-hidden="true">✓</span> У моєму списку'
    : '<span aria-hidden="true">＋</span> Додати до списку';
}

async function loadDetails(mediaType, itemId) {
  const requestId = ++detailRequest;
  homePage.hidden = true;
  detailPage.hidden = false;
  accountPage.hidden = true;
  infoPage.hidden = true;
  siteFooter.hidden = true;
  detailContent.hidden = true;
  detailStatus.hidden = false;
  detailStatus.classList.remove('error');
  detailStatus.textContent = 'Завантажуємо інформацію про фільм…';
  detailTrailer.replaceChildren();
  window.scrollTo({ top: 0, behavior: 'auto' });

  try {
    const response = await fetch(`/api/details/${mediaType}/${itemId}`);
    const payload = await response.json();
    if (requestId !== detailRequest) return;
    if (!response.ok) throw new Error(payload.error || 'Не вдалося завантажити інформацію про фільм.');
    renderDetails(payload);
    detailStatus.hidden = true;
    detailContent.hidden = false;
  } catch (error) {
    if (requestId !== detailRequest) return;
    detailStatus.textContent = error.message || 'Не вдалося завантажити інформацію. Спробуйте ще раз.';
    detailStatus.classList.add('error');
  }
}

function openDetails(mediaType, itemId) {
  const nextHash = `#movie/${mediaType}/${itemId}`;
  if (window.location.hash !== nextHash) {
    pushRoute(nextHash, true);
  }
  syncPageWithLocation();
}

const informationPages = {
  about: {
    title: 'Про FilmVerse',
    paragraphs: [
      'FilmVerse допомагає знаходити фільми та серіали, зберігати обране й відкривати безкоштовні стрічки з відкритого каталогу.',
      'Каталог і відомості про фільми надає TMDB. Безкоштовні фільми надходять з Internet Archive.'
    ]
  },
  contact: {
    title: 'Контакти',
    paragraphs: [
      'FilmVerse наразі є локальним проєктом і не має налаштованої служби підтримки чи адреси для звернень.'
    ]
  },
  rules: {
    title: 'Правила та джерела',
    paragraphs: [
      'FilmVerse показує інформацію про фільми та серіали, отриману від TMDB. Сам сайт не надає повні версії комерційних фільмів.',
      'Безкоштовні відео вбудовуються з Internet Archive. Перед переглядом перевіряйте права, ліцензію та доступність на сторінці першоджерела.'
    ]
  },
  help: {
    title: 'Допомога',
    paragraphs: [
      'Відкривайте картки, щоб переглянути деталі. Значок «＋» додає стрічку до списку, який доступний через «Мій список».',
      'Ім’я профілю та список зберігаються локально в цьому браузері. Для переходу між екранами також працюють кнопки браузера «Назад» і «Вперед».'
    ]
  }
};

function renderInformationPage(pageName) {
  const page = informationPages[pageName];
  if (!page) return false;
  document.querySelector('#info-title').textContent = page.title;
  const content = document.querySelector('#info-content');
  content.replaceChildren(...page.paragraphs.map((text) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    return paragraph;
  }));
  return true;
}

function showWatchlist() {
  showingWatchlist = true;
  selectedGenre = '';
  watchlistNav.setAttribute('aria-pressed', 'false');
  searchInput.value = '';
  searchRequest += 1;
  clearTimeout(searchTimer);
  document.querySelectorAll('.genre-grid button').forEach((button) => button.classList.remove('selected'));
  watchlistNav.classList.add('active');
  watchlistNav.setAttribute('aria-pressed', 'true');
  showSearchMode('watchlist');
  renderCards(catalogs.trending, [...savedItems.values()]);
  setStatus('');
}

function captureHomeView() {
  return {
    search: searchInput.value,
    showingWatchlist,
    selectedGenre,
    scrollY: window.scrollY
  };
}

function restoreHomeView(view) {
  if (!view || typeof view !== 'object') return;
  clearTimeout(searchTimer);
  searchRequest += 1;
  searchInput.value = typeof view.search === 'string' ? view.search : '';
  showingWatchlist = view.showingWatchlist === true;
  selectedGenre = typeof view.selectedGenre === 'string' ? view.selectedGenre : '';
  watchlistNav.classList.toggle('active', showingWatchlist);
  watchlistNav.setAttribute('aria-pressed', String(showingWatchlist));
  document.querySelectorAll('.genre-grid button').forEach((button) => {
    button.classList.toggle('selected', button.dataset.genre === selectedGenre);
  });

  if (showingWatchlist) {
    showSearchMode('watchlist');
    renderCards(catalogs.trending, [...savedItems.values()]);
    setStatus('');
  } else if (searchInput.value) {
    showingWatchlist = false;
    showSearchMode('search');
    renderCards(catalogs.trending, []);
    const requestId = searchRequest;
    setStatus('Шукаємо фільми та серіали…');
    searchCatalog(searchInput.value.trim(), requestId);
  } else {
    showSearchMode('');
    if (homeCatalog) {
      renderCards(catalogs.trending, homeCatalog.trending);
      renderCards(catalogs.upcoming, homeCatalog.upcoming);
      renderCards(catalogs.series, homeCatalog.series);
    }
    setStatus('');
  }

  requestAnimationFrame(() => {
    window.scrollTo({ top: Number.isFinite(view.scrollY) ? view.scrollY : 0, behavior: 'auto' });
  });
}

function syncPageWithLocation() {
  const hash = window.location.hash || '#home';
  const match = hash.match(/^#movie\/(movie|tv)\/(\d+)$/);
  document.querySelectorAll('.main-nav .nav-link').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === hash);
  });
  if (match) {
    const route = `movie:${match[1]}:${match[2]}`;
    if (currentRoute !== route) {
      currentRoute = route;
      currentHash = hash;
      loadDetails(match[1], match[2]);
    }
    return;
  }
  const infoMatch = hash.match(/^#(about|contact|rules|help)$/);
  const nextRoute = hash === '#account'
    ? 'account'
    : infoMatch ? `info:${infoMatch[1]}` : 'home';
  const locationChanged = currentHash !== hash;
  if (currentRoute === nextRoute && !locationChanged) return;
  const routeChanged = currentRoute !== nextRoute;
  currentRoute = nextRoute;
  currentHash = hash;
  detailRequest += 1;
  activeDetails = null;
  detailPage.hidden = true;
  accountPage.hidden = nextRoute !== 'account';
  infoPage.hidden = !nextRoute.startsWith('info:');
  homePage.hidden = nextRoute !== 'home';
  siteFooter.hidden = false;
  document.title = nextRoute === 'account'
    ? 'Акаунт — FilmVerse'
    : nextRoute.startsWith('info:')
      ? `${informationPages[nextRoute.slice(5)].title} — FilmVerse`
      : 'FilmVerse — фільми та серіали';
  if (nextRoute === 'account') {
    document.querySelector('#account-display-name').value = displayName;
    updateWatchlistCount();
  } else if (nextRoute.startsWith('info:')) {
    renderInformationPage(nextRoute.slice(5));
  } else if (nextRoute === 'home') {
    if (history.state?.filmVerseView) {
      restoreHomeView(history.state.filmVerseView);
    } else if (hash === '#watchlist') {
      showWatchlist();
      requestAnimationFrame(() => {
        document.querySelector('#popular').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      resetCatalogFilters();
      if (hash !== '#home' && hash !== '#') {
        requestAnimationFrame(() => {
          document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else if (locationChanged) {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }
  }
  if (routeChanged && nextRoute !== 'home') {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function pushRoute(hash, isDetail = false) {
  if (currentRoute === 'home') {
    const state = history.state && typeof history.state === 'object' ? history.state : {};
    history.replaceState({ ...state, filmVerseView: captureHomeView() }, '', window.location.href);
  }
  history.pushState(isDetail ? { filmVerseDetail: true } : { filmVerseNavigation: true }, '', hash);
}

function navigateToHash(hash) {
  const unchanged = window.location.hash === hash;
  if (!unchanged) {
    pushRoute(hash);
  }
  syncPageWithLocation();
  if (unchanged && currentRoute === 'home') {
    if (hash === '#watchlist') {
      showWatchlist();
    } else if (hash !== '#home' && hash !== '#') {
      resetCatalogFilters();
      requestAnimationFrame(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}

function resetCatalogFilters() {
  clearTimeout(searchTimer);
  searchRequest += 1;
  showingWatchlist = false;
  selectedGenre = '';
  searchInput.value = '';
  watchlistNav.classList.remove('active');
  document.querySelectorAll('.genre-grid button').forEach((button) => button.classList.remove('selected'));
  showSearchMode('');
  if (homeCatalog) {
    renderCards(catalogs.trending, homeCatalog.trending);
    renderCards(catalogs.upcoming, homeCatalog.upcoming);
    renderCards(catalogs.series, homeCatalog.series);
  }
  setStatus('');
}

document.querySelector('.avatar').textContent = displayName.trim().charAt(0).toLocaleUpperCase('uk-UA') || 'Г';
document.querySelector('.account-avatar').textContent = document.querySelector('.avatar').textContent;
document.querySelector('#detail-back').addEventListener('click', () => {
  if (history.state?.filmVerseDetail) {
    history.back();
  } else {
    navigateToHash('#home');
  }
});
window.addEventListener('hashchange', syncPageWithLocation);
window.addEventListener('popstate', syncPageWithLocation);
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const hash = link.getAttribute('href');
  if (!hash || hash === '#' || document.getElementById(hash.slice(1))) {
    event.preventDefault();
    if (link.closest('.main-nav')) {
      mainNav.classList.remove('menu-open');
      menuButton.setAttribute('aria-expanded', 'false');
    }
    navigateToHash(hash && hash !== '#' ? hash : '#home');
    return;
  }
  if (informationPages[hash.slice(1)]) {
    event.preventDefault();
    navigateToHash(hash);
  }
});
document.querySelector('.avatar').addEventListener('click', () => navigateToHash('#account'));
document.querySelector('#info-back').addEventListener('click', () => navigateToHash('#home'));
document.querySelector('#account-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#account-display-name');
  const nextName = input.value.trim();
  if (!nextName) {
    input.focus();
    return;
  }
  displayName = nextName;
  try {
    localStorage.setItem('filmverse-display-name', displayName);
    document.querySelector('.avatar').textContent = displayName.charAt(0).toLocaleUpperCase('uk-UA');
    document.querySelector('.account-avatar').textContent = document.querySelector('.avatar').textContent;
    document.querySelector('#account-save-status').textContent = 'Ім’я профілю збережено на цьому пристрої.';
  } catch (error) {
    console.warn('Не вдалося зберегти ім’я профілю.', error);
    document.querySelector('#account-save-status').textContent = 'Не вдалося зберегти ім’я. Перевір налаштування браузера.';
  }
});
document.querySelector('#account-open-watchlist').addEventListener('click', () => {
  navigateToHash('#watchlist');
});
detailWatchlist.addEventListener('click', () => {
  if (activeDetails) toggleWatchlist(itemKey(activeDetails), detailWatchlist);
});
detailTrailerButton.addEventListener('click', () => {
  detailTrailer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  detailTrailer.querySelector('.trailer-play')?.click();
});

document.querySelector('.hero-prev').addEventListener('click', () => setSlide(currentSlide - 1));
document.querySelector('.hero-next').addEventListener('click', () => setSlide(currentSlide + 1));
heroWatchlist.addEventListener('click', () => {
  toggleWatchlist(heroWatchlist.dataset.watchlistKey, heroWatchlist);
  setSlide(currentSlide);
});

document.querySelectorAll('.movie-grid').forEach((grid) => {
  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="save"]');
    const card = event.target.closest('.movie-card');
    if (!card) return;
    if (button) {
      toggleWatchlist(card.dataset.watchlistKey, button);
      return;
    }
    const item = knownItems.get(card.dataset.watchlistKey);
    if (item) openDetails(item.media_type, item.id);
  });
  grid.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
    const card = event.target.closest('.movie-card');
    if (!card) return;
    event.preventDefault();
    const item = knownItems.get(card.dataset.watchlistKey);
    if (item) openDetails(item.media_type, item.id);
  });
});
document.querySelector('#detail-similar').addEventListener('click', (event) => {
  const row = event.target.closest('.similar-item');
  if (row) openDetails(row.dataset.mediaType, row.dataset.itemId);
});
document.querySelector('#detail-similar').addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const row = event.target.closest('.similar-item');
  if (!row) return;
  event.preventDefault();
  openDetails(row.dataset.mediaType, row.dataset.itemId);
});
const topTenList = document.querySelector('#top-ten-list');
topTenList.addEventListener('click', (event) => {
  const row = event.target.closest('.top-ten-item');
  if (row) openDetails(row.dataset.mediaType, row.dataset.itemId);
});
topTenList.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const row = event.target.closest('.top-ten-item');
  if (!row) return;
  event.preventDefault();
  openDetails(row.dataset.mediaType, row.dataset.itemId);
});

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  if (currentRoute !== 'home' || window.location.hash === '#watchlist') navigateToHash('#home');
  showingWatchlist = false;
  selectedGenre = '';
  watchlistNav.classList.remove('active');
  document.querySelectorAll('.genre-grid button').forEach((button) => button.classList.remove('selected'));
  const requestId = ++searchRequest;
  searchTimer = setTimeout(() => searchCatalog(searchInput.value.trim(), requestId), 300);
});

watchlistNav.addEventListener('click', () => {
  watchlistNav.setAttribute('aria-pressed', String(window.location.hash !== '#watchlist'));
  navigateToHash(window.location.hash === '#watchlist' ? '#home' : '#watchlist');
});

document.querySelectorAll('.genre-grid button').forEach((button) => {
  button.addEventListener('click', () => {
    if (window.location.hash === '#watchlist') navigateToHash('#home');
    selectedGenre = selectedGenre === button.dataset.genre ? '' : button.dataset.genre;
    showingWatchlist = false;
    searchInput.value = '';
    searchRequest += 1;
    watchlistNav.classList.remove('active');
    document.querySelectorAll('.genre-grid button').forEach((genreButton) => {
      genreButton.classList.toggle('selected', genreButton === button && selectedGenre !== '');
    });
    showSearchMode('');
    if (homeCatalog) {
      renderCards(catalogs.trending, homeCatalog.trending);
      renderCards(catalogs.upcoming, homeCatalog.upcoming);
      renderCards(catalogs.series, homeCatalog.series);
      updateVisibleCards();
    }
    document.querySelector('#popular').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

document.querySelector('.play-button').addEventListener('click', () => {
  navigateToHash('#free-movies');
});
freeMovieGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-free-movie-id]');
  if (button) playFreeMovie(button.dataset.freeMovieId);
});
document.querySelector('#free-movie-close').addEventListener('click', () => {
  freeMovieEmbed.src = 'about:blank';
  freeMoviePlayer.hidden = true;
});

const menuButton = document.querySelector('.mobile-menu');
const mainNav = document.querySelector('.main-nav');
menuButton.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('menu-open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});
updateWatchlistCount();
loadHomeCatalog();
loadFreeMovies();
syncPageWithLocation();
