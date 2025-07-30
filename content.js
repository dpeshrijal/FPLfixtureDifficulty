let bootstrapData, fixturesData, teamMapData, teamNameToId;
let observer; // Global observer for freeze-proof mutation handling

if (["/my-team", "/transfers"].includes(location.pathname)) {
  initializeFPLFixtures();
}
monitorRouteChange();

function monitorRouteChange() {
  let lastPath = location.pathname + location.search;
  setInterval(() => {
    const currentPath = location.pathname + location.search;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      if (["/my-team", "/transfers"].includes(location.pathname)) {
        initializeFPLFixtures();
      }
    }
  }, 1000);
}

async function initializeFPLFixtures() {
  const { teamMap, fixtures, bootstrap } = await fetchFPLData();
  teamMapData = teamMap;
  fixturesData = fixtures;
  bootstrapData = bootstrap;
  teamNameToId = buildTeamNameToIdMap(teamMap);

  waitForElementsAndInject();

  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    observer.disconnect(); // Prevent infinite loops
    waitForElementsAndInject();
    observer.observe(document.body, { childList: true, subtree: true });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function fetchFPLData() {
  const cacheKey = "fpl_api_cache";
  const cacheExpiry = 1000 * 60 * 60;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp < cacheExpiry) {
      return parsed.data;
    }
  }

  const [bootstrapRes, fixturesRes] = await Promise.all([
    fetch("https://fantasy.premierleague.com/api/bootstrap-static/"),
    fetch("https://fantasy.premierleague.com/api/fixtures/"),
  ]);

  const bootstrap = await bootstrapRes.json();
  const fixtures = await fixturesRes.json();

  const teamMap = {};
  bootstrap.teams.forEach((team) => {
    teamMap[team.id] = {
      name: team.name,
      short_name: team.short_name,
    };
  });

  const data = { teamMap, fixtures, bootstrap };
  localStorage.setItem(
    cacheKey,
    JSON.stringify({ timestamp: Date.now(), data })
  );

  return data;
}

function buildTeamNameToIdMap(teamMap) {
  const map = {};
  Object.entries(teamMap).forEach(([id, team]) => {
    map[team.name.toLowerCase()] = id;
    map[team.short_name.toLowerCase()] = id;
  });
  return map;
}

// Main injection trigger
function waitForElementsAndInject(retries = 10, interval = 1000) {
  const pitchPlayers = document.querySelectorAll(
    'button[data-pitch-element="true"]'
  );
  const tableRows = document.querySelectorAll("table tbody tr");

  waitForListViewAndInject(retries, interval);
  waitForTransfersSideTableInjection(retries, interval);

  if (pitchPlayers.length === 0) {
    if (retries > 0) {
      setTimeout(
        () => waitForElementsAndInject(retries - 1, interval),
        interval
      );
    }
    return;
  }

  injectFixtures(pitchPlayers);
}

// --- PLAYER DATA LOOKUP ---

function findPlayerData(playerName, teamId, elements) {
  if (!playerName || !teamId) return null;
  playerName = playerName.toLowerCase();
  return elements.find(
    (p) =>
      (p.web_name.toLowerCase() === playerName ||
        (p.first_name + " " + p.second_name).toLowerCase() === playerName) &&
      p.team == teamId
  );
}

// --- LIST VIEW (table) ---

function waitForListViewAndInject(retries = 10, interval = 1000) {
  const rows = document.querySelectorAll("table tbody tr");
  if (rows.length === 0) {
    if (retries > 0) {
      setTimeout(
        () => waitForListViewAndInject(retries - 1, interval),
        interval
      );
    }
    return;
  }

  rows.forEach((row) => {
    // Player name
    const nameSpan = row.querySelector("td span._5bm4v44");
    if (!nameSpan) return;
    const playerName = nameSpan.textContent.trim();

    // Team name (from shirt image alt)
    const teamImg = row.querySelector("img[alt]");
    const teamName = teamImg?.alt?.trim();
    const teamId = teamNameToId?.[teamName?.toLowerCase()];

    const playerData = findPlayerData(
      playerName,
      teamId,
      bootstrapData.elements
    );
    if (!playerData) return;

    // Remove previous fixture box if exists
    const existingFixtureBox =
      nameSpan.parentElement.querySelector(".fixtureBox");
    if (existingFixtureBox) existingFixtureBox.remove();

    const fixtureBoxEl = createFixtureBox(teamId, fixturesData, teamMapData);
    fixtureBoxEl.className = "fixtureBox";
    fixtureBoxEl.style.marginTop = "4px";

    nameSpan.parentElement.appendChild(fixtureBoxEl);
  });
}

// --- TRANSFERS SIDE TABLE ---

function waitForTransfersSideTableInjection(retries = 10, interval = 1000) {
  const sideTableRows = document.querySelectorAll(
    ".ElementDialog table tbody tr"
  );
  if (sideTableRows.length === 0) {
    if (retries > 0) {
      setTimeout(
        () => waitForTransfersSideTableInjection(retries - 1, interval),
        interval
      );
    }
    return;
  }

  sideTableRows.forEach((row) => {
    // Player name
    const nameSpan = row.querySelector("td span._5bm4v44");
    if (!nameSpan) return;
    const playerName = nameSpan.textContent.trim();

    // Team name (from shirt image alt)
    const teamImg = row.querySelector("img[alt]");
    const teamName = teamImg?.alt?.trim();
    const teamId = teamNameToId?.[teamName?.toLowerCase()];

    const playerData = findPlayerData(
      playerName,
      teamId,
      bootstrapData.elements
    );
    if (!playerData) return;

    // Remove previous fixture box if exists
    const existingFixtureBox =
      nameSpan.parentElement.querySelector(".fixtureBox");
    if (existingFixtureBox) existingFixtureBox.remove();

    const fixtureBoxEl = createFixtureBox(teamId, fixturesData, teamMapData);
    fixtureBoxEl.className = "fixtureBox";
    fixtureBoxEl.style.marginTop = "4px";

    nameSpan.parentElement.appendChild(fixtureBoxEl);
  });
}

// --- PITCH VIEW ---

function injectFixtures(playerButtons) {
  const isTransfers = location.pathname === "/transfers";

  playerButtons.forEach((el) => {
    const playerName = el.getAttribute("aria-label");
    if (!playerName) return;

    // Try to find the team name from the shirt image (relative to button structure)
    const teamImg = el.querySelector("img[alt]");
    const teamName = teamImg?.alt?.trim();
    const teamId = teamNameToId?.[teamName?.toLowerCase()];

    const playerData = findPlayerData(
      playerName,
      teamId,
      bootstrapData.elements
    );
    if (!playerData) return;

    const fixtureBoxEl = createFixtureBox(teamId, fixturesData, teamMapData);
    fixtureBoxEl.className = "fixtureBox";

    el.style.paddingBottom = "6px";

    const nameSpan = isTransfers
      ? el.querySelector("div > div > span")
      : el.querySelector("span");

    if (nameSpan && nameSpan.parentElement) {
      // Remove old fixture box if present
      const oldBox = nameSpan.parentElement.querySelector(".fixtureBox");
      if (oldBox) oldBox.remove();

      nameSpan.parentElement.appendChild(fixtureBoxEl);
    }
  });
}

// --- FIXTURE BOX ---

function createFixtureBox(teamId, fixtures, teamMap) {
  const upcomingFixtures = fixtures
    .filter(
      (f) =>
        !f.finished &&
        (f.team_h === Number(teamId) || f.team_a === Number(teamId))
    )
    .sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time))
    .slice(0, 5);

  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.gap = "1px";
  container.style.margin = "0";
  container.style.padding = "0";
  container.style.height = "16px";

  upcomingFixtures.forEach((fixture) => {
    const isHome = fixture.team_h === Number(teamId);
    const opponentId = isHome ? fixture.team_a : fixture.team_h;
    const difficulty = isHome
      ? fixture.team_h_difficulty
      : fixture.team_a_difficulty;
    const opponentShort = teamMap[opponentId]?.short_name || "???";

    const box = document.createElement("div");
    box.textContent = opponentShort;
    box.style.backgroundColor = getDifficultyBackground(difficulty);
    box.style.color = "#000";
    box.style.fontWeight = "bold";
    box.style.fontSize = "8.5px";
    box.style.letterSpacing = "0px";
    box.style.paddingTop = "1px";
    box.style.width = "22px";
    box.style.height = "16px";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.textAlign = "center";
    box.style.lineHeight = "1";
    box.style.fontFamily = "Arial, sans-serif";
    box.style.borderRadius = "2px";
    box.title = `${opponentShort} (difficulty ${difficulty})`;

    container.appendChild(box);
  });

  return container;
}

function getDifficultyBackground(difficulty) {
  switch (difficulty) {
    case 1:
      return "#00FF88";
    case 2:
      return "#00cc66";
    case 3:
      return "#cccccc";
    case 4:
      return "#ff3366";
    case 5:
      return "#8B0000";
    default:
      return "#999999";
  }
}
