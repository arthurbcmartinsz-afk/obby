"use strict";

  /* ============ Terminal ============ */

  var log = document.getElementById('term-log');
  var input = document.getElementById('term-input');
  var history = [];
  var histPos = -1;
  var pendingMini = null; // {count, missionIdx|null, done, collected:[]}

  function printCmd(text){
    var d = document.createElement('div');
    d.className = 'term-line cmd';
    d.textContent = text;
    log.appendChild(d);
  }
  function printLine(text, cls){
    var d = document.createElement('div');
    d.className = 'term-line ' + (cls||'out');
    d.textContent = text;
    log.appendChild(d);
  }
  function printBlock(html){
    var d = document.createElement('div');
    d.className = 'term-block';
    d.innerHTML = html;
    log.appendChild(d);
  }
  function scrollLog(){ log.scrollTop = log.scrollHeight; }

  function clearTerminal(){
    log.innerHTML = '';
    var t = getActiveTest();
    printLine('Terminal limpo.', 'dim');
    if(t) printLine('Teste ativo: ' + t.name, 'dim');
  }

  function resultCls(v){
    if(v === null || v === undefined) return 'na';
    if(v === true) return 'ok';
    if(v === false) return 'no';
    return 'mix';
  }
  function resultLabel(v){
    if(v === null || v === undefined) return '·';
    if(v === true) return 'S';
    if(v === false) return 'N';
    return Math.round(v*100)+'%';
  }
  function missionResultsHtml(test, results){
    return results.map(function(v, i){
      if(v === null || v === undefined) return '';
      var cls = resultCls(v), name = missionsFor(test)[i] ? missionsFor(test)[i].name : ('Missão '+(i+1));
      var label = v===true?'SUCESSO':(v===false?'FALHA':(Math.round(v*100)+'% (média)'));
      return '<div class="res-row"><span class="m">'+escapeHtml(name)+'</span><span class="v '+cls+'">'+label+'</span></div>';
    }).join('');
  }

  function registerRound(results, invalidated, note, type, focusedMission){
    var t = getActiveTest();
    if(!t) return null;
    var tags = extractTags(note);
    var opts = {invalidated:invalidated, note:note||'', tags:tags, type:type||'full', focusedMission:typeof focusedMission === 'number' ? focusedMission : null};
    if(pendingTime !== null){ opts.time = pendingTime; pendingTime = null; if(VIEWS[currentView] === 'time') renderTimeTab(); }
    var r = makeRound(t.id, results, opts);
    t.rounds.push(r);
    saveState();
    pushAction('registrar rodada #' + r.id + ' (' + t.name + ')', function(){
      var idx = t.rounds.indexOf(r);
      if(idx !== -1) t.rounds.splice(idx, 1);
    });
    return r;
  }

  /* remove uma rodada pelo id, em qualquer teste. Retorna {test, round, idx} ou null. */
  function findRoundLocation(id){
    var result = null;
    TESTS.forEach(function(t){
      var idx = t.rounds.findIndex(function(r){ return r.id === id; });
      if(idx !== -1) result = { test: t, round: t.rounds[idx], idx: idx };
    });
    return result;
  }

  function removeRoundById(id){
    var loc = findRoundLocation(id);
    if(!loc) return null;
    loc.test.rounds.splice(loc.idx, 1);
    saveState();
    pushAction('remover rodada #' + id + ' (' + loc.test.name + ')', function(){
      loc.test.rounds.splice(loc.idx, 0, loc.round);
    });
    return loc;
  }

  function removeTestById(id){
    var idx = TESTS.findIndex(function(t){ return t.id === id; });
    if(idx === -1) return null;
    var t = TESTS[idx];
    TESTS.splice(idx, 1);
    saveState();
    pushAction('remover teste "' + t.name + '"', function(){
      TESTS.splice(idx, 0, t);
    });
    return t;
  }

  function tokenizeResultString(str){
    // returns {results:[bool,bool,bool] or fewer, invalidated}
    // aceita tanto "S N S" (com espaços) quanto "SNS" (colado),
    // e qualquer mistura das duas formas — lê caractere a caractere.
    var invalidated = false;
    var results = [];
    var chars = (str || '').trim().split('');
    chars.forEach(function(ch){
      var c = ch.toUpperCase();
      if(c === 'S') results.push(true);
      else if(c === 'N') results.push(false);
      else if(c === '*') invalidated = true;
      // espaços e demais caracteres são ignorados aqui
    });
    return {results: results, invalidated: invalidated};
  }

  function isResultLine(str){
    return /^[SsNn\s\*]+$/.test(str.trim()) && /[SsNn]/.test(str);
  }

  /* ============ Confirmação genérica (y/N) ============
     Usada por /voltar e /remover. Enquanto pendingConfirm estiver
     ativo, a próxima linha digitada é interpretada como resposta,
     e nada é alterado se a resposta for N. */
  var pendingConfirm = null;

  function askConfirm(message, onYes, onNo){
    pendingConfirm = { onYes: onYes, onNo: onNo || null };
    printLine(message + ' (y/N)', 'warn');
  }

  function handleConfirmInput(cmd){
    var v = cmd.trim().toLowerCase();
    var yes = (v === 'y' || v === 's' || v === 'sim' || v === 'yes');
    var action = pendingConfirm;
    pendingConfirm = null;
    if(yes){
      action.onYes();
    } else {
      printLine('Nada foi alterado.', 'dim');
      if(action.onNo) action.onNo();
    }
  }

  function handleCommand(raw){
    var cmd = raw;
    printCmd(cmd);

    // Se há uma confirmação pendente (/voltar, /remover), esta linha é a resposta
    if(pendingConfirm){
      handleConfirmInput(cmd);
      scrollLog();
      return;
    }

    // If a mini-test is in progress, treat this as one round of it
    if(pendingMini){
      handleMiniRound(cmd);
      return;
    }

    var trimmed = cmd.trim();
    if(trimmed === ''){ return; }

    // cls / limpar — limpa o terminal
    if(/^(cls|clear|limpar)$/i.test(trimmed)){
      clearTerminal();
      return;
    }

    // cd navigation
    var cdMatch = trimmed.match(/^cd\s+(\S+)/i);
    if(cdMatch){
      var dest = cdMatch[1].toLowerCase();
      var map = {dashboard:'dashboard', dash:'dashboard', relatorios:'relatorios', rel:'relatorios', terminal:'terminal', term:'terminal', dados:'dados', data:'dados', ajuda:'ajuda', help:'ajuda', time:'time', cronometro:'time'};
      if(map[dest]){
        printLine('Abrindo ' + VIEW_LABELS[map[dest]].toLowerCase() + '…', 'dim');
        var idx = VIEWS.indexOf(map[dest]);
        setTimeout(function(){ setView(idx, {noFocus:true}); input.focus(); }, 120);
      } else {
        printLine('Destino desconhecido: ' + dest, 'err');
      }
      scrollLog();
      return;
    }

    // system commands
    if(trimmed.charAt(0) === '/'){
      handleSystemCommand(trimmed);
      scrollLog();
      return;
    }

    // correction
    if(trimmed.charAt(0) === '!'){
      handleCorrection(trimmed);
      scrollLog();
      return;
    }

    // mini-test start
    var miniMatch = trimmed.match(/^@(\d+)(?:\s+M(\d+))?/i);
    if(miniMatch){
      startMiniTest(parseInt(miniMatch[1],10), miniMatch[2] ? parseInt(miniMatch[2],10)-1 : null);
      scrollLog();
      return;
    }

    // general observation
    if(trimmed.charAt(0) === '#'){
      var text = trimmed.slice(1).trim();
      var atest = getActiveTest();
      if(!atest){
        printLine('Nenhum teste ativo. Use "/teste novo" para criar um teste antes.', 'err');
        scrollLog();
        return;
      }
      var noteObj = {testId: atest.id, text: text, tags: extractTags(text)};
      generalNotes.push(noteObj);
      saveState();
      pushAction('adicionar observação geral (' + atest.name + ')', function(){
        var idx = generalNotes.indexOf(noteObj);
        if(idx !== -1) generalNotes.splice(idx, 1);
      });
      printLine('Observação registrada ✓', 'ok');
      if(noteObj.tags.length) printLine('tags: ' + noteObj.tags.map(function(t){return '#'+t;}).join(' '), 'dim');
      scrollLog();
      return;
    }

    // round entry, optionally with trailing # note
    var noteSplit = trimmed.split('#');
    var seqPart = noteSplit[0].trim();
    var notePart = noteSplit.length > 1 ? noteSplit.slice(1).join('#').trim() : '';

    if(isResultLine(seqPart)){
      if(!getActiveTest()){
        printLine('Nenhum teste ativo. Use "/teste novo" para criar um teste antes de registrar rodadas.', 'err');
        scrollLog();
        return;
      }
      var parsed = tokenizeResultString(seqPart);
      if(!parsed.results.length){
        printLine('Não entendi esse comando. Digite /ajuda para ver a sintaxe.', 'err');
        scrollLog();
        return;
      }
      while(parsed.results.length < atest.missions.length) parsed.results.push(null);
      var round = registerRound(parsed.results, parsed.invalidated, notePart);
      printLine('Rodada registrada ✓', 'ok');
      printBlock('<div style="margin-top:4px;">' + missionResultsHtml(atest, round.results) + '</div>');
      if(round.time !== null) printLine('⏱ tempo associado: ' + formatTime(round.time), 'dim');
      if(parsed.invalidated) printLine('⚠ rodada marcada como invalidada — não entra nas estatísticas', 'warn');
      if(notePart) printLine('# ' + notePart, 'dim');
      scrollLog();
      return;
    }

    printLine('Não entendi esse comando. Digite /ajuda para ver a sintaxe.', 'err');
    scrollLog();
  }

  function startMiniTest(count, missionIdx){
    if(!getActiveTest()){ printLine('Nenhum teste ativo. Use "/teste novo" para criar um teste antes.', 'err'); return; }
    if(count < 1 || count > 50){ printLine('Quantidade inválida para mini-teste.', 'err'); return; }
    pendingMini = {count:count, missionIdx: missionIdx, done:0, collected:[]};
    var t = getActiveTest();
    var label = missionIdx !== null ? (' focado em ' + missionsFor(t)[missionIdx].name) : '';
    printLine('Mini-teste iniciado: ' + count + ' rodadas' + label + '.', 'ok');
    printLine('Digite os resultados um de cada vez (ESC cancela).', 'dim');
  }

  function handleMiniRound(cmd){
    var trimmed = cmd.trim();
    if(!isResultLine(trimmed) && pendingMini.missionIdx === null){
      printLine('Esperando um resultado válido (ex: S N S).', 'err');
      return;
    }
    var round;
    if(pendingMini.missionIdx !== null){
      var single = trimmed.toUpperCase().replace(/\*/g,'').trim();
      if(single !== 'S' && single !== 'N'){ printLine('Esperando S ou N.', 'err'); return; }
      var res = missionsFor(getActiveTest()).map(function(){return null;});
      res[pendingMini.missionIdx] = (single === 'S');
      round = registerRound(res, false, '', 'focused', pendingMini.missionIdx);
    } else {
      var parsed = tokenizeResultString(trimmed);
      while(parsed.results.length < missionsFor(getActiveTest()).length) parsed.results.push(null);
      round = registerRound(parsed.results, parsed.invalidated, '');
    }
    pendingMini.done += 1;
    pendingMini.collected.push(round);
    printLine('  → rodada ' + pendingMini.done + '/' + pendingMini.count + ' ok', 'dim');

    if(pendingMini.done >= pendingMini.count){
      finishMiniTest();
    }
  }

  function finishMiniTest(){
    var rounds = pendingMini.collected;
    printLine('Mini-teste concluído ✓', 'ok');
    if(pendingMini.missionIdx !== null){
      var idx = pendingMini.missionIdx;
      var pct = missionPercent(rounds, idx);
      printLine(missionsFor(getActiveTest())[idx].name + ': ' + (pct===null?'—':pct+'%') + ' de sucesso nesta série', 'out');
    } else {
      missionsFor(getActiveTest()).forEach(function(m, i){
        var pct = missionPercent(rounds, i);
        printLine(m.name + ': ' + (pct===null?'—':pct+'%'), 'out');
      });
    }
    pendingMini = null;
  }

  function handleSystemCommand(trimmed){
    var body = trimmed.slice(1).trim(); // mantém maiúsculas/minúsculas originais
    var firstSpace = body.search(/\s/);
    var cmd = (firstSpace === -1 ? body : body.slice(0, firstSpace)).toLowerCase();
    var rest = firstSpace === -1 ? '' : body.slice(firstSpace).trim();

    if(cmd === 'ajuda' || cmd === 'help'){
      printLine('Abrindo a documentação em uma aba separada…', 'dim');
      var ajIdx = VIEWS.indexOf('ajuda');
      setTimeout(function(){ setView(ajIdx, {noFocus:true}); }, 120);
    } else if(cmd === 'teste'){
      if(rest){
        var subSpace = rest.search(/\s/);
        var sub = (subSpace === -1 ? rest : rest.slice(0, subSpace)).toLowerCase();
        if(sub === 'novo'){
          var name = subSpace === -1 ? '' : rest.slice(subSpace).trim();
          var nt = createNewTest(name);
          printLine('Novo teste criado: ' + nt.name, 'ok');
          printLine('Teste ativo agora: ' + nt.name, 'dim');
          return;
        }
        printLine('Subcomando desconhecido: /teste ' + sub, 'err');
        return;
      }
      if(!TESTS.length){
        printLine('Nenhum teste criado ainda. Digite "/teste novo" para começar.', 'warn');
        return;
      }
      TESTS.forEach(function(t){
        var pct = overallPercent(t.rounds);
        printLine((t.active?'▸ ':'  ') + t.name + '  —  ' + t.rounds.length + ' rodadas  —  ' + (pct===null?'—':pct+'%'), t.active?'ok':'out');
      });
    } else if(cmd === 'missao'){
      var t = getActiveTest();
      if(!t){ printLine('Nenhum teste ativo. Use "/teste novo" para criar um teste.', 'err'); return; }
      missionsFor(t).forEach(function(m, i){
        var pct = missionPercent(t.rounds, i);
        printLine(m.name + '  —  ' + (pct===null?'sem dados':pct+'% de sucesso'), 'out');
      });
    } else if(cmd === 'status'){
      var t2 = getActiveTest();
      if(!t2){ printLine('Nenhum teste ativo. Use "/teste novo" para criar um teste.', 'err'); return; }
      var valid = validRounds(t2.rounds).length;
      var invalid = t2.rounds.length - valid;
      printLine(t2.name, 'ok');
      printLine(t2.rounds.length + ' rodadas registradas', 'out');
      printLine(valid + ' rodadas válidas', 'out');
      printLine(invalid + ' rodada' + (invalid===1?'':'s') + ' invalidada' + (invalid===1?'':'s'), invalid?'warn':'out');
      var op = overallPercent(t2.rounds);
      printLine('Desempenho geral: ' + (op===null?'—':op+'%'), 'out');
    } else if(cmd === 'historico'){
      var at = getActiveTest();
      if(!at){ printLine('Nenhum teste ativo. Use "/teste novo" para criar um teste.', 'err'); return; }
      var rs = at.rounds.slice(-8);
      if(!rs.length){ printLine('Nenhuma rodada registrada neste teste ainda.', 'dim'); return; }
      rs.forEach(function(r){
        printLine('#' + r.id + '  ' + roundSeqLabel(r) + (r.invalidated?'  (invalidada)':'') + (r.correction?'  (corrigida)':''), r.invalidated?'dim':'out');
      });
    } else if(cmd === 'time'){
      setView(VIEWS.indexOf('time'), {noFocus:true});
    } else if(cmd === 'relatorio'){
      var all = allRounds();
      var valid2 = validRounds(all);
      printLine('Testes: ' + TESTS.length + '   Rodadas: ' + all.length + '   Válidas: ' + valid2.length, 'out');
      printLine('(cd relatorios para o relatório completo)', 'dim');
    } else if(cmd === 'resetar'){
      if(rest.toLowerCase() === 'confirmar'){
        wipeState();
        clearTerminal();
        printLine('Todos os dados foram apagados.', 'warn');
        refreshAllViews();
      } else {
        printLine('⚠ Isso apaga TODOS os testes, rodadas e observações salvas.', 'warn');
        printLine('Digite "/resetar confirmar" para confirmar.', 'dim');
      }
    } else if(cmd === 'voltar' || cmd === 'reload'){
      if(!ACTION_LOG.length){ printLine('Nada para desfazer.', 'dim'); return; }
      var lastAction = ACTION_LOG[ACTION_LOG.length - 1];
      askConfirm('A última ação foi: ' + lastAction.label + '. Deseja desfazer?', function(){
        var undone = undoLastAction();
        printLine('Desfeito: ' + undone.label, 'ok');
        refreshAllViews();
      });
    } else if(cmd === 'remover'){
      var rmSpace = rest.search(/\s/);
      var rmSub = (rmSpace === -1 ? rest : rest.slice(0, rmSpace)).toLowerCase();
      var rmArg = rmSpace === -1 ? '' : rest.slice(rmSpace).trim();
      if(rmSub === 'rodada'){
        var rid = parseInt(rmArg, 10);
        if(isNaN(rid)){ printLine('Uso: /remover rodada <id>', 'err'); return; }
        var loc = findRoundLocation(rid);
        if(!loc){ printLine('Rodada ' + rid + ' não encontrada.', 'err'); return; }
        askConfirm('Remover a rodada #' + rid + ' (' + roundSeqLabel(loc.round) + ') do teste "' + loc.test.name + '"?', function(){
          removeRoundById(rid);
          printLine('Rodada #' + rid + ' removida. Use /voltar para desfazer.', 'ok');
          refreshAllViews();
        });
      } else if(rmSub === 'teste'){
        var target = rmArg ? getTest(parseInt(rmArg,10)) : getActiveTest();
        if(!target){ printLine('Teste não encontrado.', 'err'); return; }
        askConfirm('Remover o teste "' + target.name + '" e suas ' + target.rounds.length + ' rodadas?', function(){
          removeTestById(target.id);
          printLine('Teste "' + target.name + '" removido. Use /voltar para desfazer.', 'ok');
          refreshAllViews();
        });
      } else {
        printLine('Uso: /remover rodada <id>  ou  /remover teste [id]', 'err');
      }
    } else if(cmd === 'selecionar' || cmd === 'select' || cmd === 'sel'){
      if(rest.trim() === '*'){ openSelectModal(); return; }
      if(!rest){
        if(!TESTS.length){ printLine('Nenhum teste criado ainda.', 'warn'); return; }
        TESTS.forEach(function(t){
          printLine((t.active?'▸ ':'  ') + t.id + '. ' + t.name + '  —  ' + t.rounds.length + ' rodadas', t.active?'ok':'out');
        });
        printLine('Use /selecionar <id>, /selecionar M2 ou /selecionar #tag', 'dim');
        return;
      }
      if(rest.charAt(0) === '#'){
        var tagQuery = rest.split(/\s+/).map(function(p){ return p.replace(/^#/,'').toLowerCase(); }).filter(Boolean);
        var roundMatches = allRounds().filter(function(r){
          return tagQuery.every(function(tg){ return (r.tags||[]).indexOf(tg) !== -1; });
        });
        var noteMatches = generalNotes.filter(function(n){
          return tagQuery.every(function(tg){ return (n.tags||[]).indexOf(tg) !== -1; });
        });
        if(!roundMatches.length && !noteMatches.length){ printLine('Nada encontrado com ' + rest, 'dim'); return; }
        roundMatches.forEach(function(r){
          printLine('#' + r.id + '  ' + roundSeqLabel(r) + (r.note ? '  — ' + r.note : ''), 'out');
        });
        noteMatches.forEach(function(n){
          printLine('nota (teste ' + n.testId + '): ' + n.text, 'dim');
        });
        return;
      }
      var mMatch = rest.match(/^M(\d+)$/i);
      if(mMatch){
        var midx = parseInt(mMatch[1],10) - 1;
        var atest = getActiveTest();
        if(!atest){ printLine('Nenhum teste ativo.', 'err'); return; }
        var mission = missionsFor(atest)[midx];
        if(!mission){ printLine('Missão inválida.', 'err'); return; }
        var pct = missionPercent(atest.rounds, midx);
        printLine(mission.name + '  —  ' + (pct===null?'sem dados':pct+'%'), 'ok');
        var relRounds = atest.rounds.filter(function(r){ return r.results[midx] !== null && r.results[midx] !== undefined; });
        relRounds.slice(-10).forEach(function(r){
          printLine('  #' + r.id + '  ' + resultLabel(r.results[midx]) + (r.note ? '  — ' + r.note : ''), 'dim');
        });
        return;
      }
      var tid = parseInt(rest, 10);
      var target2 = !isNaN(tid) ? getTest(tid) : TESTS.filter(function(t){ return t.name.toLowerCase() === rest.toLowerCase(); })[0];
      if(!target2){ printLine('Teste não encontrado: ' + rest, 'err'); return; }
      TESTS.forEach(function(t){ t.active = (t.id === target2.id); });
      saveState();
      printLine('Teste selecionado: ' + target2.name, 'ok');
    } else if(cmd === 'sincronizar'){
      openSyncModal();
    } else if(cmd === 'csv'){
      var csvSpace = rest.search(/\s/);
      var csvSub = (csvSpace === -1 ? rest : rest.slice(0, csvSpace)).toLowerCase();
      var csvArg = csvSpace === -1 ? '' : rest.slice(csvSpace).trim();
      if(csvSub === 'exportar'){
        var expTarget = csvArg ? getTest(parseInt(csvArg,10)) : getActiveTest();
        if(!expTarget){ printLine('Teste não encontrado.', 'err'); return; }
        exportCsv(expTarget);
        printLine('Exportando "' + expTarget.name + '.csv"…', 'ok');
      } else if(csvSub === 'importar'){
        printLine('Selecione um arquivo .csv…', 'dim');
        document.getElementById('csv-file-input').click();
      } else {
        printLine('Uso: /csv exportar [id]  ou  /csv importar', 'err');
      }
    } else {
      printLine('Comando desconhecido: /' + cmd, 'err');
    }
  }

  function roundSeqLabel(r){
    return r.results.map(function(v){ return resultLabel(v); }).join(' ');
  }

  function handleCorrection(trimmed){
    var m = trimmed.match(/^!\s*(\d+)\s*(.*)$/);
    if(!m){ printLine('Uso: !12  ou  !12 S S S # motivo', 'err'); return; }
    var id = parseInt(m[1],10);
    var rest = m[2].trim();
    var round = null;
    allRounds().forEach(function(r){ if(r.id === id) round = r; });
    if(!round){ printLine('Rodada ' + id + ' não encontrada.', 'err'); return; }

    if(!rest){
      printLine('Rodada ' + id, 'ok');
      if(round.correction){
        printLine('Original: ' + roundSeqLabel({results: round.correction.original}), 'out');
        printLine('Corrigido: ' + roundSeqLabel({results: round.correction.correctedTo}), 'out');
        printLine('Motivo: ' + round.correction.reason, 'dim');
      } else {
        printLine('Atual: ' + roundSeqLabel(round), 'out');
      }
      return;
    }

    var parts = rest.split('#');
    var seqPart = parts[0].trim();
    var reason = parts.length > 1 ? parts.slice(1).join('#').trim() : 'não informado';
    var parsed = tokenizeResultString(seqPart);
    if(!parsed.results.length){ printLine('Sequência de correção inválida.', 'err'); return; }
    while(parsed.results.length < missionsFor(getActiveTest()).length) parsed.results.push(null);

    var original = round.results.slice();
    var prevCorrection = round.correction;
    round.correction = { original: original, correctedTo: parsed.results, reason: reason };
    round.results = parsed.results;
    saveState();
    pushAction('corrigir rodada #' + id, function(){
      round.results = original;
      round.correction = prevCorrection;
    });

    printLine('Rodada ' + id, 'ok');
    printLine('Original: ' + roundSeqLabel({results: original}), 'dim');
    printLine('Novo resultado: ' + roundSeqLabel({results: parsed.results}), 'out');
    printLine('Motivo: ' + reason, 'dim');
  }

  /* ============ CSV — importação / exportação ============
     CSV é formato de importação/exportação, não armazenamento
     principal (o armazenamento principal continua sendo o estado
     salvo via saveState/loadState). */
  function exportCsv(test){
    var testMissions = missionsFor(test);
    var lines = ['#teste: ' + test.name, '#missoes: ' + testMissions.map(function(m){return m.name;}).join('|')];
    var header = ['id','invalidada','tempo'].concat(testMissions.map(function(m){return m.name;})).concat(['nota','tags']);
    lines.push(header.join(','));
    test.rounds.forEach(function(r){
      var vals = r.results.map(function(v){ if(v===null||v===undefined) return ''; if(v===true) return 'S'; if(v===false) return 'N'; return Number(v).toFixed(4); });
      var noteEsc = '"' + (r.note||'').replace(/"/g,'""') + '"';
      var tagsEsc = '"' + (r.tags||[]).join('|') + '"';
      lines.push([r.id, r.invalidated?1:0, typeof r.time === 'number' ? r.time : ''].concat(vals).concat([noteEsc, tagsEsc]).join(','));
    });
    var blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (test.name || 'teste').replace(/\s+/g,'_') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  function parseCsvLine(line){
    var out = [], cur = '', inQuotes = false;
    for(var i=0;i<line.length;i++){
      var c = line[i];
      if(inQuotes){
        if(c === '"'){
          if(line[i+1] === '"'){ cur += '"'; i++; } else { inQuotes = false; }
        } else { cur += c; }
      } else {
        if(c === '"'){ inQuotes = true; }
        else if(c === ','){ out.push(cur); cur = ''; }
        else { cur += c; }
      }
    }
    out.push(cur);
    return out;
  }

  function importCsvText(text, suggestedName){
    var rawLines = text.split(/\r?\n/).filter(function(l){ return l.trim() !== ''; });
    if(rawLines.length < 2){ printLine('Arquivo CSV vazio ou inválido.', 'err'); return; }
    var testName = suggestedName, missionNames = null, offset = 0;
    if(rawLines[0].indexOf('#teste:') === 0){ testName = rawLines[0].slice(7).trim() || suggestedName; offset++; }
    if(rawLines[offset] && rawLines[offset].indexOf('#missoes:') === 0){ missionNames = rawLines[offset].slice(9).split('|').map(function(s){return s.trim();}).filter(Boolean); offset++; }
    var lines = rawLines.slice(offset);
    if(lines.length < 2){ printLine('Arquivo CSV vazio ou inválido.', 'err'); return; }
    var header = parseCsvLine(lines[0]).map(function(h){ return h.trim().toLowerCase(); });
    var invalidCol = header.indexOf('invalidada');
    var timeCol = header.indexOf('tempo');
    var noteCol = header.indexOf('nota');
    var tagsCol = header.indexOf('tags');
    var reserved = {id:1,invalidada:1,tempo:1,nota:1,tags:1}, missionCols=[];
    header.forEach(function(h,i){if(!reserved[h])missionCols.push(i);});
    if(!missionNames) missionNames = missionCols.map(function(ci,i){return header[ci] || ('Missão '+(i+1));});
    var t = createNewTest(testName, missionNames);
    var imported = [];
    for(var i=1;i<lines.length;i++){
      var cols = parseCsvLine(lines[i]);
      var results = missionCols.slice(0,t.missions.length).map(function(ci){
        var v = (cols[ci]||'').trim().toUpperCase();
        if(v === 'S') return true;
        if(v === 'N') return false;
        if(v !== '' && !isNaN(parseFloat(v))) return parseFloat(v);
        return null;
      });
      while(results.length<t.missions.length) results.push(null);
      var invalidated = invalidCol !== -1 && /^(1|true)$/i.test((cols[invalidCol]||'').trim());
      var note = noteCol !== -1 ? cols[noteCol] : '';
      var tags = (tagsCol !== -1 && cols[tagsCol]) ? cols[tagsCol].split('|').filter(Boolean) : extractTags(note);
      var time = timeCol !== -1 && cols[timeCol] !== '' && !isNaN(parseFloat(cols[timeCol])) ? parseFloat(cols[timeCol]) : null;
      imported.push(makeRound(t.id, results, {invalidated:invalidated, note:note, tags:tags, time:time}));
    }
    t.rounds = imported;
    saveState();
    printLine('Importação concluída: ' + imported.length + ' rodadas em "' + t.name + '". Use /voltar para desfazer.', 'ok');
    refreshAllViews();
  }

  document.getElementById('csv-file-input').addEventListener('change', function(e){
    var file = e.target.files && e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      var suggested = file.name.replace(/\.csv$/i,'').replace(/_/g,' ');
      importCsvText(String(reader.result), suggested);
      scrollLog();
    };
    reader.onerror = function(){ printLine('Não foi possível ler o arquivo.', 'err'); scrollLog(); };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  });

  /* ============ Autocompletamento ============ */
  var ghost = document.getElementById('term-ghost');
  var AUTOCOMPLETE_CMDS = [
    '/ajuda', '/help', '/teste', '/teste novo', '/missao', '/status', '/historico',
    '/relatorio', '/resetar confirmar', '/time',
    '/voltar', '/remover rodada ', '/remover teste',
    '/selecionar', '/sincronizar', '/csv exportar', '/csv importar',
    'cd dashboard', 'cd relatorios', 'cd dados', 'cd ajuda', 'cd terminal', 'cd time',
    'cls'
  ];
  var currentSuggestion = null;

  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function computeSuggestion(val){
    if(!val) return null;
    var lower = val.toLowerCase();
    var found = null;
    for(var i=0;i<AUTOCOMPLETE_CMDS.length;i++){
      var c = AUTOCOMPLETE_CMDS[i];
      if(c.length > val.length && c.toLowerCase().indexOf(lower) === 0){ found = c; break; }
    }
    return found;
  }

  function updateGhost(){
    // não sugere no meio de um mini-teste (entrada é sempre S/N ali)
    var val = input.value;
    if(pendingMini){ currentSuggestion = null; ghost.innerHTML = ''; return; }
    var sug = computeSuggestion(val);
    currentSuggestion = sug;
    if(!sug){ ghost.innerHTML = ''; return; }
    ghost.innerHTML = '<span class="typed">' + escapeHtml(val) + '</span>' +
                       '<span class="rest">' + escapeHtml(sug.slice(val.length)) + '</span>';
  }

  function acceptSuggestion(){
    if(!currentSuggestion) return false;
    input.value = currentSuggestion;
    updateGhost();
    setTimeout(function(){ input.setSelectionRange(input.value.length, input.value.length); }, 0);
    return true;
  }

  input.addEventListener('input', updateGhost);

  function submitInput(){
    var val = input.value;
    if(val.trim() === '' && !pendingMini && !pendingConfirm) return;
    history.push(val);
    histPos = history.length;
    input.value = '';
    updateGhost();
    handleCommand(val);
    scrollLog();
    input.focus();
  }

  document.getElementById('term-enter-btn').addEventListener('click', submitInput);

  input.addEventListener('keydown', function(e){
    if(e.key === 'Tab'){
      if(acceptSuggestion()) e.preventDefault();
      return;
    }
    if(e.key === 'ArrowRight' && currentSuggestion && input.selectionStart === input.value.length){
      e.preventDefault();
      acceptSuggestion();
      return;
    }
    if(e.key === 'Enter'){
      submitInput();
    } else if(e.key === 'ArrowUp'){
      if(history.length){
        e.preventDefault();
        histPos = Math.max(0, histPos - 1);
        input.value = history[histPos] || '';
        updateGhost();
        setTimeout(function(){ input.setSelectionRange(input.value.length, input.value.length); },0);
      }
    } else if(e.key === 'ArrowDown'){
      if(history.length){
        e.preventDefault();
        histPos = Math.min(history.length, histPos + 1);
        input.value = history[histPos] || '';
        updateGhost();
      }
    } else if(e.key === 'Escape'){
      if(pendingMini){
        printLine('Mini-teste cancelado.', 'warn');
        pendingMini = null;
      }
      if(pendingConfirm){
        printLine('Nada foi alterado.', 'dim');
        pendingConfirm = null;
      }
      input.value = '';
      updateGhost();
    }
  });

  /* ============ Redimensionar o terminal (arrastar) ============ */
  (function setupResize(){
    var handle = document.getElementById('term-resize');
    var dock = document.getElementById('terminal-dock');
    var dragging = false, startY = 0, startH = 0;
    handle.addEventListener('pointerdown', function(e){
      if(document.getElementById('app').classList.contains('terminal-expanded')) return;
      dragging = true;
      startY = e.clientY;
      startH = dock.getBoundingClientRect().height;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var delta = startY - e.clientY;
      var newH = Math.min(Math.max(startH + delta, 120), Math.round(window.innerHeight * 0.8));
      dock.style.height = newH + 'px';
    });
    function endDrag(){ dragging = false; }
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  })();

  document.getElementById('term-scroll').addEventListener('click', function(e){
    if(e.target === log || e.target.closest('#term-log')) input.focus();
  });

  function bootTerminal(){
    printLine('OBBY — Robot Test System', 'ok');
    printLine('Terminal pronto. Digite /ajuda para ver os comandos.', 'dim');
    var t = getActiveTest();
    if(t){
      printLine('Teste ativo: ' + t.name, 'dim');
    } else {
      printLine('Nenhum teste criado ainda. Digite "/teste novo" para começar.', 'warn');
    }
    printLine('', 'dim');
  }

  function refreshAllViews(){
    renderDashboard(); renderRelatorios();
    if(VIEWS[currentView] === 'dados') renderDados();
  }

