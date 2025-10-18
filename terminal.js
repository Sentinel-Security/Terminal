const input = document.getElementById('input');
const output = document.getElementById('output');

let currentDir = '~';
let files = { '~': ['documents', 'downloads', 'projects', 'music', 'pictures'] };

// Cargar datos guardados del usuario
function loadData() {
  const saved = localStorage.getItem('terminalData');
  if(saved) {
    const data = JSON.parse(saved);
    currentDir = data.currentDir || '~';
    files = data.files || files;
  }
}

// Guardar datos del usuario
function saveData() {
  const data = { currentDir, files };
  localStorage.setItem('terminalData', JSON.stringify(data));
}

loadData();

function appendLine(text) {
  const div = document.createElement('div');
  div.classList.add('output-line');
  div.textContent = text;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

// Simula delay como si estuvieras cargando
function fakeProgress(text, callback) {
  appendLine(text);
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.floor(Math.random()*20)+10;
    if(progress >= 100) {
      clearInterval(interval);
      appendLine('100%');
      if(callback) callback();
    } else {
      appendLine(progress + '%');
    }
  }, 200);
}

input.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') {
    const cmd = input.value.trim();
    appendLine(`xs@web:~$ ${cmd}`);
    
    const parts = cmd.split(' ');
    
    switch(parts[0]) {
      case 'help':
        appendLine('Comandos: help, ls, cd, clear, git clone, echo, reset');
        break;
      case 'ls':
        appendLine(files[currentDir].join('  '));
        break;
      case 'cd':
        if(parts[1] && files[parts[1]]) currentDir = parts[1];
        else appendLine(`cd: no such file or directory: ${parts[1]}`);
        break;
      case 'clear':
        output.innerHTML = '';
        break;
      case 'echo':
        appendLine(parts.slice(1).join(' '));
        break;
      case 'git':
        if(parts[1] === 'clone') {
          const repo = parts[2] || 'fake-repo';
          fakeProgress(`Cloning into '${repo}'...`, () => {
            appendLine(`done.`);
            files[currentDir].push(repo);
            saveData(); // Guardar cambios
          });
        } else appendLine('git: comando no reconocido');
        break;
      case 'reset':
        if(confirm('¿Deseas reiniciar la terminal y borrar todo?')) {
          localStorage.removeItem('terminalData');
          files = { '~': ['documents', 'downloads', 'projects', 'music', 'pictures'] };
          currentDir = '~';
          output.innerHTML = '';
        }
        break;
      default:
        appendLine(`${parts[0]}: comando no encontrado`);
    }

    saveData(); // Guardar después de cada comando
    input.value = '';
  }
});
