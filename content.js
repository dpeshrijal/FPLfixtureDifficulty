let bootstrapData, fixturesData, teamMapData, teamNameToId;
let observer;
let debounceTimer = null;
const DEBOUNCE_DELAY = 10; // ms

if (["/my-team", "/transfers"].includes(location.pathname)) {
  initializeFPLFixtures();
}
monitorRouteChange();

// --- FORCE REINJECTION ON FOCUS/VISIBILITY ---
window.addEventListener("focus", tryForceReinject, true);
document.addEventListener("visibilitychange", tryForceReinject, true);

function tryForceReinject() {
  if (["/my-team", "/transfers"].includes(location.pathname)) {
    setTimeout(waitForElementsAndInject, 300);
  }
}

function monitorRouteChange() {
  let lastPath = location.pathname + location.search;
  setInterval(() => {
    const currentPath = location.pathname + location.search;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      if (["/my-team", "/transfers"].includes(location.pathname)) {
        initializeFPLFixtures();
        setTimeout(waitForElementsAndInject, 700);
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
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      observer.disconnect();
      waitForElementsAndInject();
      observer.observe(document.body, { childList: true, subtree: true });
    }, DEBOUNCE_DELAY);
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
    teamMap[team.id] = { name: team.name, short_name: team.short_name };
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

// --- DRY FIXTURE INJECTION (margin-corrected) ---

function injectFixtureBox(parentElement, teamId, marginTop = "4px") {
  if (!parentElement || !teamId) return;
  parentElement.querySelectorAll(".fixtureBox").forEach((box) => box.remove());
  const fixtureBoxEl = createFixtureBox(teamId, fixturesData, teamMapData);
  fixtureBoxEl.className = "fixtureBox";
  fixtureBoxEl.style.marginTop = marginTop;
  parentElement.appendChild(fixtureBoxEl);
}

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

function waitForElementsAndInject(retries = 10, interval = 1000) {
  injectListAndSideView(retries, interval);
  injectPitchView();
}

function injectListAndSideView(retries = 10, interval = 1000) {
  // Main table view
  const rows = document.querySelectorAll("table tbody tr");
  if (rows.length === 0 && retries > 0) {
    setTimeout(() => injectListAndSideView(retries - 1, interval), interval);
    return;
  }
  rows.forEach((row) => {
    const nameSpan = findPlayerNameSpan(row);
    const teamImg = row.querySelector("img[alt]");
    if (!nameSpan || !teamImg) return;
    const playerName = nameSpan.textContent.trim();
    const teamName = teamImg.alt.trim();
    const teamId = teamNameToId?.[teamName?.toLowerCase()];
    const playerData = findPlayerData(
      playerName,
      teamId,
      bootstrapData.elements
    );
    if (!playerData) return;

    addOwnershipBadge(row, playerData);

    injectFixtureBox(nameSpan.parentElement, teamId, "4px");
  });

  // Side-table (transfers)
  const sideTableRows = document.querySelectorAll(
    ".ElementDialog table tbody tr"
  );
  if (sideTableRows.length === 0 && retries > 0) {
    setTimeout(() => injectListAndSideView(retries - 1, interval), interval);
    return;
  }
  sideTableRows.forEach((row) => {
    const nameSpan = findPlayerNameSpan(row);
    const teamImg = row.querySelector("img[alt]");
    if (!nameSpan || !teamImg) return;
    const playerName = nameSpan.textContent.trim();
    const teamName = teamImg.alt.trim();
    const teamId = teamNameToId?.[teamName?.toLowerCase()];
    const playerData = findPlayerData(
      playerName,
      teamId,
      bootstrapData.elements
    );
    if (!playerData) return;

    addOwnershipBadge(row, playerData);

    injectFixtureBox(nameSpan.parentElement, teamId, "4px");
  });
}

function injectPitchView() {
  const isTransfers = location.pathname === "/transfers";
  const playerButtons = document.querySelectorAll(
    'button[data-pitch-element="true"]'
  );
  playerButtons.forEach((el) => {
    const playerName = el.getAttribute("aria-label");
    const teamImg = el.querySelector("img[alt]");
    if (!playerName || !teamImg) return;
    const teamName = teamImg.alt.trim();
    const teamId = teamNameToId?.[teamName?.toLowerCase()];
    const playerData = findPlayerData(
      playerName,
      teamId,
      bootstrapData.elements
    );
    if (!playerData) return;
    el.style.paddingBottom = "6px";

    el.querySelectorAll(".fpl-ownership-badge").forEach((badge) =>
      badge.remove()
    );
    const ownership = playerData.selected_by_percent;
    const badge = document.createElement("div");
    badge.className = "fpl-ownership-badge";
    badge.textContent = `${ownership}%`;
    badge.style.position = "absolute";
    if (isTransfers) {
      badge.style.top = "2px";
      badge.style.right = "2px";
      badge.style.background = "rgba(255,255,255,0.85)";
      badge.style.color = "#333";
      badge.style.fontWeight = "bold";
      badge.style.fontSize = "8px";
      badge.style.fontWeight = "bold";
      badge.style.padding = "0 3px";
      badge.style.borderRadius = "3px";
      badge.style.zIndex = "5";
      badge.style.boxShadow = "0 1px 3px rgba(0,0,0,0.10)";
      badge.style.pointerEvents = "none";
    } else {
      badge.style.top = "4px";
      badge.style.right = "3px";
      badge.style.background = "rgba(255,255,255,0.85)";
      badge.style.color = "#333";
      badge.style.fontWeight = "bold";
      badge.style.fontSize = "9px";
      badge.style.fontWeight = "bold";
      badge.style.padding = "0 3px";
      badge.style.borderRadius = "4px";
      badge.style.zIndex = "5";
      badge.style.boxShadow = "0 1px 3px rgba(0,0,0,0.10)";
      badge.style.pointerEvents = "none";
    }

    el.style.position = "relative";

    const nameSpan = isTransfers
      ? el.querySelector("div > div > span")
      : el.querySelector("span");
    if (nameSpan && nameSpan.parentElement) {
      injectFixtureBox(nameSpan.parentElement, teamId, "0px");
    }
    el.appendChild(badge);
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
  container.style.height = "22px";

  upcomingFixtures.forEach((fixture) => {
    const isHome = fixture.team_h === Number(teamId);
    const opponentId = isHome ? fixture.team_a : fixture.team_h;
    const difficulty = isHome
      ? fixture.team_h_difficulty
      : fixture.team_a_difficulty;
    const opponentShort = teamMap[opponentId]?.short_name || "???";

    const box = document.createElement("div");
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.width = "22px";
    box.style.height = "22px";
    box.style.backgroundColor = getDifficultyBackground(difficulty);
    box.style.color = "#000";
    box.style.fontWeight = "bold";
    box.style.fontSize = "8px";
    box.style.letterSpacing = "0px";
    box.style.fontFamily = "Arial, sans-serif";
    box.style.borderRadius = "2px";
    box.title = `${opponentShort} (${
      isHome ? "H" : "A"
    }, difficulty ${difficulty})`;

    // Opponent
    const opponentDiv = document.createElement("div");
    opponentDiv.textContent = opponentShort;
    opponentDiv.style.lineHeight = "1";
    opponentDiv.style.marginTop = "1px";
    opponentDiv.style.fontSize = "8.5px";
    opponentDiv.style.fontWeight = "bold";
    opponentDiv.style.marginBottom = "1px";

    // Home/Away
    const haDiv = document.createElement("div");
    haDiv.textContent = isHome ? "(H)" : "(A)";
    haDiv.style.fontSize = "7px";
    haDiv.style.fontWeight = "bold";
    haDiv.style.lineHeight = "1";
    haDiv.style.marginBottom = "0";

    box.appendChild(opponentDiv);
    box.appendChild(haDiv);

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

function findPlayerNameSpan(row) {
  const spans = row.querySelectorAll("td span");
  return Array.from(spans).find((span) => {
    const text = span.textContent.trim();
    return (
      text &&
      text.length > 2 &&
      !span.querySelector("img") &&
      !span.className.includes("icon") &&
      !span.className.includes("badge")
    );
  });
}

function addOwnershipBadge(row, playerData) {
  row
    .querySelectorAll(".fpl-ownership-badge")
    .forEach((badge) => badge.remove());

  const ownership = playerData.selected_by_percent;
  const badge = document.createElement("div");
  badge.className = "fpl-ownership-badge";
  badge.textContent = `${ownership}%`;
  badge.style.display = "inline-block";
  badge.style.marginLeft = "6px";
  badge.style.background = "rgba(255,255,255,0.85)";
  badge.style.color = "#333";
  badge.style.fontWeight = "bold";
  badge.style.fontSize = "9px";
  badge.style.padding = "0 3px";
  badge.style.borderRadius = "4px";
  badge.style.boxShadow = "0 1px 3px rgba(0,0,0,0.10)";
  badge.style.pointerEvents = "none";
  badge.style.verticalAlign = "baseline";
  badge.style.transform = "translateY(-2.6px)";

  // Find the name span and insert the badge after it
  const nameSpan = findPlayerNameSpan(row);
  if (nameSpan) {
    nameSpan.appendChild(badge);
  }
}
