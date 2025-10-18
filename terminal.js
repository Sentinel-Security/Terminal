/* XS Web Terminal — Guarda todo en JSON por usuario y clona repos de GitHub
   Funciona en GitHub Pages. 2025.
*/

const input = document.getElementById('input');
const output = document.getElementById('output');
const promptEl = document.getElementById('prompt');
const ghTokenInput = document.getElementById('gh-token');
const saveGistBtn = document.getElementById('save-gist');
const loadGistBtn = document.getElementById('load-gist');
const exportBtn = document.getElementById('export-json');
const importBtn = document.getElementById('import-json');

const STORAGE_KEY = 'xs_terminal_data_v1';
let userData = null; // será la estructura JSON por usuario

// Estructura inicial del JSON (filesystem + metadata)
function defaultData() {
  return {
    meta: {
      createdAt: new Date().toISOString(),
      name: 'xs-user'
    },
    fs: {
      '/': {
        type: 'dir',
        entries: {
          'home': { type: 'dir', entries: { 'xs': { type: 'dir', entries: {} } } },
        }
      }
    },
    cwd: '/home/xs',
    repos: {} // repos clonados: { "owner/repo": { files: {...}, clonedAt: ... } }
  };
}

// UTIL: append to terminal
function appendLine(text, cls) {
  const d = document.createElement('div');
  d.className = 'output-line' + (cls ? ' ' + cls : '');
  d.textContent = text;
  output.appendChild(d);
  output.scrollTop = output.scrollHeight;
}

// Persistencia local (localStorage)
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      userData = JSON.parse(raw);
      appendLine('[info] Datos cargados desde localStorage.', 'output-info');
      return;
    }
  } catch(e) { console.error(e); }
  userData = defaultData();
  saveLocal();
  appendLine('[info] Datos inicializados.', 'output-info');
}

function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
  } catch(e) {
    appendLine('[err] Error guardando en localStorage: ' + e.message, 'output-err');
  }
}

// Export / Import JSON (descarga / subir)
exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(userData, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'terminal_data.json';
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', async () => {
  const inputFile = document.createElement('input');
  inputFile.type = 'file';
  inputFile.accept = 'application/json';
  inputFile.onchange = async e => {
    const f = e.target.files[0];
    const text = await f.text();
    try {
      const parsed = JSON.parse(text);
      userData = parsed;
      saveLocal();
      appendLine('[info] JSON importado correctamente.', 'output-info');
    } catch(err) {
      appendLine('[err] JSON inválido: ' + err.message, 'output-err');
    }
  };
  inputFile.click();
});

// GIST: crear/actualizar y cargar
// Nota: esto requiere token personal con permisos de gist (no obligatorio).
async function createOrUpdateGist(token) {
  if(!token) { appendLine('[err] Token vacío.', 'output-err'); return; }
  appendLine('[info] Creando/updating Gist... esto usa tu token localmente en el navegador.', 'output-info');
  // buscamos si ya hay un gist guardado (buscamos por descripción con "xs-web-terminal")
  try {
    const gists = await fetch('https://api.github.com/gists', {
      headers: { Authorization: 'token ' + token }
    }).then(r => r.json());
    let found = gists.find(g => g.description && g.description.includes('xs-web-terminal-guest-data'));
    const body = {
      description: 'xs-web-terminal-guest-data - terminal_data.json',
      public: false,
      files: {
        'terminal_data.json': {
          content: JSON.stringify(userData, null, 2)
        }
      }
    };
    let res;
    if(found) {
      // update
      res = await fetch('https://api.github.com/gists/' + found.id, {
        method: 'PATCH',
        headers: {
          Authorization: 'token ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          Authorization: 'token ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    }
    const json = await res.json();
    if(json.id) {
      appendLine('[ok] Gist guardado. ID: ' + json.id, 'output-success');
      // guardamos el id en localStorage para futuras cargas
      localStorage.setItem('xs_gist_id', json.id);
    } else {
      appendLine('[err] Error al guardar Gist: ' + JSON.stringify(json), 'output-err');
    }
  } catch(e) {
    appendLine('[err] Fallo al crear gist: ' + e.message, 'output-err');
  }
}

async function loadGist(token) {
  appendLine('[info] Intentando cargar Gist...', 'output-info');
  try {
    const savedId = localStorage.getItem('xs_gist_id');
    let gistId = savedId;
    if(!gistId) {
      // si no conocemos ID, intentamos buscar uno en la cuenta del token
      const gists = await fetch('https://api.github.com/gists', {
        headers: { Authorization: 'token ' + token }
      }).then(r => r.json());
      const found = gists.find(g => g.description && g.description.includes('xs-web-terminal-guest-data'));
      gistId = found ? found.id : null;
    }
    if(!gistId) { appendLine('[err] No se encontró Gist en tu cuenta.', 'output-err'); return; }
    const res = await fetch('https://api.github.com/gists/' + gistId, {
      headers: { Authorization: 'token ' + token }
    }).then(r => r.json());
    if(res.files && res.files['terminal_data.json']) {
      userData = JSON.parse(res.files['terminal_data.json'].content);
      saveLocal();
      appendLine('[ok] Datos cargados desde Gist.', 'output-success');
    } else {
      appendLine('[err] El gist no contiene terminal_data.json', 'output-err');
    }
  } catch(e) {
    appendLine('[err] Error cargando gist: ' + e.message, 'output-err');
  }
}

saveGistBtn.addEventListener('click', () => {
  const token = ghTokenInput.value.trim();
  if(!token) { appendLine('[err] Pega tu token si quieres guardar en Gist (opcional).', 'output-err'); return; }
  createOrUpdateGist(token);
});
loadGistBtn.addEventListener('click', () => {
  const token = ghTokenInput.value.trim();
  if(!token) { appendLine('[err] Pega tu token si quieres cargar Gist (opcional).', 'output-err'); return; }
  loadGist(token);
});

// UTIL: normalize path simple (solo cables para este simulador)
function joinPath(base, p) {
  if(p.startsWith('/')) return p;
  if(base.endsWith('/')) return base + p;
  return base + '/' + p;
}

// FS helpers muy simples (solo directorios y archivos en memoria)
function fsGetNode(path) {
  // split path into parts
  const parts = path.split('/').filter(Boolean);
  let node = userData.fs['/'];
  if(parts.length === 0) return node;
  for(const part of parts) {
    if(node.type !== 'dir' || !node.entries[part]) return null;
    node = node.entries[part];
  }
  return node;
}

function fsAddFile(path, content) {
  const parts = path.split('/').filter(Boolean);
  const filename = parts.pop();
  let node = userData.fs['/'];
  for(const part of parts) {
    if(!node.entries[part]) {
      node.entries[part] = { type:'dir', entries:{} };
    }
    node = node.entries[part];
  }
  node.entries[filename] = { type:'file', content };
  saveLocal();
}

// GIT CLONE: usa GitHub REST API para obtener contenido de un repo y guardarlo en userData.repos
async function gitClone(arg) {
  // arg puede ser owner/repo o url; soportamos owner/repo y full url
  if(!arg) { appendLine('git: argumento requerido: git clone owner/repo', 'output-err'); return; }
  let ownerRepo = arg;
  // limpiar si es url https://github.com/owner/repo.git
  if(arg.startsWith('https://github.com/')) {
    const parts = arg.replace('https://github.com/','').replace(/\.git$/,'').split('/');
    ownerRepo = parts.slice(0,2).join('/');
  }
  appendLine(`Cloning repository ${ownerRepo} ...`);
  const [owner, repo] = ownerRepo.split('/');
  if(!owner || !repo) { appendLine('git: formato inválido. Usa owner/repo', 'output-err'); return; }

  // función recursiva para descargar contenido de un path en el repo
  const token = ghTokenInput.value.trim();
  const headers = token ? { Authorization: 'token ' + token } : {};
  const RATE_DELAY = 100; // pequeño retardo para suavizar
  const fetchedFiles = {};

  async function fetchPath(pathInRepo, outPrefix) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(pathInRepo)}`;
    const res = await fetch(apiUrl, { headers });
    if(res.status === 404) {
      appendLine(`[warn] Ruta no encontrada: ${pathInRepo}`, 'output-info');
      return;
    }
    if(res.status === 403) {
      appendLine('[err] Límite de API o acceso denegado. Si clonaste sin token, prueba con token.', 'output-err');
      return;
    }
    const json = await res.json();
    if(Array.isArray(json)) {
      // es un directorio
      for(const entry of json) {
        await sleep(RATE_DELAY);
        if(entry.type === 'dir') {
          await fetchPath(entry.path, outPrefix + '/' + entry.name);
        } else if(entry.type === 'file') {
          // GET file content (api returns content base64 for file)
          const fileRes = await fetch(entry.url, { headers });
          const fileJson = await fileRes.json();
          const content = fileJson.content ? atob(fileJson.content.replace(/\n/g,'')) : '';
          // guardamos en fetchedFiles con la ruta relativa
          fetchedFiles[outPrefix + '/' + entry.name] = content;
        }
      }
    } else if(json.type === 'file') {
      const content = json.content ? atob(json.content.replace(/\n/g,'')) : '';
      fetchedFiles[outPrefix + '/' + json.name] = content;
    } else {
      appendLine('[warn] Respuesta inesperada de GitHub API para ' + pathInRepo, 'output-info');
    }
  }

  // sleep util
  function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

  // emulamos progreso
  appendLine('[info] Obteniendo índice del repo...', 'output-info');
  await fetchPath('', ''); // pathInRepo='', outPrefix=''
  // guardamos en userData.repos
  userData.repos[ownerRepo] = {
    owner,
    repo,
    files: fetchedFiles,
    clonedAt: new Date().toISOString()
  };
  // opcional: también volcamos archivos al fs virtual bajo /repos/owner_repo/...
  const baseDir = '/repos/' + owner + '_' + repo;
  // crear estructura en fs
  function ensureDir(path) {
    const parts = path.split('/').filter(Boolean);
    let node = userData.fs['/'];
    for(const p of parts) {
      if(!node.entries[p]) node.entries[p] = { type:'dir', entries:{} };
      node = node.entries[p];
    }
  }
  ensureDir(baseDir);
  for(const [relPath, content] of Object.entries(fetchedFiles)) {
    const targetPath = baseDir + '/' + relPath;
    fsAddFile(targetPath, content);
  }
  saveLocal();
  appendLine('[ok] clone completo. Repo guardado en JSON y en /repos/' + owner + '_' + repo, 'output-success');
}

// Comandos soportados
async function handleCommand(raw) {
  const line = raw.trim();
  if(!line) return;
  appendLine(`xs@web:~$ ${line}`);
  const parts = line.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  switch(cmd) {
    case 'help':
      appendLine('Comandos: help, ls, pwd, cd, cat, mkdir, touch, rm, clear, git clone, json show, json reset');
      break;
    case 'ls': {
      const cwd = userData.cwd || '/';
      const node = fsGetNode(cwd);
      if(!node || node.type!=='dir'){ appendLine('ls: no es un directorio', 'output-err'); break; }
      appendLine(Object.keys(node.entries).join('  '));
      break;
    }
    case 'pwd':
      appendLine(userData.cwd);
      break;
    case 'cd': {
      const dest = args[0] || '/';
      let target = dest.startsWith('/') ? dest : joinPath(userData.cwd, dest);
      // simplificación: no .. soporte robusto
      const node = fsGetNode(target);
      if(!node || node.type!=='dir') appendLine(`cd: no existe: ${dest}`, 'output-err');
      else { userData.cwd = target; saveLocal(); }
      break;
    }
    case 'cat': {
      const f = args[0];
      if(!f){ appendLine('cat: file required', 'output-err'); break; }
      const path = f.startsWith('/') ? f : joinPath(userData.cwd, f);
      const node = fsGetNode(path);
      if(!node || node.type!=='file'){ appendLine(`cat: no existe: ${path}`, 'output-err'); break; }
      appendLine(node.content);
      break;
    }
    case 'mkdir': {
      const d = args[0];
      if(!d){ appendLine('mkdir: name required', 'output-err'); break; }
      const path = d.startsWith('/') ? d : joinPath(userData.cwd, d);
      const parts = path.split('/').filter(Boolean);
      let node = userData.fs['/'];
      for(const part of parts) {
        if(!node.entries[part]) node.entries[part] = { type:'dir', entries:{} };
        node = node.entries[part];
      }
      saveLocal();
      appendLine(`mkdir: creado ${path}`, 'output-success');
      break;
    }
    case 'touch': {
      const f = args[0];
      if(!f){ appendLine('touch: name required', 'output-err'); break; }
      const path = f.startsWith('/') ? f : joinPath(userData.cwd, f);
      fsAddFile(path, '');
      appendLine(`touch: creado ${path}`, 'output-success');
      break;
    }
    case 'rm': {
      const target = args[0];
      if(!target){ appendLine('rm: target required', 'output-err'); break; }
      const path = target.startsWith('/') ? target : joinPath(userData.cwd, target);
      const parts = path.split('/').filter(Boolean);
      const name = parts.pop();
      let node = userData.fs['/'];
      for(const p of parts) {
        if(!node.entries[p]) { node = null; break; }
        node = node.entries[p];
      }
      if(!node || !node.entries[name]) { appendLine('rm: no existe: ' + path, 'output-err'); break; }
      delete node.entries[name];
      saveLocal();
      appendLine('rm: eliminado ' + path, 'output-success');
      break;
    }
    case 'clear':
      output.innerHTML = '';
      break;
    case 'git':
      if(args[0] === 'clone') {
        const repoArg = args[1];
        await gitClone(repoArg);
      } else appendLine('git: solo se soporta "git clone owner/repo" en este terminal simulado', 'output-err');
      break;
    case 'json':
      if(args[0] === 'show') appendLine(JSON.stringify(userData, null, 2));
      else if(args[0] === 'reset') {
        userData = defaultData();
        saveLocal();
        appendLine('[ok] JSON reseteado.', 'output-success');
      } else appendLine('json: show | reset', 'output-info');
      break;
    default:
      appendLine(`${cmd}: comando no encontrado`, 'output-err');
  }
}

// teclado y entrada
input.addEventListener('keydown', async (e) => {
  if(e.key === 'Enter') {
    const val = input.value;
    input.value = '';
    try { await handleCommand(val); }
    catch(err) { appendLine('[err] ' + err.message, 'output-err'); console.error(err); }
  } else if(e.key === 'c' && (e.ctrlKey || e.metaKey)) {
    appendLine('^C', 'output-info');
    input.value = '';
  }
});

// INIT
loadLocal();
appendLine('XS Web Terminal — listo. Escribe "help" para comenzar.', 'output-info');
