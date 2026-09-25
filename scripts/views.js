"use strict";

  /* ============ Dashboard ============ */
  function renderDashboard(){
    var t = getActiveTest();
    if(!t){
      document.getElementById('dash-testname').textContent = 'nenhum teste ativo';
      document.getElementById('mission-cards').innerHTML = '';
      document.getElementById('attn-list').innerHTML =
        '<div class="attn-item"><span class="ic">i</span><span>Nenhum teste criado ainda. Use <b>/teste novo</b> no terminal para começar a registrar rodadas.</span></div>';
      document.getElementById('last-rounds').innerHTML = '';
      return;
    }
    document.getElementById('dash-testname').textContent = t.name;

    var cardsEl = document.getElementById('mission-cards');
    cardsEl.innerHTML = '';
    missionsFor(t).forEach(function(m, i){
      var pct = missionPercent(t.rounds, i);
      var cls = pct===null ? '' : pct < 60 ? 'low' : pct < 85 ? 'mid' : 'high';
      var card = document.createElement('div');
      card.className = 'mission-card ' + cls;
      card.innerHTML =
        '<div class="mname">' + escapeHtml(m.name) + '</div>' +
        '<div class="mpct">' + (pct===null?'—':pct+'%') + '</div>' +
        '<div class="mbar"><i style="width:' + (pct||0) + '%"></i></div>';
      cardsEl.appendChild(card);
    });

    // attention points
    var attnEl = document.getElementById('attn-list');
    attnEl.innerHTML = '';
    var items = [];
    missionsFor(t).forEach(function(m, i){
      var pct = missionPercent(t.rounds, i);
      if(pct === null) return;
      if(pct < 60){
        items.push({type:'warn', text: m.name + ' apresenta baixa consistência.'});
      } else if(pct >= 85){
        items.push({type:'ok', text: m.name + ' apresenta estabilidade.'});
      }
    });
    if(!items.length){
      items.push({type:'ok', text:'Nenhum ponto de atenção no momento.'});
    }
    items.forEach(function(it){
      var d = document.createElement('div');
      d.className = 'attn-item ' + it.type;
      d.innerHTML = '<span class="ic">' + (it.type==='warn'?'⚠':'✓') + '</span><span>' + it.text + '</span>';
      attnEl.appendChild(d);
    });

    // last rounds
    var lastEl = document.getElementById('last-rounds');
    lastEl.innerHTML = '';
    var last = t.rounds.slice(-6).reverse();
    last.forEach(function(r){
      var d = document.createElement('div');
      d.className = 'round-chip' + (r.invalidated ? ' invalid' : '');
      var seq = r.results.map(function(v){
        if(v===null||v===undefined) return '<b class="na">·</b>';
        return '<b class="'+resultCls(v)+'">'+resultLabel(v)+'</b>';
      }).join('');
      var flag = r.invalidated ? 'invalidada' : (r.correction ? 'corrigida' : '');
      d.innerHTML = '<span class="rid">#'+r.id+'</span><span class="seq">'+seq+'</span>' + (r.time!==null?'<span class="time">'+formatTime(r.time)+'</span>':'') + '<span class="flag">'+flag+'</span>';
      lastEl.appendChild(d);
    });
  }

  /* ============ Evolução ============ */
  var evoKeys = ['overall','m1','m2','m3'];
  var evoLabels = {overall:'Geral', m1:'Missão 1', m2:'Missão 2', m3:'Missão 3'};
  var evoColors = {overall:'#dcdee2', m1:'#4fd68a', m2:'#e3a53d', m3:'#5ec3d6'};
  var evoOn = {overall:true, m1:true, m2:true, m3:true};

  function buildEvoControls(){
    var wrap = document.getElementById('evo-controls');
    wrap.innerHTML = '';
    evoKeys.forEach(function(k){
      var b = document.createElement('button');
      b.setAttribute('data-k', k);
      b.className = evoOn[k] ? 'on' : '';
      b.innerHTML = '<span class="dot"></span>' + evoLabels[k];
      b.addEventListener('click', function(){
        evoOn[k] = !evoOn[k];
        b.classList.toggle('on', evoOn[k]);
        drawChart();
      });
      wrap.appendChild(b);
    });
  }

  function drawChart(){
    var svg = document.getElementById('chart-svg');
    var snaps = TESTS.map(testSnapshot);
    var W = 640, H = 240, padL = 34, padR = 14, padT = 14, padB = 26;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var n = snaps.length;

    function x(i){ return padL + (n<=1 ? 0 : i/(n-1) * innerW); }
    function y(v){ return padT + innerH - (v/100) * innerH; }

    var svgParts = [];
    // gridlines
    [0,25,50,75,100].forEach(function(g){
      svgParts.push('<line x1="'+padL+'" y1="'+y(g)+'" x2="'+(W-padR)+'" y2="'+y(g)+'" stroke="#1a1c22" stroke-width="1"/>');
      svgParts.push('<text x="'+(padL-8)+'" y="'+(y(g)+3)+'" text-anchor="end" font-size="9" fill="#4a4e58" font-family="JetBrains Mono, monospace">'+g+'</text>');
    });
    // x labels
    snaps.forEach(function(s, i){
      svgParts.push('<text x="'+x(i)+'" y="'+(H-8)+'" text-anchor="middle" font-size="9" fill="#4a4e58" font-family=\'JetBrains Mono, monospace\'>T'+s.testId+'</text>');
    });

    evoKeys.forEach(function(k){
      if(!evoOn[k]) return;
      var pts = snaps.map(function(s,i){ return s[k]===null ? null : [x(i), y(s[k])]; });
      var validPts = pts.filter(Boolean);
      if(validPts.length < 1) return;
      var path = validPts.map(function(p,i){ return (i===0?'M':'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
      svgParts.push('<path d="'+path+'" fill="none" stroke="'+evoColors[k]+'" stroke-width="'+(k==='overall'?2.5:1.6)+'" stroke-linecap="round" stroke-linejoin="round"/>');
      validPts.forEach(function(p){
        svgParts.push('<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3" fill="'+evoColors[k]+'"/>');
      });
    });

    svg.innerHTML = svgParts.join('');

    var legend = document.getElementById('evo-legend');
    legend.innerHTML = evoKeys.map(function(k){
      return '<span><i style="background:'+evoColors[k]+'"></i>'+evoLabels[k]+'</span>';
    }).join('');
  }

  function renderEvolucao(){
    buildEvoControls();
    var table = document.getElementById('evo-table');
    if(!TESTS.length){
      document.getElementById('chart-svg').innerHTML = '';
      document.getElementById('evo-legend').innerHTML = '';
      table.innerHTML = '<tr><th>Nenhum teste registrado ainda — use /teste novo no terminal.</th></tr>';
      return;
    }
    drawChart();
    var snaps = TESTS.map(testSnapshot);
    var rows = '<tr><th>Teste</th><th>Geral</th><th>Missão 1</th><th>Missão 2</th><th>Missão 3</th></tr>';
    snaps.forEach(function(s){
      rows += '<tr><td>' + (getTest(s.testId).active ? s.name + ' (atual)' : s.name) + '</td><td>' +
        (s.overall===null?'—':s.overall+'%') + '</td><td>' +
        (s.m1===null?'—':s.m1+'%') + '</td><td>' +
        (s.m2===null?'—':s.m2+'%') + '</td><td>' +
        (s.m3===null?'—':s.m3+'%') + '</td></tr>';
    });
    table.innerHTML = rows;
  }

  /* ============ Relatórios ============ */
  function renderRelatorios(){
    var all = allRounds();
    var valid = validRounds(all);
    var invalidCount = all.length - valid.length;
    var succ = 0, fail = 0;
    valid.forEach(function(r){ r.results.forEach(function(v){ if(v===true) succ++; else if(v===false) fail++; }); });
    var corrections = all.filter(function(r){ return r.correction; });

    var statsEl = document.getElementById('report-stats');
    var stats = [
      {v: TESTS.length, l:'Testes', c:''},
      {v: all.length, l:'Rodadas', c:''},
      {v: valid.length, l:'Válidas', c:'pos'},
      {v: invalidCount, l:'Invalidadas', c: invalidCount ? 'neg' : ''},
      {v: succ, l:'Sucessos', c:'pos'},
      {v: fail, l:'Falhas', c: fail ? 'warnv' : ''},
      {v: corrections.length, l:'Corrigidas', c:''}
    ];
    statsEl.innerHTML = stats.map(function(s){
      return '<div class="stat-box '+s.c+'"><div class="sv">'+s.v+'</div><div class="sl">'+s.l+'</div></div>';
    }).join('');

    var missEl = document.getElementById('report-missions');
    var missionRows = '';
    TESTS.forEach(function(test){
      missionsFor(test).forEach(function(m, i){
        var pct = missionPercent(test.rounds, i);
        missionRows += '<div class="report-row"><span class="k">'+escapeHtml(test.name)+' — '+escapeHtml(m.name)+'</span><span class="v">'+(pct===null?'—':pct+'%')+'</span></div>';
      });
    });
    missEl.innerHTML = missionRows || '<div class="note-item">Nenhuma missão registrada.</div>';

    var notesEl = document.getElementById('report-notes');
    var noteHtml = '';
    all.filter(function(r){ return r.note; }).forEach(function(r){
      noteHtml += '<div class="note-item"><span class="tag">#'+r.id+'</span>'+escapeHtml(r.note)+'</div>';
    });
    generalNotes.forEach(function(n){
      noteHtml += '<div class="note-item"><span class="tag">geral</span>'+escapeHtml(n.text)+'</div>';
    });
    notesEl.innerHTML = noteHtml || '<div class="note-item">Nenhuma observação registrada.</div>';

    var corrEl = document.getElementById('report-corrections');
    if(corrections.length){
      corrEl.innerHTML = corrections.map(function(r){
        return '<div class="note-item correction"><span class="tag">#'+r.id+'</span>' +
          '<span class="orig">'+roundSeqLabel({results:r.correction.original})+'</span>' +
          '<span class="arrow">→</span>' +
          '<span class="new">'+roundSeqLabel({results:r.correction.correctedTo})+'</span>' +
          '<span class="reason">Motivo: '+r.correction.reason+'</span></div>';
      }).join('');
    } else {
      corrEl.innerHTML = '<div class="note-item">Nenhuma correção registrada.</div>';
    }
  }

  /* ============ Dados (importar/exportar — interface visual) ============
     CSV é formato de importação/exportação; esta tela oferece a mesma
     função central de exportação (exportCsv) usada pelo comando /csv,
     sem duplicar lógica. Banco online (Postgres) + IndexedDB como cache
     local + acesso multi-dispositivo fazem parte do armazenamento
     estruturado da seção 11/12 do espec — aqui, na ausência de um
     backend real, o "cache local" é feito via IndexedDB quando
     disponível (ver camada de persistência mais abaixo), com fallback
     para localStorage. Sincronização entre contas/dispositivos depende
     de um backend e está marcada como pendente na aba Dados. */
  function renderDados(){
    var statusEl = document.getElementById('storage-status');
    var backend = idbReady ? 'IndexedDB' : 'localStorage';
    statusEl.innerHTML =
      '<div class="stat-box pos"><div class="sv">' + backend + '</div><div class="sl">banco persistente</div></div>' +
      '<div class="stat-box"><div class="sv">' + TESTS.length + '</div><div class="sl">testes salvos</div></div>' +
      '<div class="stat-box"><div class="sv">' + allRounds().length + '</div><div class="sl">rodadas salvas</div></div>' +
      '<div class="stat-box warnv"><div class="sv">—</div><div class="sl">banco online (pendente)</div></div>';

    var newButton = document.getElementById('btn-novo-teste');
    if(newButton) newButton.onclick = openNewTestModal;
    var importButton = document.getElementById('dados-import-btn');
    if(importButton) importButton.onclick = function(){ document.getElementById('csv-file-input').click(); };

    var backupButton = document.getElementById('dados-backup-btn');
    var backupFeedback = document.getElementById('dados-backup-feedback');
    var backupAvailable = hasPersistedDataForBackup(readPersistedStateForBackup());
    backupButton.disabled = !backupAvailable;
    backupFeedback.textContent = backupAvailable
      ? 'O arquivo incluirá todos os dados salvos neste navegador.'
      : 'Não há dados salvos neste navegador para exportar.';
    backupButton.onclick = function(){
      var backup = createObbyBackup();
      if(!backup){
        backupButton.disabled = true;
        backupFeedback.textContent = 'Não há dados salvos neste navegador para exportar.';
        return;
      }

      var contents = JSON.stringify(backup, null, 2) + '\n';
      var blob = new Blob([contents], {type:'application/json;charset=utf-8'});
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      var timestamp = backup.exportedAt.replace(/[:.]/g, '-');
      link.href = url;
      link.download = 'obby-backup-' + timestamp + '.obby';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      backupFeedback.textContent = 'Backup baixado. Guarde e envie o arquivo sem alterar seu conteúdo.';
    };

    var listEl = document.getElementById('dados-tests-list');
    if(!TESTS.length){
      listEl.innerHTML = '<div class="attn-item"><span class="ic">i</span><span>Nenhum teste criado ainda. Clique em <b>Novo Teste</b> para começar.</span></div>';
      return;
    }
    listEl.innerHTML = '';

    TESTS.forEach(function(t){
      var pct = overallPercent(t.rounds);
      var card = document.createElement('div');
      card.className = 'data-test-card' + (t.active ? ' is-active' : '');
      card.innerHTML =
        '<div class="dtc-info">' +
          '<div class="dtc-name">' + escapeHtml(t.name) + (t.active ? '<span class="pill">ativo</span>' : '') + '</div>' +
          '<div class="dtc-meta">' + t.rounds.length + ' rodadas · desempenho geral ' + (pct===null?'—':pct+'%') + '</div>' +
          '<div class="dtc-missions">' + missionsFor(t).map(function(m){return escapeHtml(m.name);}).join(' · ') + '</div>' +
        '</div>' +
        '<div class="dtc-actions">' + (t.active?'':'<button type="button" class="btn small" data-activate="'+t.id+'">Tornar ativo</button>') +
        '<button type="button" class="btn small ghost" data-sync="'+t.id+'"'+(TESTS.length<2?' disabled':'')+'>Sincronizar</button>' +
        '<button type="button" class="btn small" data-export="' + t.id + '">Exportar CSV</button></div>';
      listEl.appendChild(card);
    });
    listEl.querySelectorAll('[data-export]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var t = getTest(parseInt(btn.getAttribute('data-export'), 10));
        if(t) exportCsv(t);
      });
    });
    listEl.querySelectorAll('[data-activate]').forEach(function(btn){
      btn.onclick = function(){ activateTest(parseInt(btn.getAttribute('data-activate'),10)); renderDados(); refreshAllViews(); };
    });
    listEl.querySelectorAll('[data-sync]').forEach(function(btn){
      btn.onclick = function(){ openSyncModal(parseInt(btn.getAttribute('data-sync'),10)); };
    });
  }

  var overlay = document.getElementById('modal-overlay');
  var modalPanel = document.getElementById('modal-panel');
  function modalOpen(){ return !overlay.classList.contains('hidden'); }
  function closeModal(){ overlay.classList.add('hidden'); modalPanel.innerHTML = ''; }
  function openModal(title, bodyHtml, footHtml){
    modalPanel.innerHTML = '<div class="modal-head"><h3>'+escapeHtml(title)+'</h3><button type="button" class="modal-close" id="modal-x">×</button></div><div class="modal-body">'+bodyHtml+'</div>'+(footHtml?'<div class="modal-foot">'+footHtml+'</div>':'');
    overlay.classList.remove('hidden');
    document.getElementById('modal-x').onclick = closeModal;
  }
  overlay.addEventListener('click',function(e){if(e.target===overlay)closeModal();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modalOpen()&&!(timerState&&timerState.running))closeModal();});

  function openNewTestModal(){
    var body='<div class="field-label">Nome do teste</div><input type="text" class="field-input" id="nt-name" placeholder="ex: Teste Rampa"><div class="field-label">Missões</div><div id="nt-missions"></div><button type="button" class="add-mission-btn" id="nt-add">+</button>';
    openModal('Novo Teste',body,'<button type="button" class="btn ghost" id="nt-cancel">Cancelar</button><button type="button" class="btn primary" id="nt-confirm">Criar teste</button>');
    var wrap=document.getElementById('nt-missions');
    function addMission(value){var row=document.createElement('div');row.className='mission-row';row.innerHTML='<input type="text" class="field-input" placeholder="Nome da missão" value="'+escapeHtml(value||'')+'"><button type="button" class="rm-btn">×</button>';row.querySelector('.rm-btn').onclick=function(){if(wrap.children.length>1)row.remove();};wrap.appendChild(row);}
    addMission('');
    document.getElementById('nt-add').onclick=function(){addMission('');};
    document.getElementById('nt-cancel').onclick=closeModal;
    document.getElementById('nt-confirm').onclick=function(){
      var name=document.getElementById('nt-name').value.trim();
      var names=Array.prototype.map.call(wrap.querySelectorAll('input'),function(el){return el.value.trim();}).filter(Boolean);
      if(!names.length)names=['Missão 1'];
      var test=createNewTest(name,names); closeModal(); refreshAllViews(); renderDados();
      if(VIEWS[currentView]==='terminal')printLine('Novo teste criado: '+test.name+' ('+test.missions.length+' missões). Teste ativo agora.','ok');
    };
  }

  function combineValue(a,b){a=resultValue(a);b=resultValue(b);if(a===null)return b;if(b===null)return a;return (a+b)/2;}
  function syncTests(t1,t2,name,names){
    var count=Math.min(missionsFor(t1).length,missionsFor(t2).length), labels=[];
    for(var i=0;i<count;i++) labels.push((names&&names[i])||missionsFor(t1)[i].name+' Média');
    var combined=createNewTest(name,labels), rows=[];
    for(var r=0;r<Math.min(t1.rounds.length,t2.rounds.length);r++){
      var a=t1.rounds[r],b=t2.rounds[r],results=[];
      for(var j=0;j<count;j++)results.push(combineValue(a.results[j],b.results[j]));
      var ta=typeof a.time==='number'?a.time:null,tb=typeof b.time==='number'?b.time:null;
      rows.push(makeRound(combined.id,results,{invalidated:a.invalidated||b.invalidated,note:[a.note,b.note].filter(Boolean).join(' | '),tags:(a.tags||[]).concat(b.tags||[]),time:ta!==null&&tb!==null?(ta+tb)/2:(ta!==null?ta:tb)}));
    }
    combined.rounds=rows;saveState();return combined;
  }
  function openSyncModal(preselectId){
    if(TESTS.length<2){openModal('Sincronizar','<div class="modal-hint">É preciso ter pelo menos dois testes cadastrados.</div>','<button class="btn ghost" id="sy-close">Fechar</button>');document.getElementById('sy-close').onclick=closeModal;return;}
    var options=TESTS.map(function(t){return '<option value="'+t.id+'">'+escapeHtml(t.name)+' ('+missionsFor(t).length+' missões)</option>';}).join('');
    openModal('Sincronizar testes','<div class="field-label">Teste 1</div><select class="select-input" id="sy-t1">'+options+'</select><div class="field-label">Teste 2</div><select class="select-input" id="sy-t2">'+options+'</select><div class="field-label">Nome do novo teste</div><input class="field-input" id="sy-name" placeholder="ex: Teste Sincronizado"><div class="modal-hint">Combina as missões pela posição usando média simples. Os testes originais são preservados.</div>','<button class="btn ghost" id="sy-cancel">Cancelar</button><button class="btn primary" id="sy-confirm">Sincronizar</button>');
    var first=document.getElementById('sy-t1'); if(preselectId!==undefined) first.value=preselectId;
    var second=document.getElementById('sy-t2'); if(second.value===first.value)second.selectedIndex=1;
    document.getElementById('sy-cancel').onclick=closeModal;
    document.getElementById('sy-confirm').onclick=function(){var a=getTest(parseInt(first.value,10)),b=getTest(parseInt(second.value,10));if(a===b){alert('Escolha dois testes diferentes.');return;}var name=document.getElementById('sy-name').value.trim()||a.name+' + '+b.name;var combined=syncTests(a,b,name);closeModal();refreshAllViews();renderDados();};
  }
  function openSelectModal(){
    var html=TESTS.map(function(t){var pct=overallPercent(t.rounds);return '<div class="data-test-card'+(t.active?' is-active':'')+'"><div class="dtc-info"><div class="dtc-name">'+escapeHtml(t.name)+(t.active?'<span class="pill">ativo</span>':'')+'</div><div class="dtc-meta">'+missionsFor(t).length+' missões · '+t.rounds.length+' rodadas · '+(pct===null?'—':pct+'%')+'</div></div>'+(t.active?'':'<button type="button" class="btn small" data-select="'+t.id+'">Tornar ativo</button>')+'</div>';}).join('')||'<div class="modal-hint">Nenhum teste cadastrado ainda.</div>';
    openModal('Selecionar teste',html,'<button type="button" class="btn ghost" id="sel-close">Fechar</button>');
    document.getElementById('sel-close').onclick=closeModal;
    modalPanel.querySelectorAll('[data-select]').forEach(function(btn){btn.onclick=function(){activateTest(parseInt(btn.getAttribute('data-select'),10));closeModal();refreshAllViews();renderDados();};});
  }

  var TIME_GREEN_RATIO=1;
  var timerState={running:false,startedAt:0,elapsedBefore:0,intervalId:null};
  var pendingTime=null;
  function formatTime(sec){return sec===null||sec===undefined?'—':sec.toFixed(1)+'s';}
  function currentElapsed(){return timerState.running?timerState.elapsedBefore+(Date.now()-timerState.startedAt)/1000:timerState.elapsedBefore;}
  function referenceTime(test){var times=test?validRounds(test.rounds).map(function(r){return r.time;}).filter(function(v){return typeof v==='number';}):[];return times.length?times.reduce(function(a,b){return a+b;},0)/times.length:null;}
  function renderTimeTab(){
    var t=getActiveTest();document.getElementById('tv-test').textContent=t?t.name:'— nenhum teste ativo —';
    var focus=pendingMini&&pendingMini.missionIdx!==null&&t?missionsFor(t)[pendingMini.missionIdx]:null;
    document.getElementById('tv-mission').textContent=!t?'—':(focus?focus.name:'Todas as missões');
    document.getElementById('tv-round').textContent=t?'Rodada '+(t.rounds.length+1):'—';
    var prev=t?t.rounds.filter(function(r){return typeof r.time==='number';}).slice(-2):[];
    document.getElementById('tv-prev').innerHTML=prev.length?prev.map(function(r){return '<div class="round-chip"><span class="rid">Rodada '+r.id+'</span><span class="time">'+formatTime(r.time)+'</span></div>';}).join(''):'<div class="modal-hint">Sem rodadas anteriores com tempo registrado ainda.</div>';
    var ready=document.getElementById('time-ready');ready.textContent=pendingTime!==null?'Tempo pronto: '+formatTime(pendingTime)+' — será associado à próxima rodada registrada.':'';ready.classList.toggle('show',pendingTime!==null);tickTimerDisplay();
  }
  function tickTimerDisplay(){var display=document.getElementById('time-display');if(!display)return;var elapsed=currentElapsed(),ref=referenceTime(getActiveTest());display.textContent=elapsed.toFixed(1);display.className='time-display-big '+(ref===null?'':elapsed/ref<=TIME_GREEN_RATIO?'c-green':'c-gray');}
  function stopTicking(){if(timerState.intervalId){clearInterval(timerState.intervalId);timerState.intervalId=null;}}
  function timerSpacePress(){if(timerState.running){timerState.elapsedBefore=currentElapsed();timerState.running=false;stopTicking();}else{timerState.running=true;timerState.startedAt=Date.now();timerState.intervalId=setInterval(tickTimerDisplay,100);}tickTimerDisplay();}
  function timerEnterPress(){timerState.elapsedBefore=currentElapsed();timerState.running=false;stopTicking();pendingTime=timerState.elapsedBefore;renderTimeTab();}
  function timerResetPress(){timerState.running=false;timerState.elapsedBefore=0;stopTicking();renderTimeTab();}
  document.getElementById('tm-reset').onclick=timerResetPress;
  document.addEventListener('keydown',function(e){if(VIEWS[currentView]!=='time'||modalOpen()||document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA')return;if(e.code==='Space'||e.key===' '){e.preventDefault();timerSpacePress();}else if(e.key==='Enter'){e.preventDefault();timerEnterPress();}});
  var homeScreen=document.getElementById('home-screen');
  function enterApp(){homeScreen.classList.add('hidden');setView(0,{noFocus:true});input.focus();}
  document.getElementById('home-enter').onclick=enterApp;
  document.addEventListener('keydown',function(e){if(!homeScreen.classList.contains('hidden')&&e.key==='Enter')enterApp();});

  /* ============ Ajuda (painel separado, pesquisável) ============ */
  var AJUDA_DATA = [
    { group:'Básico', items:[
      ['cd time | cd dashboard | cd relatorios | cd dados | cd ajuda | cd terminal', 'navega entre as telas'],
      ['cls', 'limpa o terminal (único comando sem /)'],
      ['Tab / →', 'autocompleta o comando sugerido'],
      ['↑ / ↓', 'navega pelo histórico de comandos digitados']
    ]},
    { group:'Testes', items:[
      ['/teste', 'lista todos os testes e o percentual geral de cada um'],
      ['/teste novo [nome]', 'cria um novo teste e o torna ativo'],
      ['/select *', 'abre a interface para selecionar o teste ativo'],
      ['/selecionar 3', 'torna o teste 3 o ativo'],
      ['/status', 'resumo do teste ativo (rodadas, válidas, invalidadas, desempenho)']
    ]},
    { group:'Missões', items:[
      ['S N S (ou SNS, sem espaços)', 'registra uma rodada (sucesso/falha por missão, na ordem configurada no teste)'],
      ['S N S* (ou SNS*)', 'registra a rodada e marca como invalidada (não entra nas estatísticas)'],
      ['/missao', 'mostra o percentual de sucesso de cada missão no teste ativo'],
      ['/selecionar M2', 'mostra resultados e comentários só da Missão 2'],
      ['@5', 'inicia um mini-teste isolado de 5 rodadas (cálculo próprio, não mistura com o resto)'],
      ['@5 M2', 'mini-teste de 5 rodadas focado exclusivamente na Missão 2']
    ]},
    { group:'Dados', items:[
      ['S N S # nota', 'adiciona uma observação à rodada'],
      ['#texto', 'observação geral do teste ativo'],
      ['!12', 'mostra a rodada 12 (ou a correção, se houver)'],
      ['!12 S S S # motivo', 'corrige a rodada 12, registrando o motivo'],
      ['/csv exportar [id]', 'exporta um teste em .csv (também disponível na aba Dados)'],
      ['/csv importar', 'importa um .csv como novo teste (também disponível na aba Dados)']
    ]},
    { group:'Tags', items:[
      ['# nota #rampa #velocidade', 'uma observação pode ter várias tags'],
      ['/selecionar #rampa', 'mostra rodadas/observações com a tag #rampa'],
      ['/selecionar #rampa #velocidade', 'filtra por mais de uma tag ao mesmo tempo']
    ]},
    { group:'Histórico', items:[
      ['/voltar (alias /reload)', 'desfaz a última alteração de dados, sempre pedindo confirmação (y/N)'],
      ['/remover rodada 12', 'remove a rodada 12, com confirmação — desfazível com /voltar'],
      ['/remover teste [id]', 'remove um teste inteiro, com confirmação — desfazível com /voltar'],
      ['/historico', 'lista as últimas rodadas do teste ativo']
    ]},
    { group:'Comandos avançados', items:[
      ['Aba Time ou /time', 'cronômetro: Espaço inicia/pausa/continua e Enter associa o tempo à próxima rodada'],
      ['Dados → Sincronizar', 'combina dois testes por média simples, missão pela posição, preservando os originais'],
      ['/relatorio', 'resumo geral de todos os testes e rodadas'],
      ['/resetar confirmar', 'apaga todos os dados salvos neste dispositivo']
    ]}
  ];

  function renderAjuda(filter){
    var wrap = document.getElementById('ajuda-content');
    var q = (filter || '').trim().toLowerCase();
    wrap.innerHTML = '';
    AJUDA_DATA.forEach(function(g){
      var rows = g.items.filter(function(it){
        return !q || it[0].toLowerCase().indexOf(q) !== -1 || it[1].toLowerCase().indexOf(q) !== -1;
      });
      if(!rows.length) return;
      var groupEl = document.createElement('div');
      groupEl.className = 'ajuda-group';
      groupEl.innerHTML = '<h4>' + g.group + '</h4>' + rows.map(function(it){
        return '<div class="ajuda-row"><code>' + escapeHtml(it[0]) + '</code><span class="desc">' + escapeHtml(it[1]) + '</span></div>';
      }).join('');
      wrap.appendChild(groupEl);
    });
    if(!wrap.children.length){
      wrap.innerHTML = '<div class="attn-item"><span class="ic">i</span><span>Nenhum comando encontrado para "' + escapeHtml(filter) + '".</span></div>';
    }
  }

  document.getElementById('ajuda-search').addEventListener('input', function(e){
    renderAjuda(e.target.value);
  });

