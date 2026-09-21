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
    MISSIONS.forEach(function(m, i){
      var pct = missionPercent(t.rounds, i);
      var cls = pct===null ? '' : pct < 60 ? 'low' : pct < 85 ? 'mid' : 'high';
      var card = document.createElement('div');
      card.className = 'mission-card ' + cls;
      card.innerHTML =
        '<div class="mname">' + m.name + '</div>' +
        '<div class="mlabel">' + m.label + '</div>' +
        '<div class="mpct">' + (pct===null?'—':pct+'%') + '</div>' +
        '<div class="mbar"><i style="width:' + (pct||0) + '%"></i></div>';
      cardsEl.appendChild(card);
    });

    // attention points
    var attnEl = document.getElementById('attn-list');
    attnEl.innerHTML = '';
    var prevTest = getTest(t.id - 1);
    var items = [];
    MISSIONS.forEach(function(m, i){
      var pct = missionPercent(t.rounds, i);
      if(pct === null) return;
      if(pct < 60){
        items.push({type:'warn', text: m.name + ' apresenta baixa consistência.'});
      } else if(pct >= 85){
        items.push({type:'ok', text: m.name + ' apresenta estabilidade.'});
      }
      if(prevTest){
        var prevPct = missionPercent(prevTest.rounds, i);
        if(prevPct !== null && pct < prevPct - 4){
          items.push({type:'warn', text: m.name + ' apresentou queda em relação ao teste anterior.'});
        }
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
        return '<b class="'+(v?'ok':'no')+'">'+(v?'S':'N')+'</b>';
      }).join('');
      var flag = r.invalidated ? 'invalidada' : (r.correction ? 'corrigida' : '');
      d.innerHTML = '<span class="rid">#'+r.id+'</span><span class="seq">'+seq+'</span><span class="flag">'+flag+'</span>';
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
    missEl.innerHTML = MISSIONS.map(function(m, i){
      var pct = missionPercent(all, i);
      return '<div class="report-row"><span class="k">'+m.name+' — '+m.label+'</span><span class="v">'+(pct===null?'—':pct+'%')+'</span></div>';
    }).join('');

    var notesEl = document.getElementById('report-notes');
    var noteHtml = '';
    all.filter(function(r){ return r.note; }).forEach(function(r){
      noteHtml += '<div class="note-item"><span class="tag">#'+r.id+'</span>'+r.note+'</div>';
    });
    generalNotes.forEach(function(n){
      noteHtml += '<div class="note-item"><span class="tag">geral</span>'+n.text+'</div>';
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
    var backend = (typeof STORAGE_BACKEND !== 'undefined') ? STORAGE_BACKEND : 'localStorage';
    statusEl.innerHTML =
      '<div class="stat-box pos"><div class="sv">' + (backend === 'indexeddb' ? 'IndexedDB' : 'localStorage') + '</div><div class="sl">cache local ativo</div></div>' +
      '<div class="stat-box"><div class="sv">' + TESTS.length + '</div><div class="sl">testes salvos</div></div>' +
      '<div class="stat-box"><div class="sv">' + allRounds().length + '</div><div class="sl">rodadas salvas</div></div>' +
      '<div class="stat-box warnv"><div class="sv">—</div><div class="sl">banco online (pendente)</div></div>';

    var listEl = document.getElementById('dados-tests-list');
    if(!TESTS.length){
      listEl.innerHTML = '<div class="attn-item"><span class="ic">i</span><span>Nenhum teste criado ainda. Crie um teste no terminal (<b>/teste novo</b>) para importar ou exportar dados.</span></div>';
      return;
    }
    listEl.innerHTML = '';
    var importRow = document.createElement('div');
    importRow.className = 'data-import-row';
    importRow.innerHTML = '<button type="button" id="dados-import-btn">Importar CSV (novo teste)</button>';
    listEl.appendChild(importRow);
    document.getElementById('dados-import-btn').addEventListener('click', function(){
      document.getElementById('csv-file-input').click();
    });

    TESTS.forEach(function(t){
      var pct = overallPercent(t.rounds);
      var card = document.createElement('div');
      card.className = 'data-test-card';
      card.innerHTML =
        '<div class="dtc-info">' +
          '<div class="dtc-name">' + (t.active ? '▸ ' : '') + t.name + '</div>' +
          '<div class="dtc-meta">' + t.rounds.length + ' rodadas · desempenho geral ' + (pct===null?'—':pct+'%') + '</div>' +
        '</div>' +
        '<div class="dtc-actions"><button type="button" data-export="' + t.id + '">Exportar CSV</button></div>';
      listEl.appendChild(card);
    });
    listEl.querySelectorAll('[data-export]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var t = getTest(parseInt(btn.getAttribute('data-export'), 10));
        if(t) exportCsv(t);
      });
    });
  }

  /* ============ Ajuda (painel separado, pesquisável) ============ */
  var AJUDA_DATA = [
    { group:'Básico', items:[
      ['cd dashboard | cd evolucao | cd relatorios | cd dados | cd ajuda | cd terminal', 'navega entre as telas'],
      ['cls', 'limpa o terminal (único comando sem /)'],
      ['Tab / →', 'autocompleta o comando sugerido'],
      ['↑ / ↓', 'navega pelo histórico de comandos digitados']
    ]},
    { group:'Testes', items:[
      ['/teste', 'lista todos os testes e o percentual geral de cada um'],
      ['/teste novo [nome]', 'cria um novo teste e o torna ativo'],
      ['/selecionar (ou /sel)', 'lista os testes disponíveis'],
      ['/selecionar 3', 'torna o teste 3 o ativo'],
      ['/status', 'resumo do teste ativo (rodadas, válidas, invalidadas, desempenho)']
    ]},
    { group:'Missões', items:[
      ['S N S (ou SNS, sem espaços)', 'registra uma rodada (sucesso/falha por missão, na ordem M1 M2 M3)'],
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
      ['/sincronizar 1 2 [nome]', 'junta dois testes em um novo (M1 com M1, M2 com M2…), sem média simples, preservando os originais'],
      ['/evolucao', 'resumo do percentual geral de cada teste'],
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

