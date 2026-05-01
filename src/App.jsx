import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `Eres el asistente de inteligencia artificial de Lexia, una plataforma SaaS para despachos de abogados en España. Tu función es atender a potenciales clientes del despacho, recopilar información sobre su caso y agendar una consulta.

COMPORTAMIENTO:
- Saluda de forma cálida y profesional
- Pregunta por el tipo de problema legal (civil, penal, laboral, mercantil, administrativo, familiar, etc.)
- Recoge el nombre, teléfono y disponibilidad horaria del cliente
- Explica brevemente qué puede hacer el despacho por ellos
- Siempre ofrece agendar una consulta
- Sé empático pero conciso. Máximo 3 frases por respuesta.
- Responde SIEMPRE en español
- Al final muestra resumen: NOMBRE, TIPO DE CASO, CONTACTO, DISPONIBILIDAD

RESTRICCIONES:
- No des asesoramiento jurídico concreto
- No menciones precios
- Si el usuario es inapropiado, redirige educadamente`;

const LEADS = [
  { id:1, name:"Carlos Fernández", type:"Laboral",   status:"nuevo",      time:"hace 2 min", phone:"612 345 678", desc:"Despido improcedente" },
  { id:2, name:"María González",   type:"Civil",     status:"contactado", time:"hace 1h",    phone:"698 123 456", desc:"Herencia en disputa" },
  { id:3, name:"Pedro Ruiz",       type:"Familiar",  status:"cita",       time:"hace 3h",    phone:"677 890 123", desc:"Divorcio mutuo acuerdo" },
  { id:4, name:"Ana Torres",       type:"Penal",     status:"nuevo",      time:"hace 5h",    phone:"654 321 987", desc:"Denuncia por estafa" },
  { id:5, name:"Luis Moreno",      type:"Mercantil", status:"contactado", time:"ayer",       phone:"611 222 333", desc:"Contrato societario" },
];
const CITAS = [
  { id:1, client:"Pedro Ruiz",   type:"Familiar", date:"Hoy",    time:"11:00", status:"confirmada" },
  { id:2, client:"Isabel Vega",  type:"Civil",    date:"Hoy",    time:"16:30", status:"confirmada" },
  { id:3, client:"Roberto Díaz", type:"Laboral",  date:"Mañana", time:"10:00", status:"pendiente"  },
  { id:4, client:"Carmen Soto",  type:"Penal",    date:"Mañana", time:"12:00", status:"confirmada" },
];
const DOCS = [
  { id:1, name:"Demanda laboral – Fernández",     date:"Hoy 09:14"   },
  { id:2, name:"Contrato arrendamiento – Torres", date:"Ayer 17:32"  },
  { id:3, name:"Escrito recurso – González",      date:"Hace 2 días" },
];
const STATUS_MAP = {
  nuevo:      { bg:"rgba(91,159,255,.18)",  text:"#5B9FFF", label:"Nuevo"      },
  contactado: { bg:"rgba(255,208,96,.18)",  text:"#FFD060", label:"Contactado" },
  cita:       { bg:"rgba(77,216,144,.18)",  text:"#4DD890", label:"Cita"       },
};
const AREA_COL = {
  Laboral:"#5B9FFF", Civil:"#00D4FF", Familiar:"#FF6B9D",
  Penal:"#FF6060", Mercantil:"#4DD890", Administrativo:"#FFD060",
};
const NAV = [
  { id:"dashboard",      icon:"⊞",  label:"Inicio"     },
  { id:"chatbot",        icon:"💬", label:"Asistente"  },
  { id:"agenda",         icon:"📅", label:"Agenda"     },
  { id:"documentos",     icon:"📄", label:"Documentos" },
  { id:"jurisprudencia", icon:"⚖️", label:"Jurisp."    },
  { id:"clientes",       icon:"👥", label:"Clientes"   },
];

/* ── tiny helpers ── */
function Ava({ name, color, size=36 }) {
  const ini = name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
  return <div style={{width:size,height:size,borderRadius:"50%",background:`${color}22`,border:`1.5px solid ${color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.7rem",fontWeight:700,color,flexShrink:0}}>{ini}</div>;
}
function StatusBadge({ s }) {
  const m = STATUS_MAP[s];
  return <span style={{fontSize:"0.65rem",background:m.bg,color:m.text,padding:"0.15rem 0.5rem",borderRadius:100,whiteSpace:"nowrap"}}>{m.label}</span>;
}
function SectionHead({ title, sub }) {
  return (
    <div style={{marginBottom:"1.2rem"}}>
      <h2 style={{fontFamily:"'Syne',system-ui,sans-serif",fontWeight:900,fontSize:"1.15rem",margin:0,letterSpacing:"-0.01em"}}>{title}</h2>
      {sub && <p style={{fontSize:"0.78rem",color:"#6B7A90",margin:"0.2rem 0 0"}}>{sub}</p>}
    </div>
  );
}

async function callAI(messages, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, system, messages })
  });
  const d = await res.json();
  return d.content?.[0]?.text || "Error. Inténtalo de nuevo.";
}

/* ══════════════════════════════════
   MAIN APP
══════════════════════════════════ */
export default function LexiaApp() {
  const [view, setView]         = useState("dashboard");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [msgs, setMsgs]         = useState([{ role:"assistant", content:"¡Hola! Soy el asistente jurídico de este despacho. ¿En qué puedo ayudarte hoy?" }]);
  const [chatIn, setChatIn]     = useState("");
  const [chatLoad, setChatLoad] = useState(false);
  const [docType, setDocType]   = useState("demanda");
  const [docIn, setDocIn]       = useState("");
  const [docOut, setDocOut]     = useState("");
  const [docLoad, setDocLoad]   = useState(false);
  const [jurIn, setJurIn]       = useState("");
  const [jurOut, setJurOut]     = useState("");
  const [jurLoad, setJurLoad]   = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);

  async function sendChat() {
    if (!chatIn.trim() || chatLoad) return;
    const txt = chatIn.trim(); setChatIn(""); setChatLoad(true);
    const next = [...msgs, { role:"user", content:txt }]; setMsgs(next);
    try {
      const r = await callAI(next.map(m=>({ role:m.role, content:m.content })), SYSTEM_PROMPT);
      setMsgs(p => [...p, { role:"assistant", content:r }]);
    } catch { setMsgs(p => [...p, { role:"assistant", content:"Error de conexión." }]); }
    setChatLoad(false);
  }
  async function genDoc() {
    if (!docIn.trim() || docLoad) return;
    setDocLoad(true); setDocOut("");
    try {
      const r = await callAI([{ role:"user", content:`Genera un borrador profesional de ${docType} según el derecho español: ${docIn}` }],
        "Eres abogado español experto. Genera documentos legales con formato correcto y estructura adecuada.");
      setDocOut(r);
    } catch { setDocOut("Error al generar."); }
    setDocLoad(false);
  }
  async function searchJur() {
    if (!jurIn.trim() || jurLoad) return;
    setJurLoad(true); setJurOut("");
    try {
      const r = await callAI([{ role:"user", content:`Consulta jurídica española: "${jurIn}". Indica: 1) Normativa aplicable con artículos concretos, 2) Jurisprudencia TS o Audiencias Provinciales, 3) Posición doctrinal mayoritaria.` }],
        "Eres experto en derecho español. Responde con precisión citando fuentes legales reales.");
      setJurOut(r);
    } catch { setJurOut("Error en la búsqueda."); }
    setJurLoad(false);
  }

  /* ── shared ui tokens ── */
  const card  = { background:"#0D1117", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, padding:"1.1rem", marginBottom:"1rem" };
  const cardGlow = { ...card, border:"1px solid rgba(45,126,248,.3)" };
  const inp   = { width:"100%", background:"#141C26", border:"1px solid rgba(255,255,255,.1)", borderRadius:10, padding:"0.75rem 1rem", color:"#E8EDF5", fontSize:"0.86rem", fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
  const label = { fontSize:"0.68rem", color:"#6B7A90", textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:"0.35rem" };
  const btnPrimary = (dis) => ({ background: dis ? "#1a2a40" : "#2D7EF8", border:"none", borderRadius:10, padding:"0.78rem 1.4rem", color: dis ? "#4A5568" : "#fff", cursor: dis ? "not-allowed" : "pointer", fontFamily:"inherit", fontWeight:700, fontSize:"0.86rem", transition:"all .15s", width:"100%" });

  /* ══ SCREENS ══ */

  const Dashboard = () => (
    <div>
      <SectionHead title="Buenos días, Letrado ⚖️" sub="Tu IA gestionó 7 consultas mientras dormías" />
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap:"0.7rem", marginBottom:"1.2rem" }}>
        {[
          { l:"Consultas hoy", v:"12", i:"💬", c:"#5B9FFF", d:"+3"  },
          { l:"Citas semana",  v:"8",  i:"📅", c:"#00D4FF", d:"+2"  },
          { l:"Docs generados",v:"5",  i:"📄", c:"#4DD890", d:"hoy" },
          { l:"Leads activos", v:"23", i:"👥", c:"#FFD060", d:"+7"  },
        ].map((s,i) => (
          <div key={i} style={{ background:"#0D1117", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"1rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.5rem" }}>
              <span style={{ fontSize:"1.1rem" }}>{s.i}</span>
              <span style={{ fontSize:"0.63rem", background:`${s.c}22`, color:s.c, padding:"0.12rem 0.42rem", borderRadius:100 }}>{s.d}</span>
            </div>
            <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontSize:"2rem", fontWeight:900, color:s.c, lineHeight:1 }}>{s.v}</div>
            <div style={{ fontSize:"0.7rem", color:"#6B7A90", marginTop:"0.25rem" }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"1rem" }}>
        {/* Leads */}
        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.8rem" }}>
            <span style={{ fontWeight:700, fontSize:"0.9rem" }}>Leads recientes</span>
            <button onClick={()=>setView("clientes")} style={{ fontSize:"0.72rem", color:"#5B9FFF", background:"none", border:"none", cursor:"pointer" }}>Ver todos →</button>
          </div>
          {LEADS.slice(0,4).map(l => (
            <div key={l.id} style={{ display:"flex", alignItems:"center", gap:"0.7rem", paddingBottom:"0.7rem", marginBottom:"0.7rem", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
              <Ava name={l.name} color={AREA_COL[l.type]||"#5B9FFF"} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:"0.84rem", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.name}</div>
                <div style={{ fontSize:"0.7rem", color:"#6B7A90" }}>{l.desc}</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <StatusBadge s={l.status} />
                <div style={{ fontSize:"0.6rem", color:"#6B7A90", marginTop:3 }}>{l.time}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Agenda hoy */}
        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.8rem" }}>
            <span style={{ fontWeight:700, fontSize:"0.9rem" }}>Agenda hoy</span>
            <button onClick={()=>setView("agenda")} style={{ fontSize:"0.72rem", color:"#5B9FFF", background:"none", border:"none", cursor:"pointer" }}>Ver agenda →</button>
          </div>
          {CITAS.filter(c=>c.date==="Hoy").map(c => (
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:"0.8rem", background:"#141C26", borderRadius:10, padding:"0.7rem", marginBottom:"0.5rem", border:"1px solid rgba(255,255,255,.05)" }}>
              <div style={{ textAlign:"center", minWidth:46, flexShrink:0 }}>
                <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:900, fontSize:"0.95rem", color:"#5B9FFF" }}>{c.time}</div>
                <div style={{ fontSize:"0.6rem", color:"#6B7A90" }}>60 min</div>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"0.84rem", fontWeight:500 }}>{c.client}</div>
                <div style={{ fontSize:"0.71rem", color:AREA_COL[c.type] }}>{c.type}</div>
              </div>
              <span style={{ fontSize:"0.65rem", background: c.status==="confirmada"?"rgba(77,216,144,.18)":"rgba(255,208,96,.18)", color: c.status==="confirmada"?"#4DD890":"#FFD060", padding:"0.18rem 0.5rem", borderRadius:100 }}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const Chatbot = () => {
    const chatHeight = isMobile ? "calc(100vh - 112px)" : "calc(100vh - 100px)";
    return (
      <div style={{ display:"flex", flexDirection:"column", height: chatHeight }}>
        <SectionHead title="Asistente IA 24/7" sub="Así ve tu cliente el chatbot. Pruébalo ahora mismo." />
        <div style={{ flex:1, background:"#0D1117", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* header */}
          <div style={{ padding:"0.8rem 1rem", borderBottom:"1px solid rgba(255,255,255,.07)", display:"flex", alignItems:"center", gap:"0.7rem", flexShrink:0 }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,#2D7EF8,#00D4FF)", display:"flex", alignItems:"center", justifyContent:"center" }}>⚖️</div>
            <div>
              <div style={{ fontWeight:600, fontSize:"0.86rem" }}>Asistente Jurídico</div>
              <div style={{ fontSize:"0.68rem", color:"#4DD890", display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ width:5, height:5, borderRadius:"50%", background:"#4DD890", display:"inline-block" }}></span>
                En línea · Responde al instante
              </div>
            </div>
          </div>
          {/* messages */}
          <div style={{ flex:1, overflow:"auto", padding:"0.9rem", display:"flex", flexDirection:"column", gap:"0.6rem" }}>
            {msgs.map((m,i) => (
              <div key={i} style={{ display:"flex", justifyContent: m.role==="user"?"flex-end":"flex-start", gap:"0.5rem", alignItems:"flex-end" }}>
                {m.role==="assistant" && <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,#2D7EF8,#00D4FF)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.62rem", flexShrink:0 }}>⚖️</div>}
                <div style={{ maxWidth:"76%", padding:"0.6rem 0.85rem", borderRadius: m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px", background: m.role==="user"?"#2D7EF8":"#141C26", border: m.role==="assistant"?"1px solid rgba(255,255,255,.07)":"none", fontSize:"0.84rem", lineHeight:1.65, whiteSpace:"pre-wrap" }}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoad && (
              <div style={{ display:"flex", gap:"0.5rem", alignItems:"flex-end" }}>
                <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,#2D7EF8,#00D4FF)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.62rem" }}>⚖️</div>
                <div style={{ padding:"0.6rem 0.9rem", borderRadius:"14px 14px 14px 4px", background:"#141C26", border:"1px solid rgba(255,255,255,.07)", display:"flex", gap:"0.3rem", alignItems:"center" }}>
                  {[0,1,2].map(d => <span key={d} style={{ width:5, height:5, borderRadius:"50%", background:"#5B9FFF", display:"inline-block", animation:`bonce 1s ${d*.2}s infinite` }}></span>)}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          {/* input */}
          <div style={{ padding:"0.7rem", borderTop:"1px solid rgba(255,255,255,.07)", display:"flex", gap:"0.5rem", flexShrink:0 }}>
            <input value={chatIn} onChange={e=>setChatIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Escribe tu consulta jurídica..." style={{ ...inp, flex:1 }} />
            <button onClick={sendChat} disabled={chatLoad} style={{ ...btnPrimary(chatLoad), width:"auto", padding:"0.75rem 1.2rem" }}>↑</button>
          </div>
        </div>
        <style>{`@keyframes bonce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}`}</style>
      </div>
    );
  };

  const Agenda = () => (
    <div>
      <SectionHead title="Agenda" sub="Citas gestionadas automáticamente por tu IA" />
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"1rem" }}>
        {["Hoy","Mañana"].map(day => (
          <div key={day}>
            <div style={{ fontSize:"0.75rem", fontWeight:700, color: day==="Hoy"?"#5B9FFF":"#E8EDF5", marginBottom:"0.6rem", textTransform:"uppercase", letterSpacing:"0.08em" }}>{day}</div>
            {CITAS.filter(c=>c.date===day).map(c => (
              <div key={c.id} style={{ display:"flex", gap:"0.8rem", background:"#0D1117", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"0.9rem", marginBottom:"0.6rem", alignItems:"center" }}>
                <div style={{ textAlign:"center", minWidth:50, flexShrink:0 }}>
                  <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:900, fontSize:"1rem", color:"#5B9FFF" }}>{c.time}</div>
                  <div style={{ fontSize:"0.6rem", color:"#6B7A90" }}>60 min</div>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:"0.88rem" }}>{c.client}</div>
                  <div style={{ fontSize:"0.72rem", color:AREA_COL[c.type] }}>{c.type}</div>
                  <div style={{ display:"flex", gap:"0.4rem", marginTop:"0.45rem" }}>
                    <button style={{ fontSize:"0.68rem", background:"rgba(45,126,248,.12)", border:"1px solid rgba(45,126,248,.25)", color:"#5B9FFF", padding:"0.2rem 0.55rem", borderRadius:6, cursor:"pointer" }}>Expediente</button>
                    <button style={{ fontSize:"0.68rem", background:"transparent", border:"1px solid rgba(255,255,255,.1)", color:"#6B7A90", padding:"0.2rem 0.55rem", borderRadius:6, cursor:"pointer" }}>Cancelar</button>
                  </div>
                </div>
                <span style={{ fontSize:"0.65rem", background: c.status==="confirmada"?"rgba(77,216,144,.18)":"rgba(255,208,96,.18)", color: c.status==="confirmada"?"#4DD890":"#FFD060", padding:"0.18rem 0.5rem", borderRadius:100, flexShrink:0 }}>{c.status}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  const Documentos = () => (
    <div>
      <SectionHead title="Generador de Documentos" sub="Demandas, contratos y escritos en segundos" />
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"1rem", alignItems:"start" }}>
        {/* form */}
        <div>
          <div style={card}>
            <div style={{ marginBottom:"0.7rem" }}>
              <span style={label}>Tipo de documento</span>
              <select value={docType} onChange={e=>setDocType(e.target.value)} style={{ ...inp }}>
                {["demanda","contrato","recurso de apelación","escrito procesal","burofax","poder notarial"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:"0.7rem" }}>
              <span style={label}>Describe el caso</span>
              <textarea value={docIn} onChange={e=>setDocIn(e.target.value)} placeholder="Ej: Trabajador despedido tras 8 años, salario 1.800€/mes, sin causa justificada..." rows={5} style={{ ...inp, resize:"vertical", lineHeight:1.65 }} />
            </div>
            <button onClick={genDoc} disabled={docLoad} style={btnPrimary(docLoad)}>{docLoad ? "Generando..." : "⚡ Generar documento"}</button>
          </div>
          <div style={card}>
            <div style={{ fontWeight:700, fontSize:"0.88rem", marginBottom:"0.7rem" }}>Recientes</div>
            {DOCS.map(d => (
              <div key={d.id} style={{ display:"flex", alignItems:"center", gap:"0.7rem", paddingBottom:"0.65rem", marginBottom:"0.65rem", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
                <span style={{ fontSize:"1.1rem" }}>📄</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"0.82rem", fontWeight:500 }}>{d.name}</div>
                  <div style={{ fontSize:"0.68rem", color:"#6B7A90" }}>{d.date}</div>
                </div>
                <button style={{ fontSize:"0.7rem", color:"#5B9FFF", background:"rgba(45,126,248,.1)", border:"1px solid rgba(45,126,248,.2)", padding:"0.22rem 0.6rem", borderRadius:6, cursor:"pointer" }}>↓</button>
              </div>
            ))}
          </div>
        </div>
        {/* result */}
        <div style={docOut || docLoad ? cardGlow : { ...card, opacity:.5 }}>
          <span style={label}>Borrador generado</span>
          <div style={{ fontSize:"0.82rem", lineHeight:1.8, color: docLoad ? "#6B7A90" : (docOut ? "#E8EDF5" : "#4A5568"), whiteSpace:"pre-wrap", minHeight:200, maxHeight: isMobile ? 300 : 480, overflow:"auto" }}>
            {docLoad ? "Generando documento legal..." : (docOut || "El borrador aparecerá aquí.\n\nDescribe el caso y pulsa «Generar».")}
          </div>
        </div>
      </div>
    </div>
  );

  const Jurisprudencia = () => (
    <div>
      <SectionHead title="Búsqueda Jurídica IA" sub="Normativa y jurisprudencia española al instante" />
      <div style={card}>
        <textarea value={jurIn} onChange={e=>setJurIn(e.target.value)} placeholder="Ej: ¿Cuándo prescribe la acción de reclamación de cantidad en arrendamiento?" rows={3} style={{ ...inp, resize:"none", lineHeight:1.65, marginBottom:"0.7rem" }} />
        <button onClick={searchJur} disabled={jurLoad} style={btnPrimary(jurLoad)}>{jurLoad ? "Buscando..." : "⚖️ Buscar jurisprudencia"}</button>
        <div style={{ display:"flex", gap:"0.4rem", flexWrap:"wrap", marginTop:"0.7rem" }}>
          {["Prescripción","Despido improcedente","Cláusula abusiva","Incapacidad temporal","Responsabilidad civil"].map(s => (
            <button key={s} onClick={()=>setJurIn(s)} style={{ fontSize:"0.68rem", background:"#141C26", border:"1px solid rgba(255,255,255,.1)", color:"#6B7A90", padding:"0.25rem 0.6rem", borderRadius:100, cursor:"pointer", fontFamily:"inherit" }}>{s}</button>
          ))}
        </div>
      </div>
      {(jurOut || jurLoad) && (
        <div style={cardGlow}>
          <span style={label}>Resultado</span>
          <div style={{ fontSize:"0.84rem", lineHeight:1.8, color: jurLoad ? "#6B7A90" : "#E8EDF5", whiteSpace:"pre-wrap" }}>
            {jurLoad ? "Consultando normativa española..." : jurOut}
          </div>
        </div>
      )}
    </div>
  );

  const Clientes = () => (
    <div>
      <SectionHead title="Clientes y Leads" sub="Captados automáticamente por tu asistente IA" />
      {isMobile ? (
        LEADS.map(l => (
          <div key={l.id} style={{ display:"flex", alignItems:"center", gap:"0.7rem", background:"#0D1117", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"0.9rem", marginBottom:"0.6rem" }}>
            <Ava name={l.name} color={AREA_COL[l.type]||"#5B9FFF"} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:"0.86rem", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.name}</div>
              <div style={{ fontSize:"0.71rem", color:AREA_COL[l.type] }}>{l.type} · {l.desc}</div>
              <div style={{ fontSize:"0.68rem", color:"#6B7A90", marginTop:"0.12rem" }}>{l.phone} · {l.time}</div>
            </div>
            <StatusBadge s={l.status} />
          </div>
        ))
      ) : (
        <div style={{ background:"#0D1117", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 110px 130px 130px 110px", padding:"0.75rem 1.2rem", borderBottom:"1px solid rgba(255,255,255,.07)", fontSize:"0.68rem", color:"#6B7A90", textTransform:"uppercase", letterSpacing:"0.08em" }}>
            <span>Cliente</span><span>Área</span><span>Estado</span><span>Teléfono</span><span>Recibido</span>
          </div>
          {LEADS.map(l => (
            <div key={l.id} style={{ display:"grid", gridTemplateColumns:"1fr 110px 130px 130px 110px", padding:"0.95rem 1.2rem", borderBottom:"1px solid rgba(255,255,255,.05)", alignItems:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"0.8rem" }}>
                <Ava name={l.name} color={AREA_COL[l.type]||"#5B9FFF"} />
                <div>
                  <div style={{ fontSize:"0.86rem", fontWeight:500 }}>{l.name}</div>
                  <div style={{ fontSize:"0.72rem", color:"#6B7A90" }}>{l.desc}</div>
                </div>
              </div>
              <span style={{ fontSize:"0.8rem", color:AREA_COL[l.type] }}>{l.type}</span>
              <StatusBadge s={l.status} />
              <span style={{ fontSize:"0.8rem", color:"#6B7A90" }}>{l.phone}</span>
              <span style={{ fontSize:"0.76rem", color:"#6B7A90" }}>{l.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const SCREENS = { dashboard:<Dashboard/>, chatbot:<Chatbot/>, agenda:<Agenda/>, documentos:<Documentos/>, jurisprudencia:<Jurisprudencia/>, clientes:<Clientes/> };

  /* ══ LAYOUT ══ */
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#080B10", color:"#E8EDF5", fontFamily:"'Instrument Sans','Segoe UI',sans-serif", overflow:"hidden" }}>

      {/* ── TOPBAR ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding: isMobile ? "0.75rem 1rem" : "0.85rem 1.5rem", background:"#0D1117", borderBottom:"1px solid rgba(255,255,255,.07)", flexShrink:0, zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
          <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:900, fontSize:"1.3rem", background:"linear-gradient(135deg,#fff,#00D4FF)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Lexia</div>
          {!isMobile && (
            <div style={{ fontSize:"0.78rem", color:"#6B7A90" }}>
              {NAV.find(n=>n.id===view)?.label} · Viernes, 1 de mayo de 2026
            </div>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"0.35rem", fontSize:"0.68rem", background:"rgba(77,216,144,.12)", border:"1px solid rgba(77,216,144,.25)", color:"#4DD890", padding:"0.2rem 0.6rem", borderRadius:100 }}>
            <span style={{ width:5, height:5, borderRadius:"50%", background:"#4DD890", display:"inline-block" }}></span>
            IA activa
          </div>
          <div style={{ fontSize:"0.68rem", background:"rgba(45,126,248,.15)", border:"1px solid rgba(45,126,248,.3)", color:"#5B9FFF", padding:"0.2rem 0.6rem", borderRadius:100 }}>Plan Pro</div>
          <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#2D7EF8,#00D4FF)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.72rem", fontWeight:700 }}>L</div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* DESKTOP SIDEBAR */}
        {!isMobile && (
          <div style={{ width:220, background:"#0D1117", borderRight:"1px solid rgba(255,255,255,.07)", display:"flex", flexDirection:"column", padding:"1.2rem 0.8rem", flexShrink:0 }}>
            <div style={{ fontSize:"0.65rem", letterSpacing:"0.12em", textTransform:"uppercase", color:"#6B7A90", marginBottom:"0.5rem", paddingLeft:"0.5rem" }}>Menú</div>
            {NAV.map(n => (
              <button key={n.id} onClick={()=>setView(n.id)} style={{ display:"flex", alignItems:"center", gap:"0.65rem", padding:"0.6rem 0.75rem", borderRadius:9, border:"none", cursor:"pointer", background: view===n.id ? "rgba(45,126,248,.12)" : "transparent", color: view===n.id ? "#5B9FFF" : "#6B7A90", fontSize:"0.84rem", textAlign:"left", marginBottom:2, transition:"all .15s", fontFamily:"inherit", width:"100%" }}>
                <span style={{ fontSize:"0.95rem" }}>{n.icon}</span>
                {n.label}
                {view===n.id && <span style={{ marginLeft:"auto", width:5, height:5, borderRadius:"50%", background:"#5B9FFF" }}></span>}
              </button>
            ))}
            <div style={{ marginTop:"auto", padding:"1rem 0.5rem 0", borderTop:"1px solid rgba(255,255,255,.07)" }}>
              <div style={{ fontSize:"0.72rem", color:"#6B7A90", marginBottom:"0.3rem" }}>Despacho Lepiani</div>
              <div style={{ fontSize:"0.7rem", color:"#4DD890" }}>⬤ &nbsp;Asistente IA activo</div>
            </div>
          </div>
        )}

        {/* CONTENT */}
        <div style={{ flex:1, overflow:"auto", padding: isMobile ? "0.9rem" : "1.8rem 2rem" }}>
          {SCREENS[view]}
        </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      {isMobile && (
        <div style={{ display:"flex", background:"#0D1117", borderTop:"1px solid rgba(255,255,255,.07)", flexShrink:0, paddingBottom:"env(safe-area-inset-bottom,0)" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={()=>setView(n.id)} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, padding:"0.45rem 0.2rem", background:"none", border:"none", cursor:"pointer", color: view===n.id ? "#5B9FFF" : "#4A5568", transition:"color .15s", fontFamily:"inherit" }}>
              <span style={{ fontSize:"1.05rem", lineHeight:1 }}>{n.icon}</span>
              <span style={{ fontSize:"0.56rem", letterSpacing:"0.02em" }}>{n.label}</span>
              {view===n.id && <span style={{ width:4, height:4, borderRadius:"50%", background:"#5B9FFF", display:"block" }}></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
