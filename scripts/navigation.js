"use strict";

  /* ============ View / routing state ============ */
  var VIEWS = ['terminal','dashboard','evolucao','relatorios','dados','ajuda'];
  var VIEW_LABELS = {terminal:'TERMINAL', dashboard:'DASHBOARD', evolucao:'EVOLUÇÃO', relatorios:'RELATÓRIOS', dados:'DADOS', ajuda:'AJUDA'};
  var currentView = 0;

  function setView(idx, opts){
    opts = opts || {};
    if(idx < 0) idx = 0;
    if(idx > VIEWS.length-1) idx = VIEWS.length-1;
    currentView = idx;
    var name = VIEWS[idx];
    var isTerminal = name === 'terminal';
    document.getElementById('app').classList.toggle('terminal-expanded', isTerminal);
    document.querySelectorAll('main .view').forEach(function(v){ v.classList.remove('active'); });
    if(!isTerminal){
      document.getElementById('view-'+name).classList.add('active');
    }
    document.querySelectorAll('#tabs button').forEach(function(b,i){ b.classList.toggle('active', i===idx); });
    document.getElementById('path-seg').textContent = '/' + name;
    document.getElementById('bottomnav-text').textContent = VIEW_LABELS[name];
    document.querySelectorAll('#bottomnav-dots i').forEach(function(d,i){ d.classList.toggle('on', i===idx); });
    if(name === 'dashboard') renderDashboard();
    if(name === 'evolucao') renderEvolucao();
    if(name === 'relatorios') renderRelatorios();
    if(name === 'dados') renderDados();
    if(name === 'ajuda') renderAjuda();
    if(isTerminal && !opts.noFocus) input.focus();
  }

  document.querySelectorAll('#tabs button').forEach(function(btn, i){
    btn.addEventListener('click', function(){ setView(i); });
  });
  document.getElementById('nav-left').addEventListener('click', function(){ setView(currentView-1); });
  document.getElementById('nav-right').addEventListener('click', function(){ setView(currentView+1); });

  document.addEventListener('keydown', function(e){
    var input = document.getElementById('term-input');
    var typing = document.activeElement === input && input.value.length > 0;
    if((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !typing){
      e.preventDefault();
      setView(currentView + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });

