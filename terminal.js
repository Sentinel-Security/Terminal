const STORAGE_KEY = 'xs_terminal_py_v2';

const input = document.getElementById('input');
const output = document.getElementById('output');
const promptEl = document.getElementById('prompt');
const fileTree = document.getElementById('file-tree');

const ghTokenInput = document.getElementById('gh-token');
const saveGistBtn = document.getElementById('save-gist');
const loadGistBtn = document.getElementById('load-gist');
const exportBtn = document.getElementById('export-json');
const importBtn = document.getElementById('import-json');
const clearLocalBtn = document.getElementById('clear-local');

let userData = null;
let pyodide = null;
let pyReady = false;

// ========== Terminal Output ==========
function appendLine(text, cls){
  const d = document.createElement('div');
  d.className='output-line' + (cls ? ' ' + cls:'');
  d.textContent=text;
  output.appendChild(d);
  output.scrollTop=output.scrollHeight;
}
function appendHtml(html, cls){
  const d = document.createElement('div');
  d.className='output-line' + (cls ? ' ' + cls:'');
  d.innerHTML=html;
  output.appendChild(d);
  output.scrollTop=output.scrollHeight;
}
function createProgressBar(){
  const container=document.createElement('div');
  container.className='progress-bar-container';
  const bar=document.createElement('div');
  bar.className='progress-bar';
  container.appendChild(bar);
  output.appendChild(container);
  output.scrollTop=output.scrollHeight;
  return bar;
}

// ========== Default JSON ==========
function defaultData(){
  return {
    meta:{createdAt:new Date().toISOString(), user:'xs'},
    fs:{'/':{type:'dir',entries:{'home':{type:'dir',entries:{'xs':{type:'dir',entries:{}}}}}}},
    cwd:'/home/xs',
    repos:{},
    py_env:{packages:{}}
  };
}

// ========== Local Storage ==========
function loadLocal(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw){ userData=JSON.parse(raw); appendLine('[info] Datos cargados desde localStorage','output-info'); return;}
  }catch(e){console.error(e);}
  userData=defaultData();
  saveLocal();
  appendLine('[info] Datos inicializados','output-info');
}
function saveLocal(){localStorage.setItem(STORAGE_KEY,JSON.stringify(userData));}

// ========== Export / Import ==========
exportBtn.addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(userData,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='terminal_data.json'; a.click();
  URL.revokeObjectURL(url);
});
importBtn.addEventListener('click',async()=>{
  const inputFile=document.createElement('input'); inputFile.type='file'; inputFile.accept='application/json';
  inputFile.onchange=async e=>{
    const f=e.target.files[0];
    const text=await f.text();
    try{ userData=JSON.parse(text); saveLocal(); appendLine('[ok] JSON importado correctamente','output-success'); } 
    catch(err){ appendLine('[err] JSON inválido: '+err.message,'output-err');}
  };
  inputFile.click();
});
clearLocalBtn.addEventListener('click',()=>{
  if(confirm('Borrar datos locales (localStorage) para esta terminal?')){
    localStorage.removeItem(STORAGE_KEY);
    userData=defaultData();
    saveLocal();
    appendLine('[ok] Datos locales borrados','output-success');
  }
});

// ========== File System Helpers ==========
function joinPath(base,p){ if(!p) return base; if(p.startsWith('/')) return p; if(base.endsWith('/')) return base+p; return base+'/'+p; }
function fsGetNode(path){
  const parts=path.split('/').filter(Boolean);
  let node=userData.fs['/'];
  for(const part of parts){ if(!node.entries[part]) return null; node=node.entries[part]; }
  return node;
}
function ensureDir(path){
  const parts=path.split('/').filter(Boolean);
  let node=userData.fs['/'];
  for(const p of parts){ if(!node.entries[p]) node.entries[p]={type:'dir',entries:{}}; node=node.entries[p]; }
  return node;
}
function fsAddFile(path,content){
  const parts=path.split('/').filter(Boolean);
  const filename=parts.pop();
  let node=userData.fs['/'];
  for(const p of parts){ if(!node.entries[p]) node.entries[p]={type:'dir',entries:{}}; node=node.entries[p]; }
  node.entries[filename]={type:'file',content};
  saveLocal();
}

// ========== File Tree ==========
function buildTree(node,path){
  const ul=document.createElement('ul');
  for(const [name,entry] of Object.entries(node.entries)){
    const li=document.createElement('li'); li.textContent=name;
    const fullPath=joinPath(path,name);
    li.onclick=e=>{ e.stopPropagation(); if(entry.type==='file') appendLine(`[file] ${fullPath}\n${entry.content}`); else {userData.cwd=fullPath; saveLocal(); updateTree(); appendLine(`cd ${fullPath}`);} };
    if(entry.type==='dir'){ li.appendChild(buildTree(entry,fullPath)); }
    ul.appendChild(li);
  }
  return ul;
}
function updateTree(){
  fileTree.innerHTML=''; 
  const rootNode=userData.fs['/']; 
  const tree=buildTree(rootNode,'/'); 
  fileTree.appendChild(tree);
}

// ========== Git Clone con Progress ==========
async function gitClone(arg){
  if(!arg){ appendLine('git: argumento requerido: git clone owner/repo','output-err'); return;}
  let ownerRepo=arg.replace('https://github.com/','').replace(/\.git$/,'').split('/').slice(0,2).join('/');
  const [owner,repo]=ownerRepo.split('/');
  if(!owner||!repo){ appendLine('git: formato inválido. Usa owner/repo','output-err'); return; }
  appendLine(`Clonando repo ${ownerRepo} ...`);
  const token=ghTokenInput.value.trim();
  const headers=token?{Authorization:'token '+token}:{};
  const fetchedFiles={};
  const progressBar=createProgressBar();

  async function fetchPath(pathInRepo, outPrefix){
    const apiUrl=`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(pathInRepo)}`;
    const res=await fetch(apiUrl,{headers});
    if(res.status===404){ appendLine(`[warn] Ruta no encontrada: ${pathInRepo}`,'output-info'); return;}
    if(res.status===403){ appendLine('[err] Límite API o acceso denegado','output-err'); return;}
    const json=await res.json();
    if(Array.isArray(json)){
      for(const entry of json){
        await sleep(50);
        if(entry.type==='dir'){ await fetchPath(entry.path, outPrefix+'/'+entry.name);}
        else if(entry.type==='file'){
          const fileRes=await fetch(entry.url,{headers});
          const fileJson=await fileRes.json();
          const content=fileJson.content?atob(fileJson.content.replace(/\n/g,'')):'';
          fetchedFiles[outPrefix+'/'+entry.name]=content;
          // actualizar progress
          const total=Object.keys(fetchedFiles).length+1; 
          progressBar.style.width=Math.min(100,total*5)+'%';
        }
      }
    }
  }
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
  await fetchPath('','');
  userData.repos[ownerRepo]={owner,repo,files:fetchedFiles,clonedAt:new Date().toISOString()};
  const baseDir='/repos/'+owner+'_'+repo;
  ensureDir(baseDir);
  for(const [relPath,content] of Object.entries(fetchedFiles)){ fsAddFile(baseDir+'/'+relPath,content);}
  saveLocal();
  appendLine('[ok] Clone completo. Repo guardado en '+baseDir,'output-success');
  updateTree();
}

// ========== Pyodide ==========
async function initPyodide(){
  appendLine('[info] Cargando Pyodide...','output-info');
  pyodide=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'});
  await pyodide.loadPackage('micropip');
  pyReady=true;
  appendLine('[ok] Pyodide listo. Escribe "python3" para REPL o "pip install <pkg>".','output-success');
}
async function pipInstall(pkgName){
  if(!pyReady){ appendLine('[err] Pyodide no listo','output-err'); return;}
  try{
    const micropip=pyodide.pyimport('micropip');
    await micropip.install(pkgName);
    userData.py_env.packages[pkgName]={installedAt:new Date().toISOString()};
    saveLocal();
    appendLine(`[ok] pip install ${pkgName} completo`,'output-success');
  }catch(err){ appendLine('[err] pip install falló: '+err.toString(),'output-err'); }
}
async function runPython(code){
  if(!pyReady){ appendLine('[err] Pyodide no listo','output-err'); return;}
  try{ const res=await pyodide.runPythonAsync(code); appendLine(String(res));}
  catch(err){ appendLine('[err] Error Python: '+err.toString(),'output-err');}
}

// ========== Comandos ==========
async function handleCommand(raw){
  const line=raw.trim();
  if(!line) return;
  appendLine(`xs@web:~$ ${line}`);
  const parts=line.match(/(?:[^\s"]+|"[^"]*")+/g)||[];
  const cmd=parts[0].toLowerCase();
  const args=parts.slice(1).map(s=>s.replace(/^"|"$/g,''));

  const cwd=userData.cwd;

  switch(cmd){
    case 'help':
      appendLine('Comandos: help, ls, dir, pwd, cd, cat, type, mkdir, md, rm, rd, cls, clear, echo, git clone, pip install, pkg install, python3, py run, json show/reset, env show','output-info');
      break;
    case 'ls': case 'dir': {
      const node=fsGetNode(cwd);
      if(!node||node.type!=='dir'){ appendLine('ls: no es un directorio','output-err'); break;}
      appendLine(Object.keys(node.entries).join('  '));
      break;
    }
    case 'pwd': appendLine(cwd); break;
    case 'cd': {
      const dest=args[0]||'/';
      const target=dest.startsWith('/')?dest:joinPath(cwd,dest);
      const node=fsGetNode(target);
      if(!node||node.type!=='dir'){ appendLine(`cd: no existe: ${dest}`,'output-err'); break;}
      userData.cwd=target; saveLocal(); updateTree();
      break;
    }
    case 'cat': case 'type': {
      const f=args[0]; if(!f){ appendLine('cat/type: archivo requerido','output-err'); break;}
      const path=f.startsWith('/')?f:joinPath(cwd,f);
      const node=fsGetNode(path); if(!node||node.type!=='file'){ appendLine('cat/type: no existe: '+path,'output-err'); break;}
      appendLine(node.content); break;
    }
    case 'mkdir': case 'md': { const d=args[0]; if(!d){ appendLine('mkdir/md: requerido','output-err'); break;} ensureDir(d.startsWith('/')?d:joinPath(cwd,d)); saveLocal(); updateTree(); appendLine('Directorio creado: '+d,'output-success'); break;}
    case 'rm': case 'rd': { const t=args[0]; if(!t){ appendLine('rm/rd: requerido','output-err'); break;} const path=t.startsWith('/')?t:joinPath(cwd,t); const parts=path.split('/').filter(Boolean); const name=parts.pop(); let node=userData.fs['/']; for(const p of parts){ if(!node.entries[p]){node=null; break;} node=node.entries[p];} if(!node||!node.entries[name]){appendLine('rm/rd: no existe '+path,'output-err'); break;} delete node.entries[name]; saveLocal(); updateTree(); appendLine('Eliminado '+path,'output-success'); break;}
    case 'cls': case 'clear': output.innerHTML=''; break;
    case 'echo': appendLine(args.join(' ')); break;
    case 'git': if(args[0]==='clone'){ await gitClone(args[1]); } else appendLine('git: solo git clone soportado','output-err'); break;
    case 'pip': if(args[0]==='install'){ if(!args[1]){appendLine('pip install: pkg requerido','output-err'); break;} await pipInstall(args[1]);} else appendLine('pip: solo pip install <pkg>','output-info'); break;
    case 'pkg': if(args[0]==='install'){ if(!args[1]){appendLine('pkg install: requerido','output-err'); break;} await pipInstall(args[1]);} else appendLine('pkg: solo pkg install <pkg>','output-info'); break;
    case 'python3': appendLine('[info]
