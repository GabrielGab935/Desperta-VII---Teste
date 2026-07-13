(function(){

  /* =====================================================================
     FONTE DE DADOS
     -------------------------------------------------------------------
     Em produção, isto vem do backend Flask (/api/events), que por sua vez
     lê a planilha do Google Sheets. Veja o pacote "backend/" para o script
     Flask + Google Sheets pronto para configurar.

     Estrutura esperada de cada evento (igual ao JSON que o Flask devolve):
     {
       id: string,
       titulo: string,
       categoria: string,        // ex: "Retiro", "Encontro", "Jantar"...
       cor: "#RRGGBB",           // cor definida na planilha para a categoria
       data_inicio: "YYYY-MM-DD",
       data_fim: "YYYY-MM-DD",   // opcional, para eventos de vários dias
       horario: string,
       local: string,
       descricao: string,
       cronograma: [ { horario: string, atividade: string }, ... ]
     }
  ===================================================================== */

  const API_URL = '/api/events'; // ex: "https://seu-backend.exemplo.com/api/events"

   /* const PLACEHOLDER_EVENTS = [
      {
        id: 'setimo-desperta',
        titulo: 'O sétimo Desperta',
        categoria: 'Retiro',
        cor: '#c9a869',
        data_inicio: '2026-11-27',
        data_fim: '2026-11-29',
        horario: 'A partir das 18h',
        local: 'Sítio Monte Horebe',
        descricao: 'Três dias de retiro para renovar a fé, fortalecer laços e viver momentos de comunhão e adoração em comunidade.',
        cronograma: [
          {horario:'Sex · 18h', atividade:'Chegada e acolhida'},
          {horario:'Sex · 20h', atividade:'Noite de abertura e adoração'},
          {horario:'Sáb · 09h', atividade:'Palavra e dinâmicas em grupo'},
          {horario:'Sáb · 20h', atividade:'Jantar de comunhão'},
          {horario:'Dom · 10h', atividade:'Celebração de encerramento'}
        ]
      },
  ];*/

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const weekdayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const heroRange = document.getElementById('heroRange');
  const heroMonth = document.getElementById('heroMonth');
  const heroTitle = document.getElementById('heroTitle');
  const heroDesc = document.getElementById('heroDesc');
  const calMonth = document.getElementById('calMonth');
  const calYear = document.getElementById('calYear');
  const calWeekdays = document.getElementById('calWeekdays');
  const calDays = document.getElementById('calDays');
  const calEmptyMsg = document.getElementById('calEmptyMsg');
  const calPrev = document.getElementById('calPrev');
  const calNext = document.getElementById('calNext');
  const legendEl = document.getElementById('legend');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalCard = document.getElementById('modalCard');

  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-indexed
  let events = [];

  function toKey(y,m,d){
    return y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
  }

  // expands multi-day events (data_inicio..data_fim) into individual date keys
  function eventsByDate(list){
    const map = {};
    list.forEach(function(ev){
      const start = new Date(ev.data_inicio + 'T00:00:00');
      const end = ev.data_fim ? new Date(ev.data_fim + 'T00:00:00') : start;
      const cursor = new Date(start);
      while(cursor <= end){
        const key = toKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        if(!map[key]) map[key] = [];
        map[key].push(ev);
        cursor.setDate(cursor.getDate()+1);
      }
    });
    return map;
  }

  function renderWeekdayHeader(){
    calWeekdays.innerHTML = weekdayNames.map(function(w){
      return '<div class="cal-weekday">'+w+'</div>';
    }).join('');
  }

  function formatRange(ev){
    const start = new Date(ev.data_inicio + 'T00:00:00');
    if(!ev.data_fim || ev.data_fim === ev.data_inicio){
      return String(start.getDate());
    }
    const end = new Date(ev.data_fim + 'T00:00:00');
    return start.getDate() + '—' + end.getDate();
  }

  function renderHero(){
    // shows the next upcoming (or currently happening) event as the highlight
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const upcoming = events
      .map(function(ev){ return {ev:ev, start:new Date(ev.data_inicio+'T00:00:00'), end:new Date((ev.data_fim||ev.data_inicio)+'T00:00:00')}; })
      .filter(function(x){ return x.end >= now; })
      .sort(function(a,b){ return a.start - b.start; });

    if(upcoming.length === 0){
      heroRange.textContent = '—';
      heroMonth.innerHTML = '&nbsp;';
      heroTitle.textContent = 'Nenhum evento marcado';
      heroDesc.textContent = 'Assim que novas datas forem cadastradas na agenda, elas aparecem aqui automaticamente.';
      return;
    }

    const next = upcoming[0].ev;
    heroRange.textContent = formatRange(next);
    heroMonth.textContent = monthNames[upcoming[0].start.getMonth()].toUpperCase() + ' ' + upcoming[0].start.getFullYear();
    heroTitle.textContent = next.titulo;
    heroDesc.textContent = 'Toque nos dias em destaque no calendário para conhecer a programação completa do evento.';
  }

  function renderLegend(map){
    const seen = {};
    const items = [];
    events.forEach(function(ev){
      const start = new Date(ev.data_inicio+'T00:00:00');
      const end = new Date((ev.data_fim||ev.data_inicio)+'T00:00:00');
      const inView = start.getFullYear() === viewYear && start.getMonth() === viewMonth ||
                     end.getFullYear() === viewYear && end.getMonth() === viewMonth;
      if(!inView || seen[ev.categoria]) return;
      seen[ev.categoria] = true;
      items.push(ev);
    });

    if(items.length === 0){
      legendEl.innerHTML = '';
      return;
    }

    legendEl.innerHTML = items.map(function(ev){
      return '<div class="legend-item"><span class="legend-swatch" style="background:'+ev.cor+'"></span>'+ev.categoria+'</div>';
    }).join('') + '<div class="legend-hint">Toque para ver detalhes</div>';
  }

  function renderCalendar(){
    calMonth.textContent = monthNames[viewMonth];
    calYear.textContent = viewYear;

    const map = eventsByDate(events);
    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
    const startOffset = firstDay.getDay(); // 0 = domingo

    let html = '';
    for(let i=0;i<startOffset;i++){
      html += '<div class="cal-day empty"></div>';
    }

    for(let d=1; d<=daysInMonth; d++){
      const key = toKey(viewYear, viewMonth, d);
      const dayEvents = map[key];
      const isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && d === today.getDate();
      let cls = 'cal-day';
      let style = '';
      let dot = '';
      if(isToday) cls += ' today';
      if(dayEvents && dayEvents.length){
        cls += ' event';
        style = 'style="background:'+dayEvents[0].cor+'"';
        dot = '<span class="dot"></span>';
        html += '<div class="'+cls+'" '+style+' data-key="'+key+'" tabindex="0" role="button" aria-label="'+dayEvents[0].titulo+', dia '+d+'">'+dot+d+'</div>';
      } else {
        html += '<div class="'+cls+'">'+d+'</div>';
      }
    }

    calDays.innerHTML = html;
    calEmptyMsg.style.display = Object.keys(map).some(function(k){
      const [y,m] = k.split('-').map(Number);
      return y === viewYear && (m-1) === viewMonth;
    }) ? 'none' : 'flex';

    renderLegend(map);

    calDays.querySelectorAll('.cal-day.event').forEach(function(el){
      el.addEventListener('click', function(){ openModal(map[el.dataset.key]); });
      el.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openModal(map[el.dataset.key]); }
      });
    });
  }

  function openModal(dayEvents){
    // if more than one event shares the date, show them stacked in the same card
    modalCard.innerHTML = dayEvents.map(function(ev){
      const schedule = (ev.cronograma||[]).map(function(item){
        return '<li><span class="schedule-time display">'+item.horario+'</span><span class="schedule-activity">'+item.atividade+'</span></li>';
      }).join('');

      return '<div class="modal-badge"><span class="dot" style="background:'+ev.cor+'"></span>'+ev.categoria+'</div>'+
        '<h3 class="modal-title display">'+ev.titulo+'</h3>'+
        '<div class="modal-meta">'+
          '<span>📅 '+formatFullDate(ev)+'</span>'+
          (ev.horario ? '<span>🕐 '+ev.horario+'</span>' : '')+
          (ev.local ? '<span>📍 '+ev.local+'</span>' : '')+
        '</div>'+
        (ev.descricao ? '<p class="modal-desc">'+ev.descricao+'</p>' : '')+
        (schedule ? '<div class="modal-schedule-title">Programação</div><ul class="modal-schedule">'+schedule+'</ul>' : '');
    }).join('<div style="height:1px;background:rgba(42,38,32,0.12);margin:26px 0;"></div>');

    modalCard.innerHTML = '<button class="modal-close" id="modalClose" aria-label="Fechar">×</button>' + modalCard.innerHTML;
    document.getElementById('modalClose').addEventListener('click', closeModal);
    modalOverlay.classList.add('open');
  }

  function formatFullDate(ev){
    const start = new Date(ev.data_inicio+'T00:00:00');
    const startStr = start.getDate()+' de '+monthNames[start.getMonth()];
    if(!ev.data_fim || ev.data_fim === ev.data_inicio) return startStr;
    const end = new Date(ev.data_fim+'T00:00:00');
    if(end.getMonth() === start.getMonth()) return start.getDate()+'—'+end.getDate()+' de '+monthNames[start.getMonth()];
    return startStr+' a '+end.getDate()+' de '+monthNames[end.getMonth()];
  }

  function closeModal(){
    modalOverlay.classList.remove('open');
  }

  modalOverlay.addEventListener('click', function(e){
    if(e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeModal();
  });

  calPrev.addEventListener('click', function(){
    viewMonth--; if(viewMonth < 0){ viewMonth = 11; viewYear--; }
    renderCalendar();
  });
  calNext.addEventListener('click', function(){
    viewMonth++; if(viewMonth > 11){ viewMonth = 0; viewYear++; }
    renderCalendar();
  });

  function init(events_){
    events = events_;
    renderWeekdayHeader();
    renderHero();
    renderCalendar();
  }

  if(API_URL){
    fetch(API_URL)
      .then(function(r){ return r.json(); })
      .then(function(data){ init(data); })
      .catch(function(err){
        console.warn('Não foi possível carregar /api/events, usando dados de exemplo.', err);
        init(PLACEHOLDER_EVENTS);
      });
  } else {
    init(PLACEHOLDER_EVENTS);
  }

})();