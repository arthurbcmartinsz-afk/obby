"use strict";

  /* ============ Data model ============ */
  var MISSIONS = [
    {id:'m1', name:'Missão 1', label:'Rampa'},
    {id:'m2', name:'Missão 2', label:'Entrega do Carrinho'},
    {id:'m3', name:'Missão 3', label:'Triângulos'}
  ];

  var STORAGE_KEY = 'obby_data_v1';

  var TESTS = [];
  var generalNotes = [];
  var roundSeq = 0;

  /* ============ IndexedDB — cache local (seção 11 do espec) ============
     Armazenamento principal estruturado (banco online, ex: PostgreSQL)
     e sincronização entre contas/dispositivos dependem de um backend
     real (API + servidor), que não existe neste protótipo estático —
     por isso ficam marcados como pendentes na aba "Dados". O que É
     possível fazer só no navegador é o cache local: aqui o OBBY usa
     IndexedDB quando disponível (com localStorage como leitura/escrita
     síncrona garantida no boot), espelhando cada saveState() também no
     IndexedDB de forma assíncrona, sem bloquear a interface. */
  var STORAGE_BACKEND = (typeof window !== 'undefined' && window.indexedDB) ? 'indexeddb' : 'localStorage';
  var idbHandle = null;
  if(STORAGE_BACKEND === 'indexeddb'){
    try{
      var idbReq = window.indexedDB.open('obby_db', 1);
      idbReq.onupgradeneeded = function(e){
        var db = e.target.result;
        if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      idbReq.onsuccess = function(e){ idbHandle = e.target.result; idbMirrorSave(); };
      idbReq.onerror = function(){ STORAGE_BACKEND = 'localStorage'; };
    }catch(e){ STORAGE_BACKEND = 'localStorage'; }
  }
  function idbMirrorSave(){
    if(!idbHandle) return;
    try{
      var tx = idbHandle.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ TESTS: TESTS, generalNotes: generalNotes, roundSeq: roundSeq }, STORAGE_KEY);
    }catch(e){ /* cache best-effort — localStorage continua sendo a fonte confiável */ }
  }

  function nextRoundId(){ roundSeq += 1; return roundSeq; }

  function makeRound(testId, results, opts){
    opts = opts || {};
    return {
      id: nextRoundId(),
      testId: testId,
      results: results, // [bool|null, bool|null, bool|null]
      invalidated: !!opts.invalidated,
      note: opts.note || '',
      tags: opts.tags || [],
      type: opts.type || 'full',
      focusedMission: opts.focusedMission || null,
      correction: null
    };
  }

  /* extrai #tags de um texto, sem remover as tags do texto original */
  function extractTags(text){
    var tags = [];
    var re = /#([a-zA-Z0-9_ÀÁÂÃÉÊÍÓÔÕÚÜÇàáâãéêíóôõúüç]+)/g;
    var m;
    while((m = re.exec(text || ''))){
      var tag = m[1].toLowerCase();
      if(tags.indexOf(tag) === -1) tags.push(tag);
    }
    return tags;
  }

  /* ============ Persistência (localStorage) ============
     Nada de dados pré-carregados: tudo começa vazio e só existe
     o que o usuário efetivamente registrar. Cada mudança de estado
     é salva imediatamente, e recarregada ao abrir a página. */
  function saveState(){
    try{
      var data = { TESTS: TESTS, generalNotes: generalNotes, roundSeq: roundSeq };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }catch(e){
      console.warn('OBBY: não foi possível salvar os dados', e);
    }
    idbMirrorSave(); // best-effort, assíncrono — não bloqueia a UI
  }

  function loadState(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return false;
      var data = JSON.parse(raw);
      if(!data || !Array.isArray(data.TESTS)) return false;
      TESTS = data.TESTS;
      generalNotes = Array.isArray(data.generalNotes) ? data.generalNotes : [];
      roundSeq = typeof data.roundSeq === 'number' ? data.roundSeq : 0;
      return true;
    }catch(e){
      console.warn('OBBY: não foi possível carregar os dados salvos', e);
      return false;
    }
  }

  var hadSavedData = loadState();

  function wipeState(){
    TESTS = [];
    generalNotes = [];
    roundSeq = 0;
    saveState();
    ACTION_LOG = [];
  }

  function getActiveTest(){ return TESTS.filter(function(t){return t.active;})[0]; }
  function getTest(id){ return TESTS.filter(function(t){return t.id===id;})[0]; }
  function allRounds(){ return TESTS.reduce(function(acc,t){return acc.concat(t.rounds);}, []); }

  /* ============ Histórico de alterações / /voltar ============
     Cada operação que muda dados empilha uma ação com uma função
     de desfazer. /voltar desfaz a última alteração de dados
     (não apenas a última rodada), sempre pedindo confirmação. */
  var ACTION_LOG = [];
  var ACTION_LOG_LIMIT = 300;

  function pushAction(label, undoFn){
    ACTION_LOG.push({ label: label, undo: undoFn });
    if(ACTION_LOG.length > ACTION_LOG_LIMIT) ACTION_LOG.shift();
  }

  function undoLastAction(){
    if(!ACTION_LOG.length) return null;
    var action = ACTION_LOG.pop();
    action.undo();
    saveState();
    return action;
  }

  function createNewTest(name){
    TESTS.forEach(function(t){ t.active = false; });
    var nextId = TESTS.length ? Math.max.apply(null, TESTS.map(function(t){return t.id;})) + 1 : 1;
    var finalName = name || ('Teste ' + (nextId < 10 ? '0'+nextId : nextId));
    var t = { id: nextId, name: finalName, rounds: [], active: true, tags: [] };
    TESTS.push(t);
    saveState();
    pushAction('criar teste "' + t.name + '"', function(){
      var idx = TESTS.indexOf(t);
      if(idx !== -1) TESTS.splice(idx, 1);
    });
    return t;
  }

  /* ============ Stats helpers ============ */
  function validRounds(rounds){ return rounds.filter(function(r){ return !r.invalidated; }); }

  function missionPercent(rounds, idx){
    var relevant = validRounds(rounds).filter(function(r){ return r.results[idx] !== null && r.results[idx] !== undefined; });
    if(!relevant.length) return null;
    var succ = relevant.filter(function(r){ return r.results[idx]; }).length;
    return Math.round(succ / relevant.length * 100);
  }

  function overallPercent(rounds){
    var vals = [];
    validRounds(rounds).forEach(function(r){
      r.results.forEach(function(v){ if(v !== null && v !== undefined) vals.push(v ? 1 : 0); });
    });
    if(!vals.length) return null;
    return Math.round(vals.reduce(function(a,b){return a+b;},0) / vals.length * 100);
  }

  function testSnapshot(test){
    return {
      testId: test.id,
      name: test.name,
      overall: overallPercent(test.rounds),
      m1: missionPercent(test.rounds, 0),
      m2: missionPercent(test.rounds, 1),
      m3: missionPercent(test.rounds, 2)
    };
  }

