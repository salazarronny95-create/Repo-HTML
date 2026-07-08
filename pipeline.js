/* ===================================================================
   Pipeline de Cumplimiento de Tareas Comerciales · Pronaca
   TAREAS DINÁMICAS: no hay tareas fijas. El objetivo se arma con las
   columnas de tarea que existan en la base (las que estén marcadas),
   y se enlazan con la columna "Pregunta" de Teamcore por nombre.
   Funciona en navegador (window.buildModel) y en Node (module.exports).
   Entradas (array de arrays, fila 0 = encabezados):
     - base        : universo + columnas de tarea marcadas (X / 1 / SI)
     - ruterosEjec : maestro hoja "ejecutivo ..."
     - ruterosTvt  : maestro hoja "tvt ..."
     - teamcore    : ejecución (columnas Pregunta y Respuesta)
   =================================================================== */
(function (root) {
  "use strict";

  const norm = (x) => (x === null || x === undefined) ? "" : String(x).trim();
  const ncode = (x) => {
    if (x === null || x === undefined) return "";
    if (typeof x === "number") return Number.isInteger(x) ? String(x) : String(x);
    return String(x).trim().replace(/\.0$/, "");
  };
  // clave normalizada para enlazar (sin acentos, minúsculas, espacios colapsados, sin punto final)
  const tkey = (s) => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").replace(/[.;:]+$/, "").trim();
  const strip = (s) => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  function headerIndex(headerRow, names) {
    const H = headerRow.map((h) => strip(h));
    for (const n of names) { const i = H.indexOf(strip(n)); if (i >= 0) return i; }
    for (const n of names) { const t = strip(n); const i = H.findIndex((h) => h.includes(t)); if (i >= 0) return i; }
    return -1;
  }

  // columnas de la base que NO son tareas (dimensiones / ayuda)
  const DIM_COLS = new Set([
    "holding","subcadena","codigo_local","codigo_b2b","codigo","cod","nombre","direccion",
    "latitud","longitud","latitude","longitude","zona","cluster","sucursal","formato","kam",
    "modelo","macrocanal","region","región","vendedor","supervisor","jefe",
    "tareas objetivo","tareas","objetivo","cobertura"
  ].map(strip));

  // marca verdadera en una celda de tarea
  const NEG = new Set(["", "0", "no", "false", "n", "n/a", "na", "-", "x?"]);
  const marked = (v) => !NEG.has(strip(v));

  // Geocerca: radio válido (metros) y parser de distancia tolerante (coma decimal, "45 m", etc.)
  const GEO_RADIO = 50;
  const parseDist = (x) => {
    if (x === null || x === undefined || x === "") return NaN;
    if (typeof x === "number") return x;
    const s = String(x).trim().replace(/,/g, ".").replace(/[^0-9.\-]/g, "");
    if (s === "" || s === "." || s === "-") return NaN;
    const n = parseFloat(s); return isNaN(n) ? NaN : n;
  };

  function macro(cad) {
    const s = strip(cad);
    if (s.includes("tradicional")) return "Tradicional";
    if (s.includes("mercados")) return "Mercados Populares";
    if (s.includes("food")) return "Food Service";
    return norm(cad) || "Sin macrocanal";
  }
  function modelo(rol) {
    const s = strip(rol);
    if (s.includes("especializ")) return "Especializada";
    if (s.includes("ejecutivo") || s.includes("tradicional")) return "Tradicional";
    return norm(rol) || "Sin dato";
  }
  function region(alm) {
    const s = norm(alm).toUpperCase();
    if (s === "D01") return "D01 - Sierra";
    if (s === "D02") return "D02 - Costa";
    return s || "Sin región";
  }

  function buildModel(sheets) {
    const base = sheets.base || [];
    const tc = sheets.teamcore || [];
    const av = sheets.auditvision || [];
    // hojas del rutero: nuevo formato (1 hoja maestro) o anterior (ejecutivo + tvt)
    const ruterosSheets = sheets.ruteros || [sheets.ruterosEjec || [], sheets.ruterosTvt || []];

    // ---------- Ruteros (maestro): code -> vendedor, supervisor, region, macrocanal ----------
    const code2vend = Object.create(null), code2reg = Object.create(null), code2sup = Object.create(null), code2macro = Object.create(null);
    // Detecta un maestro (formato antiguo EV/NombreSupervisor o el nuevo CODIGO_CLIENTE/Vendedor/Supervisor/Macrocanal)
    const isNewSheet = (rows) => { if (!rows || !rows.length) return false; const Hs = rows[0].map(strip);
      return Hs.includes("nombresupervisor") || Hs.includes("nombrevendedor") || Hs.includes("ev")
        || Hs.includes("codigo_cliente") || (Hs.includes("vendedor") && Hs.includes("supervisor")); };
    // si existe el nuevo maestro, el vendedor sale SOLO de ahí; el rutero viejo aporta únicamente región
    const hasNewMaster = ruterosSheets.some(isNewSheet);
    function readRuteros(rows) {
      if (!rows || !rows.length) return;
      const h = rows[0];
      const Hs = h.map((x) => strip(x));
      if (isNewSheet(rows)) {
        // Maestro: código de cliente, vendedor (EV/Vendedor), supervisor, región (si la trae) y macrocanal (si la trae)
        const iCli = headerIndex(h, ["codigo_cliente", "Cliente", "Codigo", "Cod Direc."]);
        let iEV = Hs.indexOf("ev"); if (iEV < 0) iEV = Hs.indexOf("vendedor");            // código del vendedor
        let iSupName = Hs.indexOf("nombresupervisor"); if (iSupName < 0) iSupName = Hs.indexOf("supervisor");
        const iNV = Hs.indexOf("nombrevendedor");
        const iMacro = Hs.indexOf("macrocanal");
        let iReg = -1;
        for (const cand of ["region", "nombreregion", "regional", "zona", "nombrezona", "almacen", "ciudad", "nombreciudad"]) {
          const j = Hs.indexOf(cand); if (j >= 0) { iReg = j; break; }
        }
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]; if (!row) continue;
          const c = ncode(row[iCli]); if (!c) continue;
          const ev = iEV >= 0 ? norm(row[iEV]) : "";
          const nv = iNV >= 0 ? norm(row[iNV]) : "";
          const vend = ev || nv;                        // solo el código del vendedor (cae a nombre si no hay código)
          if (vend && !(c in code2vend)) code2vend[c] = vend;
          if (iSupName >= 0) { const s = norm(row[iSupName]); if (s && !code2sup[c]) code2sup[c] = s; }
          if (iReg >= 0 && !(c in code2reg)) code2reg[c] = norm(row[iReg]);
          if (iMacro >= 0 && !(c in code2macro)) { const m = macro(row[iMacro]); if (m) code2macro[c] = m; }
        }
      } else {
        // formato anterior (ejecutivo / tvt): siempre aporta región; vendedor solo si NO hay maestro nuevo
        const iCli = headerIndex(h, ["Cliente", "Cod Direc.", "Partner", "Codigo"]);
        const iVen = headerIndex(h, ["Ejecutivo de Venta"]);
        const iAlm = headerIndex(h, ["Almacén", "Almacen"]);
        let iTv = headerIndex(h, ["Televended"]);
        const iVenName = iVen >= 0 ? iVen : (iTv >= 0 ? iTv + 1 : -1);
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]; if (!row) continue;
          const c = ncode(row[iCli]); if (!c) continue;
          if (iAlm >= 0 && !(c in code2reg)) code2reg[c] = norm(row[iAlm]);
          if (!hasNewMaster && !(c in code2vend)) code2vend[c] = (iVenName >= 0 ? norm(row[iVenName]) : "") || "Sin asignar";
        }
      }
    }
    // procesar primero el nuevo maestro, luego el resto
    ruterosSheets.filter(isNewSheet).forEach(readRuteros);
    ruterosSheets.filter((s) => !isNewSheet(s)).forEach(readRuteros);
    const reg = (c) => region(code2reg[c]);

    // ---------- Teamcore: tareas cargadas (cliente × pregunta) ----------
    const h = tc[0] || [];
    const iCod = headerIndex(h, ["Código Local", "Codigo Local", "Código Propio", "Codigo Propio"]);
    const iPreg = headerIndex(h, ["Pregunta"]);
    const iResp = headerIndex(h, ["Respuesta"]);
    const iCad = headerIndex(h, ["Cadena"]);
    const iRol = headerIndex(h, ["Rol"]);
    const iUsr = headerIndex(h, ["Usuario"]);
    const iJefe = headerIndex(h, ["Jefe"]);
    const iFecha = headerIndex(h, ["Fecha"]);
    const iAnio = headerIndex(h, ["Año", "Ano", "Anio"]);
    const iSem = headerIndex(h, ["Semana"]);
    const iGeo = headerIndex(h, ["Distancia Check IN", "distancia check in", "distancia checkin", "distancia check-in", "distancia de check in", "GEO cerca", "geocerca", "geo_cerca", "geo cerca", "distancia", "distancia geocerca", "check in", "geo"]);
    const hasGeo = iGeo >= 0;

    const usrJefeCount = new Map();
    for (let r = 1; r < tc.length; r++) {
      const row = tc[r]; if (!row) continue;
      const u = norm(row[iUsr]), j = norm(row[iJefe]);
      if (j) { if (!usrJefeCount.has(u)) usrJefeCount.set(u, new Map()); const m = usrJefeCount.get(u); m.set(j, (m.get(j) || 0) + 1); }
    }
    const usr2jefe = new Map();
    for (const [u, m] of usrJefeCount) { let best = "", bc = -1; for (const [j, c] of m) if (c > bc) { bc = c; best = j; } usr2jefe.set(u, best); }

    const codeDims = new Map();            // code -> [macro, modelo, supervisor]
    const foodCodes = new Set();           // códigos con CUALQUIER fila Food Service (se excluyen)
    const cp = new Map();                  // code||taskKey -> {code,key,carg,efec,label}
    const wkAgg = new Map();               // code||taskKey||semana -> {code,key,week,efec}
    const dayAgg = new Map();              // code||taskKey||díaISO -> {code,key,dia,efec}  (tendencia diaria)
    const tcTaskLabel = new Map();         // taskKey -> label (texto pregunta)
    const impactDay = new Set();           // code||díaISO  (cliente impactado ese día)
    const diasSet = new Set();
    const fechas = [], semanas = new Set(), anios = new Set();

    for (let r = 1; r < tc.length; r++) {
      const row = tc[r]; if (!row) continue;
      const preg = norm(row[iPreg]); if (!preg) continue;
      const key = tkey(preg); if (!key) continue;
      const code = ncode(row[iCod]); if (!code) continue;
      if (!tcTaskLabel.has(key)) tcTaskLabel.set(key, preg);
      const logr = strip(row[iResp]) === "logrado";
      const mc = macro(row[iCad]), mod = modelo(row[iRol]);
      if (mc === "Food Service") foodCodes.add(code);
      const u = norm(row[iUsr]); let sup = norm(row[iJefe]) || usr2jefe.get(u) || "Sin asignar";
      if (!codeDims.has(code)) codeDims.set(code, [mc, mod, sup]);
      else { const d = codeDims.get(code); if (d[2] === "Sin asignar" && sup !== "Sin asignar") d[2] = sup; }
      // Geocerca: distancia del check-in; válido si está dentro del radio (≤ 50 m)
      const dist = hasGeo ? parseDist(row[iGeo]) : NaN;
      const geoOK = isFinite(dist) && dist <= GEO_RADIO;
      const k = code + "||" + key;
      let d = cp.get(k);
      if (!d) { d = { code, key, carg: true, efec: false, geo: false, label: preg }; cp.set(k, d); }
      if (logr) { d.efec = true; if (geoOK) d.geo = true; }   // lograda con geocerca = algún "Logrado" dentro de 50 m
      const wk = iSem >= 0 ? norm(row[iSem]) : "";
      if (wk) {
        const wkk = k + "||" + wk;
        let wd = wkAgg.get(wkk);
        if (!wd) { wd = { code, key, week: wk, efec: false }; wkAgg.set(wkk, wd); }
        if (logr) wd.efec = true;
      }
      if (iFecha >= 0 && row[iFecha] != null && row[iFecha] !== "") {
        fechas.push(row[iFecha]);
        const dk = dayKey(row[iFecha]);
        if (dk) {
          diasSet.add(dk); impactDay.add(code + "||" + dk);
          const dkk = k + "||" + dk;   // tendencia: cliente×tarea trabajada ese día
          let dd = dayAgg.get(dkk);
          if (!dd) { dd = { code, key, dia: dk, wk: wk, efec: false, geo: false }; dayAgg.set(dkk, dd); }
          if (logr) { dd.efec = true; if (geoOK) dd.geo = true; }
        }
      }
      if (iSem >= 0) semanas.add(norm(row[iSem]));
      if (iAnio >= 0) anios.add(norm(row[iAnio]));
    }
    // Food Service marcado en el maestro (Macrocanal) también se excluye, aunque no esté en Teamcore
    for (const c in code2macro) { if (code2macro[c] === "Food Service") foodCodes.add(c); }

    // ---------- BASE: universo + columnas de tarea (dinámicas) ----------
    const baseCodes = new Set();
    const baseModelo = new Map();          // code -> modelo (si la base trae columna)
    const baseNombre = new Map();          // code -> nombre del cliente
    const expected = [];                   // {code, key, label}
    const baseTaskLabel = new Map();       // taskKey -> label (encabezado base)
    let hasTaskCols = false;
    if (base.length) {
      const bh = base[0];
      const iBc = headerIndex(bh, ["codigo_local", "codigo_b2b", "codigo"]);
      const iBmod = headerIndex(bh, ["modelo"]);
      const iBnom = headerIndex(bh, ["nombre", "nombre cliente", "local"]);
      // detectar columnas de tarea = encabezados que no son dimensión
      const taskCols = [];
      bh.forEach((hd, ci) => {
        const hs = strip(hd);
        if (hs && !DIM_COLS.has(hs)) taskCols.push(ci);
      });
      hasTaskCols = taskCols.length > 0;
      // reconciliar cada columna de tarea del plan con una Pregunta de Teamcore, ASIGNACIÓN 1 A 1
      // (cada Pregunta se usa como máximo una vez, para no colapsar dos tareas en una)
      const stop = new Set(["del", "las", "los", "con", "que", "por", "para", "una", "uno", "toma", "foto", "cliente", "asegura", "correcta", "ejecucion", "ejecutado", "equipo"]);
      const words = (s) => new Set(String(s).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stop.has(w)));
      const tcKeysArr = [...tcTaskLabel.keys()];
      const df = {};                                  // en cuántas Preguntas aparece cada palabra
      const tcWordSets = {}; tcKeysArr.forEach(k => { const w = words(k); tcWordSets[k] = w; w.forEach(x => df[x] = (df[x] || 0) + 1); });
      const idf = (w) => Math.log((tcKeysArr.length + 1) / ((df[w] || 0) + 1)) + 0.1;   // palabra rara -> más peso
      const colKey = new Map();   // ci -> canonicalKey
      const usedTc = new Set();
      // 1) coincidencia exacta (bloquea esa Pregunta)
      for (const ci of taskCols) { const bk = tkey(bh[ci]); if (tcTaskLabel.has(bk) && !usedTc.has(bk)) { colKey.set(ci, bk); usedTc.add(bk); } }
      // 2) resto: mejor puntaje (inclusión o IDF) asignado de forma voraz 1:1 sobre Preguntas libres
      const rest = taskCols.filter(ci => !colKey.has(ci));
      const cand = [];
      for (const ci of rest) {
        const bk = tkey(bh[ci]), bw = words(bk);
        for (const tk of tcKeysArr) {
          if (usedTc.has(tk)) continue;
          let s = (tk.includes(bk) || bk.includes(tk)) ? 1e6 : 0;
          if (!s) { const tw = tcWordSets[tk]; for (const w of bw) if (tw.has(w)) s += idf(w); }
          cand.push([ci, tk, s]);
        }
      }
      cand.sort((a, b) => b[2] - a[2]);
      const doneCi = new Set();
      for (const [ci, tk, s] of cand) {
        if (doneCi.has(ci) || usedTc.has(tk)) continue;
        colKey.set(ci, tk); usedTc.add(tk); doneCi.add(ci);   // 1:1: cada Pregunta libre va a una sola columna
      }
      // 3) columnas sin Pregunta disponible -> conservan su propia llave (se muestran como tarea aparte)
      for (const ci of taskCols) {
        if (!colKey.has(ci)) colKey.set(ci, tkey(bh[ci]));
        const canon = colKey.get(ci);
        if (!baseTaskLabel.has(canon)) baseTaskLabel.set(canon, norm(bh[ci]));
      }
      for (let r = 1; r < base.length; r++) {
        const row = base[r]; if (!row) continue;
        const c = ncode(row[iBc]); if (!c) continue;
        baseCodes.add(c);
        if (iBmod >= 0) { const m = modelo(row[iBmod]); if (m && m !== "Sin dato") baseModelo.set(c, m); }
        if (iBnom >= 0 && !baseNombre.has(c)) { const nm = norm(row[iBnom]); if (nm) baseNombre.set(c, nm); }
        if (hasTaskCols) {
          const seen = new Set();
          for (const ci of taskCols) {
            if (marked(row[ci])) {
              const key = colKey.get(ci);
              if (seen.has(key)) continue; seen.add(key);
              expected.push({ code: c, key, label: baseTaskLabel.get(key) });
            }
          }
        }
      }
    }

    // ---------- universo de tareas (dict) y clientes ----------
    const taskLabel = new Map();           // key -> label (preferir base)
    for (const [k, l] of tcTaskLabel) taskLabel.set(k, l);
    for (const [k, l] of baseTaskLabel) taskLabel.set(k, l);
    const tcCodes = new Set([...cp.values()].map(d => d.code));
    const expCodes = new Set(expected.map(e => e.code));
    const allCodes = [...new Set([...baseCodes, ...tcCodes, ...expCodes])].sort();
    const cidMap = new Map(allCodes.map((c, i) => [c, i]));

    // diccionarios
    const setV = new Set(), setS = new Set(), setR = new Set(), setMa = new Set(), setMo = new Set(), setT = new Set();
    const dimOf = (code) => {
      const d = codeDims.get(code) || ["Tradicional", "Sin dato", "Sin asignar"];
      const mod = baseModelo.get(code) || d[1];
      // supervisor: del maestro; si hay maestro nuevo y el cliente no está en él -> "Sin asignar"
      const sup = code2sup[code] || (hasNewMaster ? "Sin asignar" : d[2]);
      // macrocanal: de Teamcore si el cliente se ejecutó; si no, del maestro (Macrocanal) cuando esté
      const mc = codeDims.has(code) ? d[0] : (code2macro[code] || d[0]);
      return [mc, mod, sup]; // macro, modelo, supervisor
    };
    // Canal Food Service excluido por completo (aunque venga en los Excel)
    const isFood = (code) => foodCodes.has(code);
    const modOf = (code) => dimOf(code)[1];

    const OBJ = [], LOAD = [];
    for (const e of expected) {
      if (isFood(e.code)) continue;
      const [mc, mod, sup] = dimOf(e.code);
      const v = code2vend[e.code] || "Sin asignar", rg = reg(e.code), cid = cidMap.get(e.code);
      setV.add(v); setS.add(sup); setR.add(rg); setMa.add(mc); setMo.add(mod); setT.add(e.key);
      OBJ.push([v, sup, rg, mc, mod, e.key, cid]);
    }
    for (const d of cp.values()) {
      if (isFood(d.code)) continue;
      const [mc, mod, sup] = dimOf(d.code);
      const v = code2vend[d.code] || "Sin asignar", rg = reg(d.code), cid = cidMap.get(d.code);
      setV.add(v); setS.add(sup); setR.add(rg); setMa.add(mc); setMo.add(mod); setT.add(d.key);
      LOAD.push([v, sup, rg, mc, mod, d.key, d.efec ? 1 : 0, cid, d.geo ? 1 : 0]);
    }

    const VD = [...setV].sort((a, b) => a.localeCompare(b, "es"));
    const SD = [...setS].sort((a, b) => a.localeCompare(b, "es"));
    const RD = [...setR].sort((a, b) => a.localeCompare(b, "es"));
    const MAD = [...setMa].sort((a, b) => a.localeCompare(b, "es"));
    const MOD = [...setMo].sort((a, b) => a.localeCompare(b, "es"));
    const TKEYS = [...setT].sort((a, b) => (taskLabel.get(a) || a).localeCompare(taskLabel.get(b) || b, "es"));
    const TLAB = TKEYS.map(k => taskLabel.get(k) || k);

    const WEEKS = [...semanas].filter(Boolean).sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
    const idx = (arr) => { const m = new Map(); arr.forEach((x, i) => m.set(x, i)); return m; };
    const mv = idx(VD), ms = idx(SD), mr = idx(RD), mma = idx(MAD), mmo = idx(MOD), mt = idx(TKEYS), mw = idx(WEEKS);

    const objE = OBJ.map(r => [mv.get(r[0]), ms.get(r[1]), mr.get(r[2]), mma.get(r[3]), mmo.get(r[4]), mt.get(r[5]), r[6]]);
    const loadE = LOAD.map(r => [mv.get(r[0]), ms.get(r[1]), mr.get(r[2]), mma.get(r[3]), mmo.get(r[4]), mt.get(r[5]), r[6], r[7], r[8]]);

    // registros por semana (para el evolutivo) — cliente × tarea × semana
    const wkE = [];
    for (const d of wkAgg.values()) {
      if (isFood(d.code)) continue;
      const [mc, mod, sup] = dimOf(d.code);
      const v = code2vend[d.code] || "Sin asignar", rg = reg(d.code), cid = cidMap.get(d.code);
      wkE.push([mv.get(v), ms.get(sup), mr.get(rg), mma.get(mc), mmo.get(mod), mt.get(d.key), mw.get(d.week), d.efec ? 1 : 0, cid]);
    }

    // ---------- Día (módulo ejecución diaria): vendedor × día × cliente impactado ----------
    const DIAS = [...diasSet].sort();
    const mdia = idx(DIAS);
    const dayrecE = [];
    for (const keyCD of impactDay) {
      const sep = keyCD.lastIndexOf("||");
      const code = keyCD.slice(0, sep), day = keyCD.slice(sep + 2);
      const cid = cidMap.get(code); if (cid == null) continue;
      if (isFood(code)) continue;
      const v = code2vend[code] || "Sin asignar";
      dayrecE.push([mv.get(v), mdia.get(day), cid]);
    }

    // tendencia diaria — cliente × tarea × día (mismas dimensiones para filtrar)
    const dtE = [];
    for (const d of dayAgg.values()) {
      if (isFood(d.code)) continue;
      const [mc, mod, sup] = dimOf(d.code);
      const v = code2vend[d.code] || "Sin asignar", rg = reg(d.code), cid = cidMap.get(d.code);
      const wi = (d.wk && mw.has(d.wk)) ? mw.get(d.wk) : -1;
      dtE.push([mv.get(v), ms.get(sup), mr.get(rg), mma.get(mc), mmo.get(mod), mt.get(d.key), mdia.get(d.dia), d.efec ? 1 : 0, cid, d.geo ? 1 : 0, wi]);
    }

    // período
    let periodo = "";
    if (anios.size && semanas.size) {
      const ss = [...semanas].filter(Boolean).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
      const aa = [...anios].filter(Boolean);
      if (ss.length) periodo = "Semana " + (ss[0] === ss[ss.length - 1] ? ss[0] : ss[0] + "–" + ss[ss.length - 1]) + " · " + aa.join("/");
    }
    if (fechas.length) {
      const ds = fechas.map(toDate).filter(Boolean).sort((a, b) => a - b);
      if (ds.length) { const f = (d) => d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" }); periodo = (periodo ? periodo + " · " : "") + f(ds[0]) + " a " + f(ds[ds.length - 1]); }
    }

    const carg = loadE.length, efec = loadE.reduce((s, r) => s + r[6], 0);
    const efecGeo = loadE.reduce((s, r) => s + (r[6] === 1 && r[8] === 1 ? 1 : 0), 0);   // logradas con geocerca (≤50 m)
    const stats = {
      cargadas: carg, efectivas: efec, objetivo: objE.length,
      clientesBase: baseCodes.size, clientesTeamcore: tcCodes.size, clientes: allCodes.length,
      efectividad: carg ? (100 * efec / carg) : 0,
      tareas: TKEYS.length, planActivo: hasTaskCols, semanas: WEEKS.length,
      hasGeo, geoRadio: GEO_RADIO, logradasGeo: efecGeo, logradasSinGeo: efec - efecGeo,
    };

    // ---------- AuditVision (opcional): código, estado IA, resultado, URL de imagen ----------
    const auditvision = [];
    if (av.length) {
      const ah = av[0];
      const iC = headerIndex(ah, ["codigo_cliente", "codigo", "cliente", "codigo_local"]);
      const iE = headerIndex(ah, ["estado_ia", "estado"]);
      const iR = headerIndex(ah, ["resultado_general", "resultado"]);
      const iU = headerIndex(ah, ["url", "imagen", "link", "enlace"]);
      for (let r = 1; r < av.length; r++) {
        const row = av[r]; if (!row) continue;
        const c = ncode(row[iC]); const u = iU >= 0 ? norm(row[iU]) : "";
        if (!c && !u) continue;
        if (isFood(c)) continue;   // excluir Food Service
        auditvision.push([c, iE >= 0 ? norm(row[iE]) : "", iR >= 0 ? norm(row[iR]) : "", u]);
      }
    }

    const clienteNom = allCodes.map((c) => baseNombre.get(c) || "");
    return {
      dicts: { vendedor: VD, supervisor: SD, region: RD, macrocanal: MAD, modelo: MOD, tarea: TLAB, semana: WEEKS, dia: DIAS },
      obj: objE, load: loadE, wk: wkE, dayrec: dayrecE, daytrend: dtE,
      clientes: allCodes, clienteNom,                 // cid -> código / nombre
      auditvision,                                    // [codigo, estado_ia, resultado, url]
      periodo, nclientes: allCodes.length, stats, planActivo: hasTaskCols,
      generado: new Date().toISOString(),
    };
  }

  function toDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(d) ? null : d; }
    const d = new Date(String(v)); return isNaN(d) ? null : d;
  }
  // clave de día ISO (YYYY-MM-DD) sin desfase de zona horaria
  function dayKey(v) {
    if (v == null || v === "") return "";
    const pad = (n) => String(n).padStart(2, "0");
    if (v instanceof Date) return isNaN(v) ? "" : v.getUTCFullYear() + "-" + pad(v.getUTCMonth() + 1) + "-" + pad(v.getUTCDate());
    if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(d) ? "" : d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
    const s = String(v).trim(); const m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + "-" + m[2] + "-" + m[3];
    const d = new Date(s); return isNaN(d) ? "" : d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  root.buildModel = buildModel;
  if (typeof module !== "undefined" && module.exports) module.exports = { buildModel };
})(typeof window !== "undefined" ? window : globalThis);
