var VOWELS = 'aeiou';
var N = 'n';
var STATS = [
  'attack',
  'speed',
  'defense'
];
var LAYERS = [
  'hbe',
  'hb',
  'bd',
  'cb',
  'ct',
  'hd',
  'hf',
  'hfe',
  'ah',
  'mt',
  'ns',
  'ey',
  'eb'
];
var AFFINITIES = ['rock', 'paper', 'scissors'];
var RARITIES = [
  'Charred',
  'Well done',
  'Medium well',
  'Medium',
  'Medium rare',
  'Rare',
  'Blue',
  'Raw',
  'Mooing'
];
var BASE_RARITY = 300;
var RARITY_CURVE = 0.6;

var LETTER_DELAY = 20;
var LETTER_DELAYS = {
  '.': 8,
  ',': 4
};

var NEGATIVE_STAT_EFFECT = 2;

var POSES;
var HAIR_COLOURS;
var SKIN_COLOURS;

var confettiTimeout;

var cookieExpiryDate = new Date();
cookieExpiryDate.setFullYear(cookieExpiryDate.getFullYear() + 50);
var cookieSuffix = '; expires=' + cookieExpiryDate.toUTCString();
var cookieSliceSize = 2000;
var endString = 'end';

var idolSorters = {
  date: function(a, b) { return b.recruitedAt - a.recruitedAt; },
  statSpeed: function(a, b) { return b.speed - a.speed; },
  statAttack: function(a, b) { return b.attack - a.attack; },
  statDefense: function(a, b) { return b.defense - a.defense; },
  unitMembership: function(a, b) { return (Number(b.isInUnit()) - Number(a.isInUnit())); },
  allStats: function(a, b) { return b.totalStats() - a.totalStats(); },
  affinity: function(a, b) { return (
    (AFFINITIES.indexOf(a.affinity) - AFFINITIES.indexOf(b.affinity)) +
    (idolSorters.allStats(a, b) / 10000)
  ); }
};

var idolSortNames = {
  date: 'Date recruited',
  statSpeed: 'Speed',
  statAttack: 'Attack',
  statDefense: 'Defense',
  allStats: 'Total of all stats',
  affinity: 'Affinity and stats',
  unitMembership: 'Unit membership'
};

function getStateCookie() {
  var cookieStrings = document.cookie.split(';');

  indices = [];
  fragments = {};

  for(var i = 0, n = cookieStrings.length; i < n; i++) {
    var matches = cookieStrings[i].match(/(?:state_(\d+)+=)(.*)/);
    if (!matches) {
      continue;
    }
    var index = parseInt(matches[1], 10);
    var fragment = matches[2];
    indices.push(index);
    fragments[index] = fragment;
  }
  
  indices.sort(function(a, b) { return a - b; });

  var stateString = '';

  for (var f = 0; f < indices.length; f++) {
    var thisFragment = fragments[indices[f]];
    if (thisFragment === endString) break;
    stateString += thisFragment;
  }

  return atob(stateString);
}

var barcodeImage = document.getElementById('barcode-image');
var detailElement = document.getElementById('idol-detail');
var catalogElement = document.getElementById('catalog');
var unitElement = document.getElementById('unit');
var battleElement = document.getElementById('battle');
var promptArea = document.getElementById('prompt-area');
var auditionSpace = document.getElementById('audition-space');
var canteenElement = document.getElementById('canteen');
var theatreElement = document.getElementById('theatre');

var spriteTemplate = Handlebars.compile(document.getElementById('sprite-template').innerHTML);
var catalogTemplate = Handlebars.compile(document.getElementById('catalog-template').innerHTML);
var unitTemplate = Handlebars.compile(document.getElementById('unit-template').innerHTML);
var idolDetailTemplate = Handlebars.compile(document.getElementById('idol-detail-template').innerHTML);
var battleTemplate = Handlebars.compile(document.getElementById('battle-template').innerHTML);
var healthBarTemplate = Handlebars.compile(document.getElementById('health-bar-template').innerHTML);
var abilityPromptTemplate = Handlebars.compile(document.getElementById('ability-prompt-template').innerHTML);
var promptTemplate = Handlebars.compile(document.getElementById('prompt-template').innerHTML);
var auditionTemplate = Handlebars.compile(document.getElementById('audition-template').innerHTML);
var canteenTemplate = Handlebars.compile(document.getElementById('canteen-template').innerHTML);
var canteenConfirmTemplate = Handlebars.compile(document.getElementById('canteen-confirm-template').innerHTML);
var theatreTemplate = Handlebars.compile(document.getElementById('theatre-template').innerHTML);

var maxUnitSize = 3;
var rerenderTimeout;
var checkSaveTimeout;

function choice(list, slice) {
  var result = list[Math.floor(slice * list.length)];
  return result;
}

function seededRandom(seed) {
  function rand(max, min) {
    max = max || 1;
    min = min || 0;

    seed = (seed * 9301 + 49297) % 233280;
    var rnd = seed / 233280;

    return min + rnd * (max - min);
  }

  rand();

  return rand;
}

function celebrate(density) {
  confetti.setDensity(density);
  if (!confettiTimeout) confetti.restart();

  clearTimeout(confettiTimeout);
  confettiTimeout = setTimeout(function() {
    confetti.stop();
    clearTimeout(confettiTimeout);
    confettiTimeout = undefined;
  }, 3000);
}

function askUser(question, answers) {
  if (answers === undefined) answers = [['Okay', null]];

  promptArea.innerHTML = promptTemplate({
    'question': question,
    'answers': answers
  });

  function doAnswer(event) {
    event.stopPropagation();
    event.preventDefault();
    var answerIndex = parseInt(event.currentTarget.getAttribute('data-answer-index'), 10);
    promptArea.innerHTML = '';
    var func = answers[answerIndex][1];
    if (func) func();
  }

  for (var i = 0; i < answers.length; i++) {
    promptArea.querySelector('a[data-answer-index="' + i.toString() + '"]').addEventListener('click', doAnswer);
  }
}

function getRarity(stats) {
  if (stats < 0) return RARITIES[0];
  rarityIndex = Math.floor(Math.pow(stats/BASE_RARITY, RARITY_CURVE));
  return RARITIES[rarityIndex] || RARITIES[RARITIES.length - 1];
}

function Ability(idol, parts, animation, affinity) {
  this.strength = 0;
  this.healing = false;
  this.affinity = affinity;

  var partNames = [];

  for(var i = 0, n = parts.length; i < n; i++) {
    var part = parts[i];
    partNames.push(choice(part.words, idol.rand()));
    this.strength += part.bonus;
    if (part.healing) {
      this.healing = true;
    }
  }

  this.name = partNames.join(' ');

  this.animation = animation;
}

function Idol(seed) {
  var self = this;

  this.recruitedAt = new Date().getTime();
  this.seed = seed;
  this.identifier = seed.toString(10);
  this.rand = seededRandom(seed);
  this.xp = 0;
  this.level = 0;

  // build stats
  for(var i = 0, n = STATS.length; i < n; i++) {
    this[STATS[i]] = Math.floor(this.rand(-100, 100));
  }

  this.abilities = [];

  // build name
  this.firstName = this.generateName();
  this.lastName = this.generateName();
  this.name = [this.firstName, this.lastName].join(' ');

  // build portrait
  var partsMissing = true;
  var pose, skinColour, hairColour;

  function partIsAllowed(part) {
    if (part.pose && part.pose !== pose) return false;
    if (part.skinColour && part.skinColour !== skinColour) return false;
    if (part.hairColour && part.hairColour !== hairColour) return false;
    return true;
  }

  while (partsMissing) {
    partsMissing = false;
    pose = choice(POSES, this.rand());
    skinColour = choice(SKIN_COLOURS, this.rand());
    hairColour = choice(HAIR_COLOURS, this.rand());

    this.parts = [];

    for(var li = 0, ln = LAYERS.length; li < ln; li++) {
      var options = PARTS[LAYERS[li]].filter(partIsAllowed);
      if (options.length === 0) {
        partsMissing = true;
      } else {
        this.parts.push(choice(options, this.rand()));
      }
    }
  }

  this.loadedImages = {};

  // build bio
  var bioParts = [];
  while(bioParts.length < 3) {
    var part = choice(BIOS, this.rand());
    if (bioParts.indexOf(part) === -1) {
      bioParts.push(part);
    }
  }
  this.bio = bioParts.join(' ');
  this.quote = choice(QUOTES, this.rand());

  // build moveset
  while (this.abilities.length < 4) {
    var abilityParts = [];

    if (this.rand() > 0.8)
      abilityParts.push(choice(ABILITIES[0], this.rand()));

    abilityParts.push(choice(ABILITIES[1], this.rand()));
    abilityParts.push(choice(ABILITIES[2], this.rand()));
    this.abilities.push(new Ability(this, abilityParts, choice(ANIMATIONS, this.rand()), choice(AFFINITIES, this.rand())));
  }

  // build affinity
  this.affinity = choice(AFFINITIES, this.rand());
}
Idol.prototype.generateName = function() {
  var name = '';
  var kanaCount = Math.floor(this.rand(4, 2));
  while (kanaCount > 0) {
    var targetDepth = this.rand();
    var currentDepth = 0;
    var nextKana;

    for (var ki = 0; ki < KANA.length; ki++) {
      var item = KANA[ki];
      nextKana = item[0];
      currentDepth += item[1];
      if (currentDepth >= targetDepth) {
        break;
      }
    }

    name += nextKana;
    if (this.rand() > 0.9) name += N;

    kanaCount--;
  }
  name = name[0].toUpperCase() + name.slice(1);
  return name;
};
Idol.prototype.deferRendering = function(mode) {
  var self = this;
  mode = mode || 'med';

  if (this.loadedImages[mode] !== undefined) return;  // we're already loading

  var loaded = 0;
  var images = [];
  this.loadedImages[mode] = images;

  function renderIfLoaded() {
    loaded++;
    if (loaded === self.parts.length) self.renderSprite(mode);
  }

  for (var pi = 0; pi < this.parts.length; pi++) {
    var chosenPart = this.parts[pi];
    var img = new Image();

    images.push(img);
    var attr = mode + 'Path';
    if (mode === 'huge') attr = 'path';
    img.src = chosenPart[attr];
    img.addEventListener('load', renderIfLoaded);
  }
};
Idol.prototype.getSprite = function(mode) {
  if (typeof(mode) !== 'string') mode = undefined;
  this.deferRendering(mode);
  return 'placeholder.png';
};
Idol.prototype.getThumbSprite = function() { return this.getSprite('thumb'); };
Idol.prototype.getHugeSprite = function() { return this.getSprite('huge'); };
Idol.prototype.canFeed = function() { return this.agency.canFeed(); };
Idol.prototype.renderSprite = function(mode) {
  if (mode === undefined) mode = 'med';

  var images = this.loadedImages[mode];

  var offscreenCanvasElement = document.createElement('canvas');
  var offscreenCanvas = offscreenCanvasElement.getContext('2d');

  if (mode === 'med') {
    offscreenCanvas.canvas.width = 1000;
    offscreenCanvas.canvas.height = 1684;
  } else if (mode === 'thumb') {
    offscreenCanvas.canvas.width = 400;
    offscreenCanvas.canvas.height = 674;
  } else if (mode === 'huge') {
    offscreenCanvas.canvas.width = 1518;
    offscreenCanvas.canvas.height = 2556;
  }

  offscreenCanvas.clearRect(0, 0, offscreenCanvas.canvas.width, offscreenCanvas.canvas.height);

  for (var i = 0; i < images.length; i++) {
    offscreenCanvas.drawImage(images[i], 0, 0);
  }

  // masking, for a fade at the bottom
  offscreenCanvas.globalCompositeOperation = 'destination-in';
  var gradient = offscreenCanvas.createLinearGradient(0, 0, 0, offscreenCanvas.canvas.height);
  gradient.addColorStop(0.9, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  offscreenCanvas.fillStyle = gradient;
  offscreenCanvas.fillRect(0, 0, offscreenCanvas.canvas.width, offscreenCanvas.canvas.height);

  var subbableImages = document.querySelectorAll('.sprite img[data-sprite-' + mode + '-id="' + this.identifier + '"]');
  for (var si = 0; si < subbableImages.length; si++) {
    subbableImages[si].src = offscreenCanvasElement.toDataURL();
  }

  this.loadedImages[mode] = undefined;  // free up some memory?
};
Idol.prototype.spriteHTML = function(mode) {
  if (mode === undefined || typeof(mode) !== 'string') mode = 'med';
  var sprite;

  if (mode === 'med') {
    sprite = this.getSprite();
  } else if (mode === 'thumb') {
    sprite = this.getThumbSprite();
  } else if (mode === 'huge') {
    sprite = this.getHugeSprite();
  } else {
    throw 'what is ' + mode;
  }

  return spriteTemplate({
    mode: mode,
    identifier: this.identifier,
    sprite: sprite
  });
};
Idol.prototype.thumbSpriteHTML = function() { return this.spriteHTML('thumb'); };
Idol.prototype.hugeSpriteHTML = function() { return this.spriteHTML('huge'); };
Idol.prototype.isInUnit = function() {
  return agency.unit.indexOf(this) !== -1;
};
Idol.prototype.totalStats = function() {
  var total = 0;

  for (var i = 0; i < STATS.length; i++) {
    total += this[STATS[i]];
  }

  return total;
};
Idol.prototype.rarity = function() {
  return getRarity(this.totalStats());
};
Idol.prototype.toggleUnitMembership = function() {
  if (this.isInUnit()) {
    agency.unit.splice(agency.unit.indexOf(this), 1);
    if (this.catalogElement !== undefined) {
      this.catalogElement.classList.remove('active');
    }
  } else {
    agency.addToUnit(this, true);
  }

  agency.renderUnit();
  saveGame();
};
Idol.prototype.giveBonus = function(count) {
  if (count === undefined) count = 1;

  while (count > 0) {
    count--;
    this[choice(STATS, Math.random())]++;
  }

  deferRerender();
};
Idol.prototype.showDetail = function() {
  var self = this;

  document.body.classList.add('overlay');
  detailElement.innerHTML = idolDetailTemplate(this);
  detailElement.setAttribute('data-affinity', this.affinity);
  detailElement.classList.add('shown');
	detailElement.querySelector('.close').addEventListener('click', hideIdolDetail);

  function showFeedingUI(event) {
    event.stopPropagation();
    event.preventDefault();

    var catalogWithoutSelf = self.agency.sortedCatalog();
    catalogWithoutSelf.splice(catalogWithoutSelf.indexOf(self), 1);

    canteenElement.innerHTML = canteenTemplate({
      idol: self,
      catalog: catalogWithoutSelf
    });

    canteenElement.querySelector('.cancel').addEventListener('click', function(event) {
      event.stopPropagation();
      event.preventDefault();
      canteenElement.innerHTML = '';
    });

    function requestFeeding(event) {
      event.stopPropagation();
      event.preventDefault();

      var foodIdol = catalogWithoutSelf[parseInt(event.currentTarget.getAttribute('data-index'), 10)];
      var negativeStats = {};
      var summedStats = {};

      for (var i = 0; i < STATS.length; i++) {
        var stat = STATS[i];
        var increaseBy = foodIdol[stat];
        if (increaseBy < 0) {
          increaseBy /= NEGATIVE_STAT_EFFECT;
          negativeStats[stat] = true;
        }
        summedStats[stat] = self[stat] + Math.ceil(increaseBy);
      }

      canteenElement.innerHTML = canteenConfirmTemplate({
        idol: self,
        food: foodIdol,
        summedStats: summedStats,
        negativeStats: negativeStats
      });

      canteenElement.querySelector('.no').addEventListener('click', showFeedingUI);
      canteenElement.querySelector('.yes').addEventListener('click', function(event) {
        event.stopPropagation();
        event.preventDefault();
        for (var stat in summedStats) {
          self[stat] = summedStats[stat];
        }
        agency.removeIdol(foodIdol);
        canteenElement.innerHTML = '';
        self.showDetail();
        askUser('Training successful!');
        celebrate();
      });
    }

    var idolElements = canteenElement.querySelectorAll('.idol');
    for (var i = 0; i < idolElements.length; i++) {
      idolElements[i].addEventListener('click', requestFeeding);
    }
  }

  var feedElement = detailElement.querySelector('.feed');
  if (feedElement) feedElement.addEventListener('click', showFeedingUI);

  detailElement.querySelector('.graduate').addEventListener('click', function(event) {
    event.stopPropagation();
    event.preventDefault();
    askUser('Do you want ' + self.name + ' to graduate? She will leave your agency and every other idol will get a stat bonus by attending the graduation party.', [
      ['Graduate', function() {
        detailElement.classList.remove('shown');
        agency.removeIdol(self);
        var graduationBonus = choice(GRADUATION_BONUSES, Math.random());
        bonus = graduationBonus[0];
        template = graduationBonus[1];

        for (var i = 0; i < agency.catalog.length; i++) {
          agency.catalog[i].giveBonus(bonus);
        }

        askUser(
          template.replace('<idol>', self.name) +
          ' The other idols in your agency get ' + bonus.toString(10) + ' bonus stat point' + ((bonus === 1) ? '' : 's') + ' each.'
        );

        celebrate(bonus);
        rerender();
      }],
      ['Keep', function() {}]
    ]);
  });


  detailElement.querySelector('.membership .input').addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();

    self.toggleUnitMembership();
    if (self.isInUnit() ^ e.currentTarget.classList.contains('active')) e.currentTarget.classList.toggle('active');
    deferRerender();
  });
};
Idol.prototype.audition = function() {
  var self = this;
  var layerTimeout = 200;
  auditionSpace.innerHTML = auditionTemplate(this);
  
  var currentLayer = 0;

  function addLayerToAuditionPortrait() {
    var portraitElement = document.querySelector('#audition .portrait');
    if (!portraitElement) return;

    var part = self.parts[currentLayer];
    if (!part) return;

    var img = new Image();
    img.src = part.path;
    portraitElement.appendChild(img);
    currentLayer++;
    setTimeout(addLayerToAuditionPortrait, layerTimeout);
  }

  setTimeout(addLayerToAuditionPortrait, layerTimeout);

  document.getElementById('catch-button').addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();
    auditionSpace.innerHTML = '';
    self.showDetail();
  });
};
Idol.prototype.dump = function() {
  var idolDump = {
    i: this.seed,
    a: this.recruitedAt,
    s: [],
    b: []
  };
  for(var i = 0, n = STATS.length; i < n; i++) {
    idolDump.s.push(this[STATS[i]]);
  }
  return idolDump;
};

function hideIdolDetail(event) {
  event.stopPropagation();
  event.preventDefault();
  detailElement.classList.remove('shown');
  document.body.classList.remove('overlay');
}

function Agency() {
  this.catalog = [];
  this.unit = [];
  this.sortOrder = 'date';
  this.storyChapter = 0;
}
Agency.prototype.renderCatalog = function() {
  var sortedCatalog = this.sortedCatalog();

  sortOrders = [];

  for (var key in idolSortNames) {
    var item = [key, idolSortNames[key]];
    if (this.sortOrder === key) item.isSelectedOrder = true;
    sortOrders.push(item);
  }

  sortOrders.sort();

  catalogElement.innerHTML = catalogTemplate({
    'catalog': sortedCatalog,
    'hasStoryRemaining': CAMPAIGN[this.storyChapter] !== undefined,
    'canFeed': this.canFeed(),
    'sortOrder': this.sortOrder,
    'sortOrders': sortOrders
  });

  function setSortOrder(event) {
    event.stopPropagation();
    event.preventDefault();
    agency.sortOrder = event.currentTarget.getAttribute('data-sort-order');
    rerender();
  }

  document.getElementById('sort-button').addEventListener('click', function(event) {
    event.stopPropagation();
    event.preventDefault();
    document.getElementById('sort-orders').classList.toggle('visible');
  });

  for (var sortKey in idolSortNames) {
    element = document.querySelector('#sort-list a[data-sort-order="' + sortKey + '"]');
    if (element) element.addEventListener('click', setSortOrder);
  }

  var agency = this;

  inputs = document.querySelectorAll('#catalog li.idol .input');

  function toggleMembership(event) {
    event.stopPropagation();
    event.preventDefault();
    i = parseInt(event.currentTarget.getAttribute('data-index'), 10);
    sortedCatalog[i].toggleUnitMembership();
  }

  for (var i = 0, n = inputs.length; i < n; i++) {
    var element = inputs[i];
    element.addEventListener('click', toggleMembership);
  }

  var lis = document.querySelectorAll('#catalog li.idol');

  function showDetail(event) {
    event.stopPropagation();
    event.preventDefault();
    i = parseInt(event.currentTarget.getAttribute('data-index'), 10);
    sortedCatalog[i].showDetail();
  }

  for (var j = 0, m = lis.length; j < m; j++) {
    var li = lis[j];
    sortedCatalog[j].catalogElement = li;
    li.addEventListener('click', showDetail);
  }
};
Agency.prototype.sortedCatalog = function() {
  var sortedCatalog = [];
  for (var i = 0; i < this.catalog.length; i++) {
    sortedCatalog.push(this.catalog[i]);
  }
  sortedCatalog.sort(idolSorters[this.sortOrder]);
  return sortedCatalog;
};
Agency.prototype.renderUnit = function() {
  var self = this;
  content = unitTemplate(this);

  if ((this.unit.length === 0) ^ unitElement.classList.contains('empty')) {
    unitElement.classList.toggle('empty');
  }

  unitElement.innerHTML = content;
  unitElements = unitElement.querySelectorAll('.unit li');

  function handleUnitClick(e) {
    e.stopPropagation();
    e.preventDefault();
    self.unit[parseInt(e.currentTarget.getAttribute('data-index'), 10)].showDetail();
  }

  for (var ei = 0; ei < unitElements.length; ei++) {
    unitElements[ei].addEventListener('click', handleUnitClick);
  }
};
Agency.prototype.unitName = function() {
  var unitSeed = 0;

  for (var ii = 0; ii < this.unit.length; ii++) {
    unitSeed += this.unit[ii].seed;
  }
  
  var rng = seededRandom(unitSeed);
  return choice(choice(UNIT_NAMES[0], rng()), rng()) + ' ' + choice(choice(UNIT_NAMES[1], rng()), rng());
};
Agency.prototype.addIdol = function(idol, interactive) {
  if ((this.catalog.length === 0) && document.body.classList.contains('nothing-scanned')) {
    document.body.removeChild(document.getElementById('title'));
    document.body.classList.remove('nothing-scanned');
  }

  for(var i = 0, n = this.catalog.length; i < n; i++) {
    if (this.catalog[i].seed === idol.seed) {
      askUser("You recruited this idol already; it's " + idol.name + "!");
      return;
    }
  }
  this.catalog.push(idol);
  idol.agency = this;
  this.addToUnit(idol);
  deferRerender();

  if (interactive) {
    idol.audition();
  }
};
Agency.prototype.removeIdol = function(idol) {
  if (idol.isInUnit()) agency.unit.splice(agency.catalog.indexOf(idol), 1);
  agency.catalog.splice(agency.catalog.indexOf(idol), 1);
  deferRerender();
};
Agency.prototype.addToUnit = function(idol, interactive) {
  if (this.unit.length >= maxUnitSize) {
    if (interactive !== undefined) {
      askUser("Your unit is full; you'll need to remove someone before you can add " + idol.name + ".");
    }
  } else {
    this.unit.push(idol);
    if (idol.catalogElement !== undefined) idol.catalogElement.classList.add('active');
  }
};
Agency.prototype.canFeed = function() {
  return this.catalog.length >= 2;
};
Agency.prototype.doStory = function(pageNumber) {
  if (pageNumber === undefined) pageNumber = 0;
  var chapter = CAMPAIGN[this.storyChapter];
  var page = chapter[pageNumber];
  var self = this;
  var letterTimeout;

  function graduallyShowScript(visibleScriptElement, invisibleScriptElement) {
    function showNextLetter() {
      var nextLetter = invisibleScriptElement.textContent[0];
      visibleScriptElement.textContent += nextLetter;
      invisibleScriptElement.textContent = invisibleScriptElement.textContent.replace(/^./, '');

      if (invisibleScriptElement.textContent) {
        letterTimeout = setTimeout(showNextLetter, LETTER_DELAY * (LETTER_DELAYS[nextLetter] || 1));
      } else {
        letterTimeout = undefined;
      }
    }

    letterTimeout = setTimeout(showNextLetter, 50);

    var scriptElement = document.getElementById('script');
    function handleScriptClick(e) {
      e.stopPropagation();
      e.preventDefault();

      if (letterTimeout === undefined) {
        scriptElement.removeEventListener('click', handleScriptClick);
        self.doStory(pageNumber + 1);
      } else {
        clearTimeout(letterTimeout);
        letterTimeout = undefined;
        visibleScriptElement.textContent += invisibleScriptElement.textContent;
        invisibleScriptElement.textContent = '';
      }
    }
    scriptElement.addEventListener('click', handleScriptClick);
  }

  function renderSetting() {
    theatreElement.innerHTML = theatreTemplate({background: self.storySetting});
  }

  if (page === undefined) {
    theatreElement.innerHTML = '';
    this.storyChapter++;
    rerender();
  } else if (page.kind === 'setting') {
    this.storySetting = page.value;
    renderSetting();
    this.doStory(pageNumber + 1);
  } else if (page.kind === 'text') {
    if (!theatreElement.innerHTML) renderSetting();
    var invisibleScriptElement = document.getElementById('invisible-script');
    var visibleScriptElement = document.getElementById('visible-script');
    invisibleScriptElement.textContent = page.text;
    visibleScriptElement.textContent = '';
    graduallyShowScript(visibleScriptElement, invisibleScriptElement);
  } else if (page.kind === 'battle') {
    theatreElement.innerHTML = '';
    var playerIdols = [];

    for (var pi = 0; pi < self.unit.length; pi++) {
      playerIdols.push(new BattleIdol(self.unit[pi], 'player'));
    }

    var enemyIdols = [];

    for (var ei = maxUnitSize; ei > 0; ei--) {
      var enemyIdol = new Idol(Math.random());
      for (var si = 0; si < STATS.length; si++) {
        enemyIdol[STATS[si]] = enemyIdol[STATS[si]] + page.strength;
      }
      enemyIdols.push(new BattleIdol(enemyIdol, 'ai'));
    }

    var battle = new Battle(playerIdols, enemyIdols, function() {
      for (var pi = 0; pi < this.playerIdols.length; pi++) {
        this.playerIdols[pi].idol.giveBonus(enemyIdols.length);
      }

      self.doStory(pageNumber + 1);
    }, function() {
      theatreElement.innerHTML = '';
      askUser('You lost the battle. Train up your unit some more and try again!');
    });

    battle.loop();
  }
};
Agency.prototype.dump = function() {
  var agencyDump = {
    i: [],
    u: [],
    c: this.storyChapter,
    o: this.sortOrder
  };

  for(var i = 0, n = this.catalog.length; i < n; i++) {
    idol = this.catalog[i];
    agencyDump.i.push(idol.dump());
    agencyDump.u.push(Number(idol.isInUnit()));
  }

  return agencyDump;
};
Agency.prototype.load = function(agencyDump) {
  if (agencyDump.o !== undefined) this.sortOrder = agencyDump.o;
  this.storyChapter = agencyDump.c || 0;

  for(var i = 0, n = agencyDump.i.length; i < n; i++) {
    var idolDump = agencyDump.i[i];
    var idol = new Idol(idolDump.i);

    idol.recruitedAt = idolDump.a;

    for(var si = 0, sn = STATS.length; si < sn; si++) {
      idol[STATS[si]] = idolDump.s[si];
    }

    this.addIdol(idol);

    if (Boolean(agencyDump.u[i]) !== idol.isInUnit()) {
      idol.toggleUnitMembership();
    }
  }
};

function numFromString(str) {
  var total = 0;
  for(var i = 0, n = str.length; i < n; i++) {
      var c = str.charCodeAt(i);
      total += ((255 * Math.pow(2, i)) * c);
  }
  return total;
}

function addIdolFromImage(data) {
  barcodeImage.value = '';

  if ((!data) || (!data.codeResult)) {
    askUser(
      "Sorry, we couldn't read a barcode in that picture, please try a clearer photo.",
      [
        ['Try again', function() { barcodeImage.click(); }],
        ['Cancel', null]
      ]
    );
    return;
  }
  idol = new Idol(numFromString(data.codeResult.code));
  agency.addIdol(idol, true);
}

barcodeImage.addEventListener('change', function(e) {
  Quagga.decodeSingle({
    src: window.URL.createObjectURL(barcodeImage.files[0]),
    decoder: {
      readers: [
        'code_128_reader',
        'ean_reader',
        'ean_8_reader',
        'code_39_reader',
        'code_39_vin_reader',
        'codabar_reader',
        'upc_reader',
        'upc_e_reader',
        'i2of5_reader'
      ]
    },
    debug: true
  }, addIdolFromImage);
});

var agency = new Agency();

function rerender() {
  agency.renderCatalog();
  agency.renderUnit();

  document.getElementById('recruit').addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();
    barcodeImage.click();
  });

  var fightButton = document.getElementById('fight');
  if (fightButton) fightButton.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();
    if (agency.unit.length > 0) {
      var playerIdols = [];
      for (var pi = 0; pi < agency.unit.length; pi++) {
        playerIdols.push(new BattleIdol(agency.unit[pi], 'player'));
      }

      var enemyIdols = [];
      for (var ei = maxUnitSize; ei > 0; ei--) {
        enemyIdols.push(new BattleIdol(new Idol(Math.random()), 'ai'));
      }

      var battle = new Battle(playerIdols, enemyIdols, function() {
        askUser('You win! Your unit gets bonuses~', [['Yay!', null]]);
        for (var pi = 0; pi < this.playerIdols.length; pi++) {
          this.playerIdols[pi].idol.giveBonus(enemyIdols.length);
        }
        rerender();
      }, function() {
        askUser('You lose :<', [['Aww, beans…', null]]);
      });

      battle.loop();
    } else {
      askUser('You need an idol in your unit to fight.');
    }
    return false;
  });

  var storyButton = document.getElementById('progress-story');
  if (storyButton) storyButton.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();

    if (agency.unit.length > 0) {
      agency.doStory();
    } else {
      askUser('You need an idol in your unit to progress in the story.');
    }
  });

  var randomFightButton = document.getElementById('random-fight');
  if (randomFightButton) randomFightButton.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();

    var playerIdols = [];
    var enemyIdols = [];
    for (var i = maxUnitSize; i > 0; i--) {
      enemyIdols.push(new BattleIdol(new Idol(Math.random()), 'ai'));
      playerIdols.push(new BattleIdol(new Idol(Math.random()), 'player'));
    }

    var battle = new Battle(playerIdols, enemyIdols, function() {
      askUser('You win!', [['Yay!', null]]);
    }, function() {
      askUser('You lose :<', [['Aww, beans…', null]]);
    });

    battle.loop();
  });

  saveGame();
}

function saveGame() {
  var fullStateString = JSON.stringify(agency.dump());
  var stateString = btoa(fullStateString);
  var currentIndex = 0;

  while (stateString) {
    var slice = stateString.slice(0, cookieSliceSize);
    stateString = stateString.slice(cookieSliceSize);
    document.cookie = 'state_' + currentIndex.toString(10) + '=' + slice + cookieSuffix;
    currentIndex++;
  }

  document.cookie = 'state_' + currentIndex.toString(10) + '=' + endString + cookieSuffix;

  clearTimeout(checkSaveTimeout);
  checkSaveTimeout = setTimeout(function() {
    if (fullStateString !== getStateCookie()) {
      console.log(fullStateString);
      console.log(getStateCookie());
      askUser('saving failed! this is a bug, so im not sure what to recommend');
    }
  }, 50);
}

function deferRerender() {
  clearTimeout(rerenderTimeout);
  rerenderTimeout = setTimeout(rerender, 50);
}

function initGame() {
  FastClick.attach(document.body);
  document.getElementById('loading').innerText = '';

  try {
    var savedStateString = getStateCookie();
    if (!!savedStateString) {
      var agencyDump = JSON.parse(savedStateString);
      agency.load(agencyDump);
    }
  } catch (e) {
    console.log(e);
    askUser('Your save game failed to load, sorry :<');
  }

  rerender();
}

if (window.location.hash === '#icon') {
  var iconIdol = new Idol(Math.random());
  document.body.innerHTML = '<div class="icon-container affinity-' + iconIdol.affinity + '"><div class="portrait">' + iconIdol.hugeSpriteHTML() + '</div></div>';
  document.body.classList.add('icon');
} else {
  document.addEventListener('DOMContentLoaded', function() {
    initGame();
    // document.getElementById('fight').click();
    // document.getElementById('progress-story').click();
    // agency.addIdol(new Idol(Math.random()), true);
  });
}
