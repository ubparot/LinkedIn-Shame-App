const { app, Notification, Tray, Menu, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const activeWin = require('active-win'); 

const APP_NAME = "LinkedIn Recruiter";
const APP_ID   = "com.yourname.lnrecruiter"; 

const IDLE_THRESHOLD_SECONDS = 30; 

const NOTIFY_MIN_INTERVAL = 3000;   
const NOTIFY_MAX_INTERVAL = 6000;   

const POLL_ACTIVEWIN_MS = 2000; 

const BLACKLIST_PROCESSES = [

  "valorant-win64-shipping.exe", "valorant.exe",
  "fortniteclient-win64-shipping.exe", "fortnite.exe",
  "cs2.exe", "steam.exe", "epicgameslauncher.exe", "leagueclientux.exe", "league of legends.exe",
  "overwatch.exe", "rocketleague.exe", "eldenring.exe", "minecraft.exe",
  "battle.net.exe", "riotclientservices.exe",

  "discord.exe", "tiktok.exe", "instagram.exe"
];

const BLACKLIST_TITLE_REGEX = [
  /instagram/i,
  /tiktok/i,
  /\breels\b/i,
  /\bfor you\b/i,
  /\btwitch\b/i,

  /\bnetflix|hulu|prime video|disney\+\b/i
];

function loadProfilesFrom(folder, genderLabel) {
  const fullPath = path.join(__dirname, folder);
  if (!fs.existsSync(fullPath)) return [];

  const files = fs.readdirSync(fullPath).filter(f => /\.(png|jpe?g)$/i.test(f));

  return files.map(file => {

    const cleanName = file
      .replace(/\.[^/.]+$/, '')       
      .replace(/[_-]/g, ' ')          
      .replace(/\s+/g, ' ')           
      .trim();

    return {
      name: `${cleanName} • Recruiter`,
      gender: genderLabel.toLowerCase(),
      icon: path.join(fullPath, file)
    };
  });
}

const maleProfiles   = loadProfilesFrom('male',   'Male');
const femaleProfiles = loadProfilesFrom('female', 'Female');
const allProfiles    = [...maleProfiles, ...femaleProfiles];

if (allProfiles.length === 0) {
  allProfiles.push({
    name: 'Generic Recruiter',
    gender: 'neutral',
    icon: path.join(__dirname, 'tray_icon.png')
  });
}

function getRandomRecruiter() {
  const genderChoice =
    maleProfiles.length && femaleProfiles.length
      ? (Math.random() < 0.5 ? 'male' : 'female')
      : maleProfiles.length
        ? 'male'
        : femaleProfiles.length
          ? 'female'
          : 'neutral';

  const pool =
    genderChoice === 'male'
      ? maleProfiles
      : genderChoice === 'female'
        ? femaleProfiles
        : allProfiles;

  return pool[Math.floor(Math.random() * pool.length)];
}

const RECRUITER_MESSAGES = [
  "Recruiter: We noticed a resume gap. Is your job doomscrolling?",
  "Recruiter: Unfortunately we have much more qualified applicants applying for this position?",
  "Recruiter: I'm building a team of people who actually lock in.",
  "Recruiter: Why aren't you online?",
  "Recruiter: Looks like you specialize in being UNPRODUCTIVE, that's a very niche skill.",
  "Recruiter: Get a job but not from me.",
  "Recruiter: Hey I just endorsed you for being a D1 procrastinator.",
  "Recruiter: Someone viewed your profile. It was me and I'm not impressed.",
  "Recruiter: You should really work on your resume.",
  "Recruiter: So McDonalds huh?",
  "Recruiter: Your pull history looks like a loading screen.",
  "Recruiter: We filled the position with someone who actually showed up.",
  "Recruiter: You said you were self motivated then disappeared for 2 hours.",
  "Recruiter: Still open to opportunities? Maybe start with opening vscode.",
  "Recruiter: I checked your activity log and I wish I hadnt.",
  "Recruiter: You’ve been idle longer than our job posting.",
  "Recruiter: I was gonna connect but you look busy not working.",
  "Recruiter: We were impressed until we saw your screen time.",
  "Recruiter: u suck",
  "Recruiter: Noticing a pattern of you doing nothing lately.",
  "Recruiter: We like initiative but you seem allergic to it.",
  "Recruiter: You’d be great for a role in staying offline.",
  "Recruiter: Is this your gap year or your gap life?",
  "Recruiter: Someone else already took the job you didn’t apply for.",
  "Recruiter: Id offer you a role but HR said no again.",
  "Recruiter: Your career graph looks like a flatline.",
  "Recruiter: Maybe list breathing as a skill atp.",
  "Recruiter: lock in bro.",
  "Recruiter: Just checking if your chair is still warm."
];

let tray = null;
let spamTimer = null;
let spamming = false;
let activePollTimer = null;
let lastUnproductiveReason = ""; 

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function choose(arr) { return arr[randInt(0, arr.length - 1)]; }

if (process.platform === 'win32') {
  try { app.setAppUserModelId(APP_ID); } catch (_) {}
}

function isBlacklistedActive(winInfo) {
  if (!winInfo) return false;

  const proc = (winInfo.owner && winInfo.owner.name ? winInfo.owner.name : "").toLowerCase();
  const title = (winInfo.title || "");

  for (const p of BLACKLIST_PROCESSES) {
    if (proc.includes(p)) return true;
  }
  for (const re of BLACKLIST_TITLE_REGEX) {
    if (re.test(title)) return true;
  }
  return false;
}

function showRecruiterNotification() {
  const profile = getRandomRecruiter();
  const msg = choose(RECRUITER_MESSAGES);

  const notif = new Notification({
    title: "LinkedIn",
    subtitle: profile.name,                      
    body: `Recruiter: ${msg}`,
    icon: profile.icon,
    silent: false,
    tag: String(Date.now()) + "-" + Math.floor(Math.random() * 1000) 
  });

  notif.show();
}

function startSpam() {
  if (spamming) return;
  spamming = true;

  const loop = () => {
    showRecruiterNotification();
    const next = randInt(NOTIFY_MIN_INTERVAL, NOTIFY_MAX_INTERVAL);
    spamTimer = setTimeout(loop, next);
  };
  loop();
}

function stopSpam() {
  if (!spamming) return;
  spamming = false;
  if (spamTimer) { clearTimeout(spamTimer); spamTimer = null; }
}

async function evaluateTriggersOnce() {
  const idleSecs = powerMonitor.getSystemIdleTime();
  const idleBad = idleSecs >= IDLE_THRESHOLD_SECONDS;

  let blacklisted = false;
  try {
    const win = await activeWin();
    blacklisted = isBlacklistedActive(win);
  } catch (e) {

  }

  if (idleBad || blacklisted) {
    lastUnproductiveReason = idleBad ? "idle" : "blacklist";
    startSpam();
  } else {
    stopSpam();
  }
}

function startEvaluators() {
  activePollTimer = setInterval(() => { evaluateTriggersOnce(); }, POLL_ACTIVEWIN_MS);
}

function buildTray() {
  tray = new Tray(path.join(__dirname, 'tray_icon.png')); 
  const menu = Menu.buildFromTemplate([
    { label: APP_NAME, enabled: false },
    { type: 'separator' },
    { label: 'Pause', click: () => stopSpam() },
    { label: 'Resume', click: () => startSpam() },
    {
      label: 'Why am I being pinged?',
      click: () => {
        const reason = lastUnproductiveReason || "none";
        new Notification({
          title: "LinkedIn",
          subtitle: "Recruiter",
          body: `Recruiter: Trigger = ${reason === "idle" ? "Desktop idle" : reason === "blacklist" ? "Blacklisted app/tab" : "None"}`,
          icon: path.join(__dirname, 'tray_icon.png')
        }).show();
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { stopSpam(); clearInterval(activePollTimer); app.quit(); } }
  ]);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

  buildTray();

  new Notification({
    title: "LinkedIn",
    subtitle: "Recruiter",
    body: "Recruiter: I’ll ping you when you're idle or in blacklisted apps.",
    icon: path.join(__dirname, 'tray_icon.png')
  }).show();

  startEvaluators();
});

app.on('window-all-closed', (e) => e.preventDefault());