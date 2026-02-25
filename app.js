// app.js (Netlify + GitHub multiusuario)
(() => {
  // Usa /api/characters si tienes el redirect en netlify.toml
  // Si no, deja "/.netlify/functions/characters"
  const API_URL = "/api/characters";

  /** @type {ReturnType<typeof structuredClone>} */
  let state = [];

  // UI refs
  const elCards = document.getElementById("cards");
  const elNav = document.getElementById("sectionNav");
  const elStats = document.getElementById("stats");
  const elQ = document.getElementById("q");
  const elClear = document.getElementById("clearSearch");

  const btnAdd = document.getElementById("btnAdd");
  const btnCopy = document.getElementById("btnCopy");
  const btnReset = document.getElementById("btnReset");

  const btnToggleSidebar = document.getElementById("btnToggleSidebar");
  const sidebar = document.getElementById("sidebar");

  // Mobile FAB
  const mCopy = document.getElementById("mCopy");
  const mAdd = document.getElementById("mAdd");

  // Modal refs
  const modal = document.getElementById("modal");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalClose = document.getElementById("modalClose");
  const form = document.getElementById("form");
  const fId = document.getElementById("fId");
  const fName = document.getElementById("fName");
  const fIcon = document.getElementById("fIcon");
  const fBlock = document.getElementById("fBlock");
  const fSubgroup = document.getElementById("fSubgroup");
  const fOccupied = document.getElementById("fOccupied");
  const btnDelete = document.getElementById("btnDelete");
  const btnCancel = document.getElementById("btnCancel");
  const modalTitle = document.getElementById("modalTitle");

  // Toast
  const toast = document.getElementById("toast");
  let toastTimer = null;

  // Filtering
  let activeBlockId = "all";
  let q = "";

  // Guardado (debounce)
  let saveTimer = null;
  let saving = false;
  let lastSaveError = null;

  // ---------- Init ----------
  bind();
  // render “placeholder” rápido
  state = structuredClone(window.DEFAULT_DATA);
  renderAll();
  // luego carga servidor
  initFromServer();

  async function initFromServer() {
    try {
      const server = await loadStateFromServer();
      state = server;
      renderAll();
      showToast("Sincronizado ✅");
    } catch (e) {
      console.error(e);
      lastSaveError = e;
      // seguimos con DEFAULT_DATA ya renderizado
      showToast("No se pudo cargar del servidor (modo local).");
    }
  }

  function bind(){
    elQ.addEventListener("input", () => {
      q = elQ.value.trim().toLowerCase();
      renderAll();
    });
    elClear.addEventListener("click", () => {
      elQ.value = "";
      q = "";
      renderAll();
      elQ.focus();
    });

    btnAdd?.addEventListener("click", () => openCreate());
    mAdd?.addEventListener("click", () => openCreate());

    btnCopy?.addEventListener("click", () => copyText());
    mCopy?.addEventListener("click", () => copyText());

    // Reset ahora restaura DEFAULT_DATA Y lo guarda al servidor (multiusuario)
    btnReset?.addEventListener("click", async () => {
      state = structuredClone(window.DEFAULT_DATA);
      activeBlockId = "all";
      q = "";
      elQ.value = "";
      renderAll();
      queueSave("Lista restaurada ✅");
    });

    btnToggleSidebar?.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });

    // Close sidebar on outside click (mobile)
    document.addEventListener("click", (e) => {
      if (window.matchMedia("(max-width: 900px)").matches) {
        const clickedInsideSidebar = sidebar.contains(e.target);
        const clickedToggle = btnToggleSidebar.contains(e.target);
        if (!clickedInsideSidebar && !clickedToggle) sidebar.classList.remove("open");
      }
    });

    // Modal interactions
    modalBackdrop?.addEventListener("click", closeModal);
    modalClose?.addEventListener("click", closeModal);
    btnCancel?.addEventListener("click", closeModal);

    fBlock?.addEventListener("change", () => {
      populateSubgroups(fBlock.value);
    });

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const payload = readForm();
      if (!payload) return;

      if (payload.id) {
        updateCharacter(payload);
        showToast("Personaje actualizado ✅");
      } else {
        createCharacter(payload);
        showToast("Personaje creado ✅");
      }

      renderAll();
      closeModal();
      queueSave();
    });

    btnDelete?.addEventListener("click", () => {
      const id = fId.value;
      if (!id) return;
      deleteCharacter(id);
      renderAll();
      closeModal();
      showToast("Personaje eliminado 🗑️");
      queueSave();
    });

    // Esc closes modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  // ---------- Server State ----------
  async function loadStateFromServer(){
    const r = await fetch(API_URL, { method: "GET" });
    if (!r.ok) throw new Error(await r.text());
    const j = await r.json();

    if (!j || !j.ok || !Array.isArray(j.data)) {
      throw new Error("Respuesta inválida del servidor");
    }

    // Si servidor está vacío, inicializa con DEFAULT_DATA y lo sube
    if (j.data.length === 0) {
      const init = structuredClone(window.DEFAULT_DATA);
      await saveStateToServer(init);
      return init;
    }

    return j.data;
  }

  async function saveStateToServer(data){
    saving = true;
    renderStats(); // para mostrar “guardando…”
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    saving = false;

    if (!r.ok) {
      const msg = await r.text();
      lastSaveError = new Error(msg);
      renderStats();
      throw lastSaveError;
    }

    lastSaveError = null;
    renderStats();
  }

  function queueSave(successToastMsg){
    // Evita commits por cada click: guarda 1 vez cada 900ms
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await saveStateToServer(state);
        if (successToastMsg) showToast(successToastMsg);
        else showToast("Guardado ✅");
      } catch (e) {
        console.error(e);
        showToast("No se pudo guardar (reintenta).");
      }
    }, 900);
  }

  // ---------- Helpers ----------
  function allItems(){
    const res = [];
    for (const block of state){
      for (const sg of block.subgroups){
        for (const it of sg.items){
          res.push({ block, sg, it });
        }
      }
    }
    return res;
  }

  function findById(id){
    for (const block of state){
      for (const sg of block.subgroups){
        const idx = sg.items.findIndex(x => x.id === id);
        if (idx !== -1) return { block, sg, idx, it: sg.items[idx] };
      }
    }
    return null;
  }

  // ---------- Render ----------
  function renderAll(){
    renderNav();
    renderStats();
    renderCards();
  }

  function renderNav(){
    const counts = state.map(b => ({
      id: b.id,
      title: b.title,
      count: b.subgroups.reduce((a, sg) => a + sg.items.length, 0)
    }));
    const total = counts.reduce((a, x) => a + x.count, 0);

    elNav.innerHTML = "";

    const allBtn = navButton("all", "Todas", total);
    elNav.appendChild(allBtn);

    counts.forEach(c => {
      elNav.appendChild(navButton(c.id, c.title, c.count));
    });
  }

  function navButton(id, title, count){
    const btn = document.createElement("button");
    btn.className = "navItem" + (activeBlockId === id ? " active" : "");
    btn.innerHTML = `<span>${escapeHtml(title)}</span><span class="navCount">${count}</span>`;
    btn.addEventListener("click", () => {
      activeBlockId = id;
      renderAll();
      if (window.matchMedia("(max-width: 900px)").matches) sidebar.classList.remove("open");
    });
    return btn;
  }

  function renderStats(){
    const items = allItems().map(x => x.it);
    const total = items.length;
    const occupied = items.filter(x => x.occupied).length;
    const free = total - occupied;

    const shown = filteredItems().length;

    // Indicador de guardado
    let syncText = "";
    if (saving) syncText = `<div class="stat"><b>⏳</b> guardando...</div>`;
    else if (lastSaveError) syncText = `<div class="stat"><b>⚠️</b> sin guardar</div>`;
    else syncText = `<div class="stat"><b>✅</b> guardado</div>`;

    elStats.innerHTML = `
      <div class="stat"><b>${shown}</b> mostrados</div>
      <div class="stat"><b>${total}</b> total</div>
      <div class="stat"><b>${occupied}</b> ocupados ✅</div>
      <div class="stat"><b>${free}</b> libres</div>
      ${syncText}
    `;
  }

  function filteredItems(){
    const res = [];
    for (const block of state){
      if (activeBlockId !== "all" && block.id !== activeBlockId) continue;
      for (const sg of block.subgroups){
        for (const it of sg.items){
          if (q && !it.name.toLowerCase().includes(q)) continue;
          res.push({ block, sg, it });
        }
      }
    }
    return res;
  }

  function renderCards(){
    // Agrupar por block->subgroup usando el filtro
    const map = new Map(); // key = blockId|sgId
    for (const { block, sg, it } of filteredItems()){
      const key = `${block.id}__${sg.id}`;
      if (!map.has(key)) map.set(key, { block, sg, items: [] });
      map.get(key).items.push(it);
    }

    // orden natural según state
    const orderedGroups = [];
    for (const block of state){
      if (activeBlockId !== "all" && block.id !== activeBlockId) continue;
      for (const sg of block.subgroups){
        const key = `${block.id}__${sg.id}`;
        if (map.has(key)) orderedGroups.push(map.get(key));
      }
    }

    elCards.innerHTML = "";

    if (orderedGroups.length === 0){
      elCards.innerHTML = `
        <div class="card" style="grid-column: span 12;">
          <div class="cardHeader">
            <div>
              <div class="cardTitle">Sin resultados</div>
              <div class="cardSub">Prueba con otra búsqueda o cambia de sección.</div>
            </div>
          </div>
          <div class="cardBody">
            <div class="row" style="justify-content:space-between;">
              <div class="left">
                <div class="emoji">🫠</div>
                <div class="name">No encontramos personajes con ese filtro</div>
              </div>
              <button class="btn ghost" id="clearInline">Limpiar búsqueda</button>
            </div>
          </div>
        </div>
      `;
      const b = document.getElementById("clearInline");
      if (b) b.addEventListener("click", () => {
        elQ.value = ""; q = ""; renderAll();
      });
      return;
    }

    for (const g of orderedGroups){
      const card = document.createElement("div");
      card.className = "card";

      const header = document.createElement("div");
      header.className = "cardHeader";
      header.innerHTML = `
        <div>
          <div class="cardTitle">${escapeHtml(g.sg.title)}</div>
          <div class="cardSub">${escapeHtml(g.block.title)} • ${g.items.length} personajes</div>
        </div>
        <button class="iconBtn" title="Agregar aquí">＋</button>
      `;
      header.querySelector("button").addEventListener("click", () => {
        openCreate({ blockId: g.block.id, subgroupId: g.sg.id });
      });

      const body = document.createElement("div");
      body.className = "cardBody";

      g.items.forEach((it) => {
        const row = document.createElement("div");
        row.className = "row";

        row.innerHTML = `
          <div class="left">
            <div class="emoji">${escapeHtml(it.icon)}</div>
            <div class="name" title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</div>
          </div>

          <div class="badges">
            <span class="badge ${it.occupied ? "on":""}">${it.occupied ? "OCUPADO ✅" : "LIBRE"}</span>
          </div>

          <div class="rowActions">
            <input class="chk" type="checkbox" ${it.occupied ? "checked":""} title="Ocupado" />
            <button class="iconBtn" title="Editar">✎</button>
          </div>
        `;

        // toggle occupied
        row.querySelector(".chk").addEventListener("change", (e) => {
          it.occupied = e.target.checked;
          renderAll();
          queueSave();
        });

        // edit
        const editBtn = row.querySelector(".iconBtn");
        if (editBtn) editBtn.addEventListener("click", () => openEdit(it.id));

        body.appendChild(row);
      });

      card.appendChild(header);
      card.appendChild(body);
      elCards.appendChild(card);
    }
  }

  // ---------- CRUD ----------
  function openCreate(prefill){
    const { blockId, subgroupId } = prefill || {};
    modalTitle.textContent = "Nuevo personaje";
    btnDelete.style.display = "none";
    fId.value = "";
    fName.value = "";
    fIcon.value = "";
    fOccupied.checked = false;

    populateBlocks(blockId || (activeBlockId !== "all" ? activeBlockId : null));
    const chosenBlock = fBlock.value || state[0]?.id;
    populateSubgroups(chosenBlock, subgroupId);

    openModal();
    fName.focus();
  }

  function openEdit(id){
    const hit = findById(id);
    if (!hit) return;

    modalTitle.textContent = "Editar personaje";
    btnDelete.style.display = "inline-flex";

    fId.value = hit.it.id;
    fName.value = hit.it.name;
    fIcon.value = hit.it.icon;
    fOccupied.checked = !!hit.it.occupied;

    populateBlocks(hit.block.id);
    populateSubgroups(hit.block.id, hit.sg.id);

    openModal();
    fName.focus();
  }

  function readForm(){
    const name = fName.value.trim();
    const icon = fIcon.value.trim();
    const blockId = fBlock.value;
    const subgroupId = fSubgroup.value;

    if (!name || !icon || !blockId || !subgroupId){
      showToast("Completa los campos 🙏");
      return null;
    }

    return {
      id: fId.value || "",
      name,
      icon,
      occupied: !!fOccupied.checked,
      blockId,
      subgroupId,
    };
  }

  function createCharacter(p){
    const block = state.find(b => b.id === p.blockId);
    if (!block) return;
    const sg = block.subgroups.find(s => s.id === p.subgroupId);
    if (!sg) return;

    const newId = makeId(p.name);
    let id = newId;
    let n = 2;
    while (findById(id)) { id = `${newId}_${n++}`; }

    sg.items.push({
      id,
      icon: p.icon,
      name: p.name,
      occupied: p.occupied,
    });
  }

  function updateCharacter(p){
    const hit = findById(p.id);
    if (!hit) return;

    const moved = hit.block.id !== p.blockId || hit.sg.id !== p.subgroupId;
    if (moved){
      hit.sg.items.splice(hit.idx, 1);

      const newBlock = state.find(b => b.id === p.blockId);
      const newSg = newBlock?.subgroups.find(s => s.id === p.subgroupId);
      if (!newBlock || !newSg) return;

      newSg.items.push({
        id: hit.it.id,
        icon: p.icon,
        name: p.name,
        occupied: p.occupied,
      });
      return;
    }

    hit.it.name = p.name;
    hit.it.icon = p.icon;
    hit.it.occupied = p.occupied;
  }

  function deleteCharacter(id){
    const hit = findById(id);
    if (!hit) return;
    hit.sg.items.splice(hit.idx, 1);
  }

  // ---------- Selects ----------
  function populateBlocks(selectedId){
    fBlock.innerHTML = "";
    for (const b of state){
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.title;
      fBlock.appendChild(opt);
    }

    const pick =
      selectedId && selectedId !== "all" && state.some(b => b.id === selectedId)
        ? selectedId
        : state[0]?.id;

    if (pick) fBlock.value = pick;
  }

  function populateSubgroups(blockId, selectedSgId){
    const block = state.find(b => b.id === blockId) || state[0];
    fSubgroup.innerHTML = "";
    for (const sg of block.subgroups){
      const opt = document.createElement("option");
      opt.value = sg.id;
      opt.textContent = sg.title;
      fSubgroup.appendChild(opt);
    }

    const pick =
      selectedSgId && block.subgroups.some(s => s.id === selectedSgId)
        ? selectedSgId
        : block.subgroups[0]?.id;

    if (pick) fSubgroup.value = pick;
  }

  // ---------- Copy ----------
  async function copyText(){
    const text = buildCopyText();
    try{
      await navigator.clipboard.writeText(text);
      showToast("Copiado ✅");
    }catch{
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showToast("Copiado ✅");
    }
  }

  function buildCopyText(){
    const lines = [];
    lines.push("⚠️ IMPORTANTE: Los que tienen 🐧 están en uso");
    lines.push("");
    lines.push("✦ˑ ִֶ 𓂃⊹ PERSONAJES DISPONIBLES / OCUPADOS ⊹𓂃 ִֶ ˑ✦");
    lines.push("");

    for (const block of state){
      lines.push(`✦ˑ ִֶ 𓂃⊹ ${block.title} ⊹𓂃 ִֶ ˑ✦`);
      lines.push(".˚₊‧༉─── ✦ ───");
      lines.push("");

      for (const sg of block.subgroups){
        lines.push(`╭─❖ ${sg.title} ❖─╮`);
        for (const it of sg.items){
          const penguin = it.occupied ? " 🐧" : "";
          lines.push(`𓆩${it.icon}𓆪 ${it.name}${penguin}`);
        }
        lines.push("╰──────────────╯");
        lines.push("");
      }

      lines.push("━━━━━━━━━━━━━");
      lines.push("");
    }

    return lines.join("\n").trim();
  }

  // ---------- Modal ----------
  function openModal(){
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }
  function closeModal(){
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  // ---------- Utils ----------
  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1200);
  }

  function makeId(str){
    return str
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || ("id_" + Math.random().toString(16).slice(2));
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
})();