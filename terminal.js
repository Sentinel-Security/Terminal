/* XS Web Terminal — versión con Pyodide (python3 + pip), JSON por usuario,
   git clone (GitHub API), fs virtual y persistencia.
   2025 - adaptado para GitHub Pages
*/

const STORAGE_KEY = 'xs_terminal_py_v1';

const input = document.getElementById('input');
const output = document.getElementById('output');
const promptEl = document.getElementById('prompt');
const ghTokenInput = document.getElementById('gh-token');
const saveGistBtn = document.getElementById('save-gist');
const loadGistBtn = document.getElementById('load-gist');
const exportBtn = document.getElementById('export-json');
const importBtn = document.getElementById('import-json');
const clearLocalBtn = document.getElementById('clear-local');

let userData = null;
let pyodide = null;
let pyReady = false;

// ========= UTIL: terminal output =========
function appendLine(text, cls) {
  const d = document.createElement('div');
  d.className = 'output-line' + (cls ? ' ' + cls : '');
  d.textContent = text;
  output.appendChild(d);
  output.scrollTop = output.scrollHeight;
}
function appendHtml(html, cls) {
  const d = document.createElement('div');
  d.className = 'output-line' + (cls ? ' ' + cls : '');
  d.innerHTML = html;
  output.appendChild(d);
  output.scrollTop = output.scrollHeight;
}

// ========= DEFAULT JSON =========
function defaultData() {
  return {
    meta:{ createdAt: new Date().toISOString(), user: 'xs' },
    fs:{ '/': { type:'dir', entries: { 'home': { type:'dir', entries: { 'xs': { type:'dir', entries:{} } } } } } },
    cwd: '/home/xs',
    repos: {},
    py_env: { packages: {} } // metadata de paquetes instalados en pyodide (nombre->version)
  };
}

// ========= localStorage =========
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) {
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

// ========= Export / Import JSON =========
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
clearLocalBtn.addEventListener('click', () => {
  if(confirm('Borrar datos locales (localStorage) para esta terminal?')) {
    localStorage.removeItem(STORAGE_KEY);
    userData = defaultData();
    saveLocal();
    appendLine('[ok] Datos locales borrados.', 'output-success');
  }
});

// ========= GIST (guardar/cargar) =========
async function createOrUpdateGist(token) {
  if(!token) { appendLine('[err] Token vacío.', 'output-err'); return; }
  appendLine('[info] Creando/updating Gist... (usa tu token local en el navegador)', 'output-info');
  try {
    const gists = await fetch('https://api.github.com/gists', { headers: { Authorization: 'token ' + token } }).then(r=>r.json());
    let found = Array.isArray(gists) && gists.find(g => g.description && g.description.includes('xs-web-terminal-data'));
    const body = { description: 'xs-web-terminal-data - terminal_data.json', public:false, files:{ 'terminal_data.json': { content: JSON.stringify(userData, null, 2) } } };
    let res;
    if(found) {
      res = await fetch('https://api.github.com/gists/' + found.id, { method:'PATCH', headers:{ Authorization:'token '+token, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    } else {
      res = await fetch('https://api.github.com/gists', { method:'POST', headers:{ Authorization:'token '+token, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    }
    const json = await res.json();
    if(json.id) {
      appendLine('[ok] Gist guardado. ID: ' + json.id, 'output-success');
      localStorage.setItem('xs_gist_id', json.id);
    } else appendLine('[err] Error al guardar Gist: ' + JSON.stringify(json), 'output-err');
  } catch(e) { appendLine('[err] Fallo al crear gist: ' + e.message, 'output-err'); }
}
async function loadGist(token) {
  appendLine('[info] Intentando cargar Gist...', 'output-info');
  try {
    let gistId = localStorage.getItem('xs_gist_id');
    if(!gistId) {
      const gists = await fetch('https://api.github.com/gists', { headers:{ Authorization:'token '+token } }).then(r=>r.json());
      const found = Array.isArray(gists) && gists.find(g => g.description && g.description.includes('xs-web-terminal-data'));
      gistId = found ? found.id : null;
    }
    if(!gistId) { appendLine('[err] No se encontró Gist.', 'output-err'); return; }
    const res = await fetch('https://api.github.com/gists/' + gistId, { headers:{ Authorization:'token '+token } }).then(r=>r.json());
    if(res.files && res.files['terminal_data.json']) {
      userData = JSON.parse(res.files['terminal_data.json'].content);
      saveLocal();
      appendLine('[ok] Datos cargados desde Gist.', 'output-success');
    } else appendLine('[err] El gist no contiene terminal_data.json', 'output-err');
  } catch(e) { appendLine('[err] Error cargando gist: ' + e.message, 'output-err'); }
}
saveGistBtn.addEventListener('click', () => { const token = ghTokenInput.value.trim(); if(!token) { appendLine('[err] Pega tu token si quieres guardar en Gist (opcional).', 'output-err'); return; } createOrUpdateGist(token); });
loadGistBtn.addEventListener('click', () => { const token = ghTokenInput.value.trim(); if(!token) { appendLine('[err] Pega tu token si quieres cargar Gist (opcional).', 'output-err'); return; } loadGist(token); });

// ========= FS helpers =========
function joinPath(base, p) {
  if(!p) return base;
  if(p.startsWith('/')) return p;
  if(base.endsWith('/')) return base + p;
  return base + '/' + p;
}
function fsGetNode(path) {
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
    if(!node.entries[part]) node.entries[part] = { type:'dir', entries:{} };
    node = node.entries[part];
  }
  node.entries[filename] = { type:'file', content };
  saveLocal();
}
function ensureDir(path) {
  const parts = path.split('/').filter(Boolean);
  let node = userData.fs['/'];
  for(const p of parts) {
    if(!node.entries[p]) node.entries[p] = { type:'dir', entries:{} };
    node = node.entries[p];
  }
  return node;
}

// ========= GIT CLONE (GitHub API) =========
async function gitClone(arg) {
  if(!arg) { appendLine('git: argumento requerido: git clone owner/repo', 'output-err'); return; }
  let ownerRepo = arg;
  if(arg.startsWith('https://github.com/')) {
    ownerRepo = arg.replace('https://github.com/','').replace(/\.git$/,'').split('/').slice(0,2).join('/');
  }
  appendLine(`Cloning repository ${ownerRepo} ...`);
  const [owner, repo] = ownerRepo.split('/');
  if(!owner || !repo) { appendLine('git: formato inválido. Usa owner/repo', 'output-err'); return; }

  const token = ghTokenInput.value.trim();
  const headers = token ? { Authorization: 'token ' + token } : {};
  const fetchedFiles = {};

  async function fetchPath(pathInRepo, outPrefix) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(pathInRepo)}`;
    const res = await fetch(apiUrl, { headers });
    if(res.status === 404) {
      appendLine(`[warn] Ruta no encontrada: ${pathInRepo}`, 'output-info');
      return;
    }
    if(res.status === 403) {
      appendLine('[err] Límite de API o acceso denegado. Si clonaste sin token, intenta con token.', 'output-err');
      return;
    }
    const json = await res.json();
    if(Array.isArray(json)) {
      for(const entry of json) {
        await sleep(80);
        if(entry.type === 'dir') {
          await fetchPath(entry.path, outPrefix + '/' + entry.name);
        } else if(entry.type === 'file') {
          const fileRes = await fetch(entry.url, { headers });
          const fileJson = await fileRes.json();
          const content = fileJson.content ? atob(fileJson.content.replace(/\n/g,'')) : '';
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
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  appendLine('[info] Obteniendo índice del repo...', 'output-info');
  await fetchPath('', '');
  userData.repos[ownerRepo] = { owner, repo, files: fetchedFiles, clonedAt: new Date().toISOString() };

  // volcamos al FS virtual en /repos/owner_repo/...
  const baseDir = '/repos/' + owner + '_' + repo;
  ensureDir(baseDir);
  for(const [relPath, content] of Object.entries(fetchedFiles)) {
    const targetPath = baseDir + '/' + relPath;
    fsAddFile(targetPath, content);
  }
  saveLocal();
  appendLine('[ok] clone completo. Repo guardado en JSON y en ' + baseDir, 'output-success');
}

// ========= Pyodide init (python3 + pip) =========
async function initPyodide() {
  appendLine('[info] Cargando Pyodide (python3 en el navegador). Esto puede tardar unos segundos...', 'output-info');
  try {
    pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' });
    // micropip para instalar paquetes pip compatibles
    await pyodide.loadPackage('micropip');
    pyReady = true;
    appendLine('[ok] Pyodide listo. Escribe "python3" para entrar al REPL o "pip install <pkg>" para instalar (si es compatible).', 'output-success');
  } catch(e) {
    appendLine('[err] Error cargando Pyodide: ' + e.message, 'output-err');
  }
}

// ejecutar pip install (micropip)
async function pipInstall(pkgName) {
  if(!pyReady) { appendLine('[err] Pyodide no está listo.', 'output-err'); return; }
  appendLine(`[info] Intentando instalar ${pkgName} en entorno Pyodide...`, 'output-info');
  try {
    const micropip = pyodide.pyimport('micropip');
    // micropip.install accepts wheels or package names; may fail for packages with C extensions
    await micropip.install(pkgName);
    // guardar metadata básico
    userData.py_env.packages[pkgName] = { installedAt: new Date().toISOString() };
    saveLocal();
    appendLine('[ok] pip install exitoso (si Pyodide soporta el paquete).', 'output-success');
  } catch(err) {
    appendLine('[err] pip install falló: ' + err.toString(), 'output-err');
    appendLine('[small] Nota: muchos paquetes con extensiones C no son instalables en Pyodide; busca wheels o versiones puras en PyPI.', 'small');
  }
}

// ejecutar código Python en Pyodide (REPL minimal)
async function runPython(code) {
  if(!pyReady) { appendLine('[err] Pyodide no está listo.', 'output-err'); return; }
  try {
    const res = await pyodide.runPythonAsync(code);
    appendLine(String(res));
  } catch(err) {
    appendLine('[err] Error Python: ' + err.toString(), 'output-err');
  }
}

// ========= Comandos y handler =========
async function handleCommand(raw) {
  const line = raw.trim();
  if(!line) return;
  appendLine(`xs@web:~$ ${line}`);
  const parts = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const cmd = parts[0];
  const args = parts.slice(1).map(s => s.replace(/^"|"$/g,''));

  switch(cmd) {
    case 'help':
      appendLine('Comandos: help, ls, pwd, cd, cat, mkdir, touch, rm, clear, git clone, pip install, pkg install, python3, py run, json show, json reset, env show', 'output-info');
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
      ensureDir(path);
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
      const parts2 = path.split('/').filter(Boolean);
      const name = parts2.pop();
      let node = userData.fs['/'];
      for(const p of parts2) {
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
      } else appendLine('git: solo "git clone owner/repo" soportado', 'output-err');
      break;
    case 'pip':
      if(args[0] === 'install') {
        const pkg = args[1];
        if(!pkg) { appendLine('pip install: package required', 'output-err'); break; }
        await pipInstall(pkg);
      } else appendLine('pip: solo "pip install <pkg>" (usa Pyodide/micropip) en este terminal', 'output-info');
      break;
    case 'pkg':
      if(args[0] === 'install') {
        const name = args[1];
        if(!name){ appendLine('pkg install: paquete requerido', 'output-err'); break; }
        // Interpretamos pkg install como alias para pip install en este entorno.
        appendLine(`[info] pkg -> pip alias: instalando ${name} via micropip...`, 'output-info');
        await pipInstall(name);
      } else appendLine('pkg: solo "pkg install <pkg>" (alias a pip install)', 'output-info');
      break;
    case 'python3':
      // Entrar a un REPL básico (bloque promesa)
      appendLine('[info] Iniciando REPL Python (Pyodide). Escribe "exit()" para salir.', 'output-info');
      // simple REPL: prompt user to input code lines — for simplicity, open a modal-like loop via prompt()
      // Implementamos un simple prompt loop (no multiline) — para multiline usar "py run" con heredoc
      (async()=>{
        while(true) {
          const code = prompt('[PYTHON REPL] Escribe código Python (una línea). "exit()" para salir.');
          if(code === null) { appendLine('[info] REPL cancelado.', 'output-info'); break; }
          if(code.trim() === 'exit()' || code.trim() === 'quit()') { appendLine('[info] Saliendo de REPL.', 'output-info'); break; }
          await runPython(code);
        }
      })();
      break;
    case 'py':
      // ejecutar script python en una sola línea o heredoc con py run <<EOF ... EOF
      if(args[0] === 'run') {
        const code = line.split(' ').slice(2).join(' ');
        if(!code) { appendLine('py run: especifica código: py run print("hola")', 'output-err'); break; }
        await runPython(code);
      } else appendLine('py: usa "py run <code>"', 'output-info');
      break;
    case 'json':
      if(args[0] === 'show') appendLine(JSON.stringify(userData, null, 2));
      else if(args[0] === 'reset') { userData = defaultData(); saveLocal(); appendLine('[ok] JSON reseteado.', 'output-success'); }
      else appendLine('json: show | reset', 'output-info');
      break;
    case 'env':
      if(args[0] === 'show') appendLine(JSON.stringify(userData.py_env, null, 2));
      else appendLine('env: show', 'output-info');
      break;
    default:
      appendLine(`${cmd}: comando no encontrado`, 'output-err');
  }
}

// teclado / input
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
appendLine('XS Web Terminal — cargando...', 'output-info');
initPyodide(); // arranca Pyodide en background
appendLine('Escribe "help" para listar comandos. Python y pip funcionan via Pyodide (si está cargado).', 'output-info');
