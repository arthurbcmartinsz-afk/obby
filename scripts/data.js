"use strict";

  /* ============ Data model ============ */
  var DEFAULT_MISSIONS = ['Missão 1 — Rampa', 'Missão 2 — Entrega do Carrinho', 'Missão 3 — Triângulos'];
  var LEGACY_STORAGE_KEY = 'obby_data_v1';
  var STORAGE_KEY = 'obby_data_v2';
  var BACKUP_FORMAT = 'obby-backup';
  var BACKUP_FORMAT_VERSION = 1;

  var TESTS = [];
  var generalNotes = [];
  var roundSeq = 0;
  var testSeq = 0;
  var stateExtras = {};
  function missionsFor(test){
    if(test && Array.isArray(test.missions) && test.missions.length) return test.missions;
    return DEFAULT_MISSIONS.map(function(name, i){ return {id:'m'+(i+1), name:name}; });
  }

  /* IndexedDB is the preferred local store; localStorage is the synchronous
     boot cache. Online sync still needs an API and a shared backend. */
  var STORAGE_BACKEND = (typeof window !== 'undefined' && window.indexedDB) ? 'indexeddb' : 'localStorage';
  var idbHandle = null;
  var idbReady = false;
  function openIdb(){
    if(!window.indexedDB) return;
    try{
      var request = window.indexedDB.open('obby_db', 2);
      request.onupgradeneeded = function(e){ if(!e.target.result.objectStoreNames.contains('kv')) e.target.result.createObjectStore('kv'); };
      request.onsuccess = function(e){ idbHandle = e.target.result; idbReady = true; idbLoadThenReconcile(); };
      request.onerror = function(){ idbHandle = null; };
    }catch(e){ idbHandle = null; }
  }
  function idbLoadThenReconcile(){
    if(!idbHandle) return;
    try{
      var request = idbHandle.transaction('kv','readonly').objectStore('kv').get(STORAGE_KEY);
      request.onsuccess = function(){
        var data = request.result;
        if(data && Array.isArray(data.TESTS) && (data.roundSeq||0) >= roundSeq){
          TESTS=data.TESTS; generalNotes=Array.isArray(data.generalNotes)?data.generalNotes:[];
          stateExtras={}; Object.keys(data).forEach(function(key){if(['TESTS','generalNotes','roundSeq','testSeq'].indexOf(key)===-1)stateExtras[key]=data[key];});
          roundSeq=data.roundSeq||0; testSeq=data.testSeq||computeTestSeq();
          saveState();
          refreshAllViewsSafe();
        }else if(!data) idbMirrorSave();
      };
    }catch(e){ /* best effort */ }
  }
  function idbMirrorSave(){
    if(!idbHandle) return;
    try{
      var tx = idbHandle.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(Object.assign({},stateExtras,{TESTS:TESTS,generalNotes:generalNotes,roundSeq:roundSeq,testSeq:testSeq}), STORAGE_KEY);
    }catch(e){ /* best effort */ }
  }

  function computeTestSeq(){ return TESTS.length ? Math.max.apply(null, TESTS.map(function(t){return t.id;})) : 0; }
  function nextRoundId(){ roundSeq += 1; return roundSeq; }
  function nextTestId(){ testSeq += 1; return testSeq; }

  function makeRound(testId, results, opts){
    opts = opts || {};
    return {
      id: nextRoundId(),
      testId: testId,
      results: results,
      time: typeof opts.time === 'number' ? opts.time : null,
      invalidated: !!opts.invalidated,
      note: opts.note || '',
      tags: opts.tags || [],
      type: opts.type || 'full',
      focusedMission: typeof opts.focusedMission === 'number' ? opts.focusedMission : null,
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
      var data = Object.assign({},stateExtras,{TESTS:TESTS,generalNotes:generalNotes,roundSeq:roundSeq,testSeq:testSeq});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }catch(e){
      console.warn('OBBY: não foi possível salvar os dados', e);
    }
    idbMirrorSave(); // best-effort, assíncrono — não bloqueia a UI
  }

  function loadState(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      var data = JSON.parse(raw);
      if(!data || !Array.isArray(data.TESTS)) return false;
      stateExtras={}; Object.keys(data).forEach(function(key){if(['TESTS','generalNotes','roundSeq','testSeq'].indexOf(key)===-1)stateExtras[key]=data[key];});
      TESTS = data.TESTS;
      TESTS.forEach(function(test){
        if(!Array.isArray(test.missions)) test.missions = DEFAULT_MISSIONS.map(function(name, i){return {id:'t'+test.id+'m'+(i+1),name:name};});
        test.rounds = Array.isArray(test.rounds) ? test.rounds : [];
        test.rounds.forEach(function(round){ if(typeof round.time !== 'number') round.time = null; });
      });
      generalNotes = Array.isArray(data.generalNotes) ? data.generalNotes : [];
      roundSeq = typeof data.roundSeq === 'number' ? data.roundSeq : 0;
      testSeq = typeof data.testSeq === 'number' ? data.testSeq : computeTestSeq();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({},stateExtras,{TESTS:TESTS,generalNotes:generalNotes,roundSeq:roundSeq,testSeq:testSeq})));
      return true;
    }catch(e){
      console.warn('OBBY: não foi possível carregar os dados salvos', e);
      return false;
    }
  }

  /* Lê novamente a fonte persistida para que o backup preserve o JSON
     original, inclusive campos que versões futuras do OBBY possam incluir. */
  function readPersistedStateForBackup(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      var state = JSON.parse(raw);
      if(!state || typeof state !== 'object' || !Array.isArray(state.TESTS)) return null;
      return state;
    }catch(e){
      console.warn('OBBY: não foi possível preparar o backup', e);
      return null;
    }
  }

  function hasPersistedDataForBackup(state){
    if(!state) return false;
    if(state.TESTS.length) return true;
    if(Array.isArray(state.generalNotes) && state.generalNotes.length) return true;
    if(typeof state.roundSeq === 'number' && state.roundSeq !== 0) return true;
    return Object.keys(state).some(function(key){
      return key !== 'TESTS' && key !== 'generalNotes' && key !== 'roundSeq' && key !== 'testSeq';
    });
  }

  function createObbyBackup(){
    var state = readPersistedStateForBackup();
    if(!hasPersistedDataForBackup(state)) return null;
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      storageKey: STORAGE_KEY,
      state: state
    };
  }

  var hadSavedData = loadState();
  openIdb();

  function wipeState(){
    TESTS = [];
    generalNotes = [];
    roundSeq = 0;
    testSeq = 0;
    stateExtras = {};
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

  function createNewTest(name, missionNames){
    TESTS.forEach(function(t){ t.active = false; });
    var nextId = nextTestId();
    var finalName = name || ('Teste ' + (nextId < 10 ? '0'+nextId : nextId));
    var names = missionNames && missionNames.length ? missionNames : DEFAULT_MISSIONS;
    var missions = names.map(function(n, i){ return {id:'t'+nextId+'m'+(i+1), name:n || ('Missão '+(i+1))}; });
    var t = { id: nextId, name: finalName, rounds: [], active: true, missions: missions, tags: [] };
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

  function resultValue(value){
    if(value === null || value === undefined) return null;
    if(value === true) return 1;
    if(value === false) return 0;
    return value;
  }

  function missionPercent(rounds, idx){
    var vals = [];
    validRounds(rounds).forEach(function(r){ var value = resultValue(r.results[idx]); if(value !== null) vals.push(value); });
    if(!vals.length) return null;
    return Math.round(vals.reduce(function(a,b){return a+b;},0) / vals.length * 100);
  }

  function overallPercent(rounds){
    var vals = [];
    validRounds(rounds).forEach(function(r){
      r.results.forEach(function(v){ var value = resultValue(v); if(value !== null) vals.push(value); });
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

